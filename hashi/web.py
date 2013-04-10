#!/usr/bin/env python
import json
import urllib
from urlparse import parse_qs
from functools import wraps

from psycopg2 import IntegrityError, errorcodes
from txzmq import ZmqEndpoint
from twisted.internet import reactor
from twisted.web import server
from twisted.web.resource import Resource
from twisted.web.static import File
from twisted.web.client import getPage
from websocket import WebSocketHandler, WebSocketSite
from zope.interface import implements

from connections import *
from db import dbpool
irc_end = ZmqEndpoint("connect", "tcp://127.0.0.1:9912")
irc_client = ZmqPushConnection(zmqfactory, "hashi-web", irc_end)


def jtype(json_type="error", objects={}):
    """Mini-wrapper for the conventional json type structure."""
    return json.dumps({json_type: objects})


def get_any(request, key):
    try:
        # Look at request content
        query_json = json.loads(request.content.read())
        value = query_json[key]
    except ValueError:
        # Or failing that, GET arguments
        try:
            value = request.args[key][0]
        except KeyError:
            # Key not present in either
            return None
    return value


def require_login(func):
    @wraps(func)
    def wrapped(self, request):
        session = request.getSession()
        if hasattr(session, 'email') and session.email == 'chizu@spicious.com':
            return func(self, request, session)
        else:
            request.setResponseCode(401)
            return json.dumps({"error": {"message": "must be logged in"}})
    return wrapped


def parse_cookies(cookie_text):
    """Turn raw cookie text into a dictionary of values."""
    cookies = {}
    for cookie in cookie_text.split(';'):
        try:
            k, v = cookie.strip().split('=', 1)
            cookies[k] = v
        except ValueError:
            pass
    return cookies


class LongSession(server.Session):
    sessionTimeout = 60 * 60 * 24 * 7


class Hashioki(Resource):
    def getChild(self, name, request):
        if name == '':
            return self
        return Resource.getChild(self, name, request)

    def render_GET(self, request):
        return """<a href="api/">API</a><br /><a href="static/">Client</a>"""


class API(Resource):
    """RESTful API

    Example URL: /network/irc.freenode.org/#hashi/topic"""
    def getChild(self, name, request):
        if name == '':
            return self
        else:
            return Resource.getChild(self, name, request)

    def render_GET(self, request):
        return """<html><p>Should document the API here!</p></html>"""


class EventController(ZmqSubConnection):
    def __init__(self, email, websocket):
        self.email = email
        self.websocket = websocket
        self.queued = list()
        endpoint = ZmqEndpoint("connect", "tcp://127.0.0.1:9914")
        super(EventController, self).__init__(zmqfactory, endpoint)
        self.subscribe(self.email)

    def sync(self):
        for each in self.queued:
            self.websocket.transport.write(each)
        self.queued = list()

    def gotMessage(self, message, tag):
        if self.websocket.session:
            reply = message[0]
            self.websocket.transport.write(reply)
        else:
            self.queued.append(message[0])


class APISocket(WebSocketHandler):
    controllers = dict()

    def connectionMade(self):
        self.email = None
        self.session = None

    def connectionLost(self, reason):
        if self.session in APISocket.controllers:
            ec = APISocket.controllers.pop(self.session)
            ec.shutdown()
        self.email = None
        self.session = None

    def frameReceived(self, frame):
        if not self.email:
            cookies = parse_cookies(frame)
            if "TWISTED_SESSION" in cookies:
                site_sessions = self.transport._request.site.sessions
                session_key = cookies["TWISTED_SESSION"]
                if session_key in site_sessions:
                    email = site_sessions[session_key].email
                    utf_email = email.encode('utf-8')
                    ec = EventController(utf_email, self)
                    APISocket.controllers[session_key] = ec
                    self.email = email
                    self.session = session_key
        else:
            # In a valid session
            print("Authenticated for {0}: {1}".format(self.email, frame))
            if frame == "sync":
                APISocket.controllers[self.session].sync()


