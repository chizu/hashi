#!/usr/bin/env python
import json
import urllib
from urlparse import parse_qs

from twisted.enterprise import adbapi
from twisted.internet import reactor
from twisted.web import server
from twisted.web.resource import Resource
from twisted.web.static import File
from twisted.web.rewrite import RewriterResource
from twisted.web.client import getPage
from zope.interface import implements


dbpool = adbapi.ConnectionPool("psycopg2", database='hashi')


class Hashioki(Resource):
    def getChild(self, name, request):
        if name == '':
            return self
        return Resource.getChild(self, name, request)


class API(Resource):
    """RESTful API

    Example URL: /freenode/#hashi/topic"""
    def getChild(self, name, request):
        if name == '':
            return self
        else:
            return Resource.getChild(self, name, request)

    def render_GET(self, request):
        return """<html><p>Should document the API here!</p></html>"""


class APISession(Resource):
    isLeaf = True

    def render_GET(self, request):
        """Return session uid."""
        return json.dumps(request.getSession().uid)


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
                print("existing user")
                print(failure)
                request.write(json.dumps(email))
                request.finish()
            def new_user(query_rows):
                print("new user")
                request.write(json.dumps(email))
                request.finish()
            d = dbpool.runOperation("INSERT INTO users (email) VALUES (%s)", 
                                    (email,))
            d.addCallback(new_user)
            d.addErrback(existing_user)
            return d
        else:
            request.setResponseCode(403)
            request.finish()
            
    def render_POST(self, request):
        """Handle logins from BrowserID"""
        assertion = request.args["assertion"]
        # Use the host header so that it doesn't matter where this is running
        audience = request.received_headers["host"]
        data = urllib.urlencode({"assertion": assertion, "audience": audience})
        # Post to BrowserID
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        p = getPage("https://browserid.org/verify", method='POST',
                    postdata=data, headers=headers)
        p.addCallback(self.verify_login, request)
        return server.NOT_DONE_YET


class APIWhoAmI(Resource):
    isLeaf = True
    
    def render_GET(self, request):
        session = request.getSession()
        if hasattr(session, "email"):
            return json.dumps(session.email)
        else:
            return json.dumps(None)


class APILogout(Resource):
    isLeaf = True

    def render_POST(self, request):
        """Handle logouts from BrowserID"""
        request.getSession().expire()
        return json.dumps(True)


class IRCNetwork(Resource):
    def getChild(self, name, request):
        if name == '':
            return self
        else:
            return IRCServer(name)
        
    def render_GET(self, request):
        return json.dumps(["sandbenders"])


class IRCServer(Resource):
    def __init__(self, name):
        Resource.__init__(self)
        self.name = name

    def getChild(self, name, request):
        if name == '':
            return self
        else:
            return IRCChannel(name)

    def render_GET(self, request):
        return json.dumps(request.irc_client.channels)


class IRCChannel(Resource):
    def __init__(self, name):
        Resource.__init__(self)
        self.name = name

    def getChild(self, name, request):
        if name == '':
            return self
        elif name == 'messages':
            return IRCChannelMessages(self.name)
        return Resource.getChild(self, name, request)

    def render_POST(self, request):
        request.irc_client.join(self.name)
        return ''


class IRCChannelMessages(Resource):
    isLeaf = True
    def __init__(self, name):
        Resource.__init__(self)
        self.name = name

    def render_GET(self, request):
        return str(request.irc_client.history[self.name])


def start():
    root = Hashioki()
    root.putChild('static', File('static'))

    rest_api = API()
    root.putChild('api', rest_api)
    rest_api.putChild('session', APISession())
    rest_api.putChild('login', APILogin())
    rest_api.putChild('whoami', APIWhoAmI())
    rest_api.putChild('logout', APILogout())
    irc_network = IRCNetwork()
    rest_api.putChild('networks', irc_network)

    site = server.Site(root)

    reactor.listenTCP(8080, site)

    return site


if __name__ == '__main__':
    site = start()
    reactor.run()
