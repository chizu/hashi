import json
from urlparse import parse_qs

from twisted.cred.portal import IRealm, Portal
from twisted.cred.checkers import FilePasswordDB
from twisted.internet import reactor
from twisted.web import server
from twisted.web.guard import HTTPAuthSessionWrapper, DigestCredentialFactory
from twisted.web.resource import Resource, IResource
from twisted.web.rewrite import RewriterResource
from zope.interface import implements


class Hashioki(Resource):
    isLeaf = True

    def getChild(self, name, request):
        if name == '':
            return self
        return Resource.getChild(self, name, request)

    def render_GET(self, request):
        return """<html><p>If it existed, this would display the irc client for '{0}'.</p></html>""".format(request.irc_nick)


class Channel(Resource):
    isLeaf = True

    def render_GET(self, request):
        return json.dumps(request.irc_client.channels)

    def render_POST(self, request):
        chan_cmd = parse_qs(request.content.getvalue())
        for cmd, arg in chan_cmd.items():
            if cmd == "join":
                request.irc_client.join(arg[0])
            if cmd == "leave":
                request.irc_client.leave(arg[0])
        return ''


class Privmsg(Resource):
    isLeaf = True
    def render_POST(self, request):
        privmsg_cmd = parse_qs(request.content.getvalue())
        target = privmsg_cmd["target"][0]
        msg = privmsg_cmd["msg"][0]
        request.irc_client.msg(target, msg, 240)


class History(Resource):
    isLeaf = True

    def render_GET(self, request):
        print(request.irc_client.history)
        print(request.args["source"])
        return str(request.irc_client.history[request.args["source"][0]])


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
    rest_api = Hashioki()
    rest_api.putChild('channel', Channel())
    rest_api.putChild('privmsg', Privmsg())
    rest_api.putChild('history', History())

    portal = Portal(HashiUserRealm(irc_clients, rest_api), 
                    [FilePasswordDB('httpd.password')])
    credentialFactory = DigestCredentialFactory("md5", "localhost:8080")
    resource = HTTPAuthSessionWrapper(portal, [credentialFactory])

    site = server.Site(resource)

    reactor.listenTCP(8080, site)

    return site
