import sys
import json

from twisted.words.protocols import irc
from twisted.internet import protocol, reactor

from web import start

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


if __name__ == "__main__":
    config_file = open(sys.argv[1])
    config = json.load(config_file)
    for user, servers in config.items():
        for server, config in servers.items():
            chan = str(config["channels"][0])
            port = config["port"]
            reactor.connectTCP(server, port, ClientFactory(chan, str(user)))

    site = start()

    reactor.run()
