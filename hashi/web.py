from twisted.cred.portal import IRealm, Portal
from twisted.cred.checkers import FilePasswordDB
from twisted.internet import reactor
from twisted.web import server
from twisted.web.guard import HTTPAuthSessionWrapper, DigestCredentialFactory
from twisted.web.resource import Resource, IResource
from zope.interface import implements


class Hashioki(Resource):
    isLeaf = True

    def __init__(self, nick, client):
        Resource.__init__(self)
        self.nick = nick
        self.client = client
        
    def render_GET(self, request):
        return """<html><p>If it existed, this would display the irc client for '{0}'.</p></html>""".format(self.nick)

class HashiUserRealm(object):
    implements(IRealm)

    def __init__(self, irc_clients):
        self.irc_clients = irc_clients

    def requestAvatar(self, avatarId, mind, *interfaces):
        if IResource in interfaces:
            return (IResource,
                    Hashioki(avatarId, self.irc_clients[avatarId]),
                    lambda: None)
        raise NotImplementedError()

def start(irc_clients):
    portal = Portal(HashiUserRealm(irc_clients), 
                    [FilePasswordDB('httpd.password')])
    credentialFactory = DigestCredentialFactory("md5", "localhost:8080")
    resource = HTTPAuthSessionWrapper(portal, [credentialFactory])

    site = server.Site(resource)

    reactor.listenTCP(8080, site)

    return site
