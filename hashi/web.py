from twisted.internet import reactor
from twisted.web.resource import Resource
from twisted.web import server


class Hashioki(Resource):
    isLeaf = True
    def __init__(self, clients=None):
        Resource.__init__(self)
        self.clients = clients
        
    def render_GET(self, request):
        return """<html><p>If it existed, this would display the irc client.
</p></html>"""


def start():
    root = Hashioki()
    site = server.Site(root)
    reactor.listenTCP(8080, site)
    return site