class APILogin(Resource):
    isLeaf = True

    def verify_login(self, browserid, request):
        """Verify the BrowserID request was successful"""
        login = json.loads(browserid)
        if login["status"] == "okay":
            email = login["email"]
            request.getSession().email = email
            def existing_user(failure):
                # Don't have to do much, just end the request
                print(failure)
                request.write(json.dumps(email))
                request.finish()
            def new_user(query_rows):
                request.write(json.dumps(email))
                request.finish()
            d = dbpool.runOperation("INSERT INTO users (email) VALUES (%s)", 
                                    (email,))
            d.addCallback(new_user)
            d.addErrback(existing_user)
            return d
        else:
            print("Failed login: {0}".format(login))
            request.setResponseCode(403)
            request.finish()
            
    def render_POST(self, request):
        """Handle logins from BrowserID"""
        assertion = request.args["assertion"][0]
        # Use the host header so that it doesn't matter where this is running
        audience = "https://" + request.received_headers["host"]
        data = urllib.urlencode({"assertion": assertion, "audience": audience})
        # Post to BrowserID
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        p = getPage("https://browserid.org/verify", method='POST',
                    postdata=data, headers=headers)
        p.addCallback(self.verify_login, request)
        return server.NOT_DONE_YET


class APISession(Resource):
    isLeaf = True
    
    def render_GET(self, request):
        session = request.getSession()
        # The session is valid if we have stored a BrowserID email
        if hasattr(session, "email"):
            return json.dumps({"session":{"uid":session.uid,
                                          "email":session.email}})
        else:
            return json.dumps({})


class APILogout(Resource):
    isLeaf = True

    def render_POST(self, request):
        """Handle logouts from BrowserID"""
        request.getSession().expire()
        return json.dumps(True)


class IRCNetwork(Resource):
    def list_servers(self, server_list, request):
        servers = [dict(zip(("email", "hostname", "port", "ssl", "nick"), x))
                   for x in server_list]
        if server_list:
            request.write(json.dumps({"network":servers}))
        else:
            request.write(json.dumps(None))
        request.finish()

    @require_login
    def render_GET(self, request, session):
        list_sql = """SELECT user_email, hostname, port, ssl, nick
FROM servers LEFT JOIN server_configs ON (servers.id = server_configs.server_id);"""
        d = dbpool.runQuery(list_sql)
        d.addCallback(self.list_servers, request)
        return server.NOT_DONE_YET

    def add_server(self, added, request):
        request.write(json.dumps(True))
        request.finish()

    def add_server_error(self, failure, request):
        if type(failure.value) is IntegrityError and\
                failure.value.pgcode == errorcodes.UNIQUE_VIOLATION:
            # Conflict is probably what went wrong
            request.setResponseCode(409)
            request.write(json.dumps("already exists"))
        else:
            # Unknown failures
            request.setResponseCode(500)
            request.write(json.dumps("unknown error"))
        request.finish()                  

    def render_POST(self, request):
        print("Adding new server: {0}".format(str(request.args)))
        new_sql = """INSERT INTO servers (hostname, port, ssl)
VALUES (%s, %s, %s)"""
        hostname = request.args["hostname"][0]
        # Cast to int seems required? Should use JSON maybe to avoid this...
        port = request.args["port"][0]
        if "ssl" in request.args:
            ssl = True
        else:
            ssl = False
        d = dbpool.runOperation(new_sql,
                                (hostname, port, ssl))
        d.addCallback(self.add_server, request)
        d.addErrback(self.add_server_error, request)
        return server.NOT_DONE_YET


