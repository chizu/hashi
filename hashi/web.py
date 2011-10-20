import json
from urlparse import parse_qs

from twisted.cred.portal import IRealm, Portal
from twisted.cred.checkers import FilePasswordDB
from twisted.internet import reactor
from twisted.web import server
from twisted.web.guard import HTTPAuthSessionWrapper, DigestCredentialFactory
from twisted.web.resource import Resource, IResource
from twisted.web.static import File
from twisted.web.rewrite import RewriterResource
from zope.interface import implements


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

    def render_POST(self, request):
        """Log out."""
        request.getSession().expire()
        return json.dumps(True)


class IRCNetwork(Resource):
    def getChild(self, name, request):
        if name == '':
            return self
        else:
            return IRCServer(name)
        
    def render_GET(self, request):
        return """<html><p>List of networks!</p></html>"""


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


def irc_rewriter(avatarId, client):
    def func(request):
        request.irc_nick = avatarId
        request.irc_client = client
    return func


class HashiUserRealm(object):
    implements(IRealm)

    def __init__(self, irc_clients, rest_api):
        self.irc_clients = irc_clients
        self.rest_api = rest_api

    def requestAvatar(self, avatarId, mind, *interfaces):
        if IResource in interfaces:
            client = self.irc_clients[avatarId]
            rewrite = RewriterResource(self.rest_api, 
                                       irc_rewriter(avatarId, client))
            return (IResource,
                    rewrite,
                    lambda: None)
        raise NotImplementedError()

def start(irc_clients):
    root = Hashioki()
    root.putChild('static', File('static'))

    rest_api = API()
    root.putChild('api', rest_api)
    rest_api.putChild('session', APISession())
    irc_network = IRCNetwork()
    rest_api.putChild('networks', irc_network)

    portal = Portal(HashiUserRealm(irc_clients, root), 
                    [FilePasswordDB('httpd.password')])
    credentialFactory = DigestCredentialFactory("md5", "localhost:8080")
    resource = HTTPAuthSessionWrapper(portal, [credentialFactory])

    site = server.Site(resource)

    reactor.listenTCP(8080, site)

    return site
