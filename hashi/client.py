import sys
import json
from collections import defaultdict

import zmq
from twisted.words.protocols import irc
from twisted.internet import protocol, reactor


class RemoteEventPublisher(object):
    def __init__(self, identity):
        context = zmq.Context.instance()
        self.identity = identity
        self.socket = context.socket(zmq.PUSH)
        self.socket.setsockopt(zmq.IDENTITY, identity)
        self.socket.connect("tcp://127.0.0.1:9911")

    def event(self, kind, *args):
        send = [self.identity, kind]
        send.extend(args)
        self.socket.send_multipart(send)


class Client(irc.IRCClient):
    def _get_nickname(self):
        return self.factory.nickname
    nickname = property(_get_nickname)
    
    def signedOn(self):
        self.publish = RemoteEventPublisher(self.factory.nickname)
        self.channels = list()
        self.join(self.factory.channel)
        self.publish.event("signedOn", self.nickname)
        
    def joined(self, channel):
        self.channels.append(channel)
        self.publish.event("joined", channel)

    def left(self, channel):
        self.channels.remove(channel)
        self.publish.event("left", channel)

    def privmsg(self, user, channel, msg):
        self.publish.event("privmsg", user, channel, msg)


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

    def start(self):
        for user, servers in self.config.items():
            for server, config in servers.items():
                chan = str(config["channels"][0])
                port = config["port"]
                client_f = ClientFactory(self, chan, str(user))
                reactor.connectTCP(server, port, client_f)

    def broadcast_event(self, identity, event):
        self.events.send_multipart([identity, " ", event])

if __name__ == "__main__":
    hashi = Hashi("config.json")
    hashi.start()

    reactor.run()