class IRCServer(Resource):
    def __init__(self, hostname=None):
        Resource.__init__(self)
        self.hostname = hostname

    def getChild(self, hostname, request):
        if hostname == '':
            return self
        else:
            return IRCServer(hostname)

    def connect_server(self, result, request, nick):
        email = request.getSession().email
        # Tell the IRC client when a server is added so it can refresh
        irc_client.send([str(email), "global", "connect", self.hostname,
                         str(nick)])
        # Maybe this should be in a callback?
        # Refreshing the web interface here will sometimes be too fast.
        # Timing bugs!
        request.write(json.dumps(True))
        request.finish()

    @require_login
    def render_POST(self, request, session):
        print("Requested connection to {0}".format(self.hostname))
        email = session.email
        nick = request.args["nick"][0]
        enabled = (request.args["enabled"][0] == "true")
        # Upsert is fancy...
        connect_sql = """
UPDATE server_configs SET enabled = true
WHERE user_email = %s
AND server_id = (SELECT server_id FROM servers WHERE hostname = %s);

INSERT INTO server_configs (user_email, server_id, nick, enabled)
SELECT %s, servers.id, %s, %s
FROM servers
WHERE hostname = %s
AND NOT EXISTS (SELECT 1 FROM server_configs 
                WHERE user_email = %s AND server_id = servers.id);"""
        d = dbpool.runOperation(connect_sql,
                                (email, # UPDATE
                                 self.hostname, # UPDATE subquery
                                 email, nick, True, self.hostname, # INSERT
                                 email)) # INSERT subquery
        d.addCallback(self.connect_server, request, nick)
        return server.NOT_DONE_YET


class IRCChannel(Resource):
    def __init__(self, name=None):
        Resource.__init__(self)
        self.name = name

    def getChild(self, name, request):
        if name == '':
            return self
        else:
            return IRCChannel(name)

    @require_login
    def render_GET(self, request, session):
        """List of channels by default"""
        def render_channels(l):
            payload = jtype("channel", 
                            [{'server_id': row[0], 'name':row[1]}
                             for row in l])
            request.write(payload)
            request.finish()
        chan_sql = """SELECT server_id, name FROM channels"""
        server_hostname = get_any(request, "hostname")
        server_id = get_any(request, "server_id")
        if server_hostname and not server_id:
            chan_sql += """
JOIN servers ON channels.server_id = servers.id
WHERE user_email = %s AND hostname = %s AND enabled = true
ORDER BY name;"""
            sql_args = (session.email, server_hostname)
        elif server_id and not server_hostname:
            chan_sql += """
WHERE user_email = %s AND server_id = %s AND enabled = true
ORDER BY name;"""
            sql_args = (session.email, server_id)
        elif server_id and server_hostname:
            return jtype(objects={"message": 
                   "Needs either a server_id or hostname but not both."})
        else:
            chan_sql += """
WHERE user_email = %s AND enabled = true
ORDER BY name;"""
            sql_args = (session.email,)
        d = dbpool.runQuery(chan_sql, sql_args)
        d.addCallback(render_channels)
        return server.NOT_DONE_YET

    @require_login
    def render_POST(self, request, session):
        """Join a channel"""
        email = session.email
        # Issue the client command
        client_cmd = [email.encode("utf-8"),
                      self.server, "join",
                      self.name.encode("utf-8")]
        message_json = json.loads(request.content.read())
        if "key" in message_json:
            key = message_json["key"]
            client_cmd.append(key.encode("utf-8"))
        else:
            key = None
        irc_client.send(client_cmd)
        # Save to the database
        d = dbpool.runOperation("INSERT INTO channels (user_email, name, server_id, key) VALUES (%s, %s, (SELECT id FROM servers WHERE hostname = %s), %s)",
                                (email, self.name, self.server, key))
        def finished(result):
            request.write(json.dumps(True))
            request.finish()
        d.addCallback(finished)
        return server.NOT_DONE_YET


