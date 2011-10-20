import sys
import json
from collections import defaultdict

from twisted.words.protocols import irc
from twisted.internet import protocol, reactor

from web import start as web_start

class Client(irc.IRCClient):
    def _get_nickname(self):
        return self.factory.nickname
    nickname = property(_get_nickname)
    
    def signedOn(self):
        self.channels = list()
        self.history = defaultdict(list)
        self.factory.hashi.register_client(self)
        self.join(self.factory.channel)
        print("Signed on as {0}.".format(self.nickname))
        
    def joined(self, channel):
        self.channels.append(channel)
        print("Joined {0}.".format(channel))

    def left(self, channel):
        self.channels.remove(channel)
        print("Left {0}.".format(channel))

    def privmsg(self, user, channel, msg):
        nick = user.split('!')[0]
        self.history[channel].append("< {0}> {1}".format(nick,msg))
        print(user, channel, msg)


class ClientFactory(protocol.ClientFactory):
    protocol = Client

    def __init__(self, hashi, channel, nickname='hashi'):
        self.hashi = hashi
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
                client_f = ClientFactory(self, chan, str(user))
                reactor.connectTCP(server, port, client_f)
        self.site = web_start(self.clients)

    def register_client(self, client):
        # This will break with more than one server per nick, but works for now
        self.clients[client.nickname] = client

if __name__ == "__main__":
    hashi = Hashi("config.json")
    hashi.start()

    reactor.run()
