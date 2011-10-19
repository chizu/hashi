import sys
import json

from twisted.words.protocols import irc
from twisted.internet import protocol, reactor

from web import start as web_start

class Client(irc.IRCClient):
    def _get_nickname(self):
        return self.factory.nickname
    nickname = property(_get_nickname)
    
    def signedOn(self):
        self.join(self.factory.channel)
        print("Signed on as {0}.".format(self.nickname))
        
    def joined(self, channel):
        print("Joined {0}.".format(channel))

    def privmsg(self, user, channel, msg):
        print(msg)


class ClientFactory(protocol.ClientFactory):
    protocol = Client

    def __init__(self, channel, nickname='hashi'):
        self.channel = channel
        self.nickname = nickname

    def clientConnectionLost(self, connector, reason):
        print("Lost connection ({0}), reconnecting.".format(reason))
        connector.connect()

    def clientConnectionFailed(self, connector, reason):
        print("Could not connect: {0}" % (reason))


class Hashi(object):
    def __init__(self, config_path):
        self.config = json.load(open(config_path))
        self.clients = dict()
        self.site = None

    def start(self):
        for user, servers in self.config.items():
            for server, config in servers.items():
                chan = str(config["channels"][0])
                port = config["port"]
                client = ClientFactory(chan, str(user))
                # This will break with more than one server, but works for now
                self.clients[str(user)] = client
                reactor.connectTCP(server, port, client)
        self.site = web_start(self.clients)

if __name__ == "__main__":
    hashi = Hashi("config.json")
    hashi.start()

    reactor.run()