class IRCMessage(Resource):
    isLeaf = True
    def __init__(self, event_id=None):
        Resource.__init__(self)
        self.event_id = event_id

    def getChild(self, event_id, request):
        if event_id == '':
            return self
        else:
            return IRCMessages(event_id)

    @require_login
    def render_GET(self, request, session):
        """Channel history"""
        def render_messages(l):
            payload = jtype("message", 
                            [{'id': row[0], 'source':row[1], 'args':row[2],
                              'kind': row[3], 'timestamp':row[4]} 
                             for row in l])
            request.write(payload)
            request.finish()
        channel = get_any(request, "channel")
        msg_sql = """SELECT events.id, source_identities.token, events.args[0:1], events.kind, to_char(events.timestamp, 'IYYY:MM:DD-HH24:MI:SS')
FROM identities
RIGHT OUTER JOIN events on (events.target = identities.id)
JOIN identities as source_identities on (events.source = source_identities.id)
WHERE (identities.token ILIKE %s 
       OR (events.target IS NULL AND %s ILIKE ANY(events.args)))
AND events.observer_email = %s
"""
        query_args = [channel, channel, session.email]
        before_sql = "\nAND events.id < %s"
        count_sql = "\nORDER BY events.id DESC LIMIT %s;"
        if "before" in request.args:
            before = int(request.args["before"][0])
            msg_sql += before_sql
            query_args.append(before)
        if "count" in request.args:
            count = max(0, min(int(request.args["count"][0]), 1000))
        else:
            count = 100
        msg_sql += count_sql
        query_args.append(count)
        d = dbpool.runQuery(msg_sql, query_args)
        d.addCallback(render_messages)
        return server.NOT_DONE_YET

    @require_login
    def render_POST(self, request, session):
        #request.responseHeaders.addRawHeader("Content-Type", "application/json")
        message_json = json.loads(request.content.read())
        client_cmd = [session.email.encode('utf-8'),
                      self.server,
                      message_json['kind'].encode('utf-8'),
                      self.name,
                      message_json['privmsg'].encode('utf-8')]
        print(client_cmd)
        irc_client.send(client_cmd)
        return json.dumps(True)


class IRCUser(Resource):
    isLeaf = True
    def __init__(self, name=None):
        Resource.__init__(self)
        self.name = name

    def getChild(self, name, request):
        if name == '':
            return self
        else:
            return IRCUser(name)

    @require_login
    def render_GET(self, request, session):
        def render_names(l):
            request.write(json.dumps(l[0][0]))
            request.finish()
        names_sql = """SELECT akeys(users) FROM channels WHERE name ILIKE %s;"""
        d = dbpool.runQuery(names_sql, (self.name,))
        d.addCallback(render_names)
        return server.NOT_DONE_YET


class IRCTopic(Resource):
    def __init__(self, channel=None):
        Resource.__init__(self)
        if channel:
            self.isLeaf = True
        self.channel = channel

    def getChild(self, channel, request):
        if channel == '':
            return self
        else:
            return IRCTopic(channel)

    @require_login
    def render_GET(self, request, session):
        def render_topic(l):
            payload = jtype('topic',
                            [{'topic': row[0], 'channel':row[1], 
                              'server_id':row[2]} 
                             for row in l])
            request.write(payload)
            request.finish()
        topic_sql = """SELECT topic, name, server_id FROM channels"""
        if self.channel:
            topic_sql += """ WHERE name ILIKE %s;"""
        else:
            topic_sql += """;"""
        d = dbpool.runQuery(topic_sql, (self.channel,))
        d.addCallback(render_topic)
        return server.NOT_DONE_YET

            
def start():
    root = Hashioki()
    root.putChild('static', File('static'))

    rest_api = API()
    root.putChild('api', rest_api)
    # Application logic
    rest_api.putChild('session', APISession())
    rest_api.putChild('login', APILogin())
    rest_api.putChild('logout', APILogout())
    # IRC objects
    rest_api.putChild('network', IRCNetwork())
    rest_api.putChild('server', IRCServer())
    rest_api.putChild('channel', IRCChannel())
    rest_api.putChild('message', IRCMessage())
    rest_api.putChild('topic', IRCTopic())
    rest_api.putChild('user', IRCUser())
    # Special case for building our web socket
    site = WebSocketSite(root)
    site.addHandler('/api/websocket', APISocket)
    site.sessionFactory = LongSession

    reactor.listenTCP(8080, site)

    return site


if __name__ == '__main__':
    site = start()
    reactor.run()
