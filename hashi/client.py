#!/usr/bin/env python
import sys
import json
from collections import defaultdict

from zmq.core import constants
from txZMQ import ZmqFactory, ZmqEndpoint, ZmqConnection
from twisted.words.protocols import irc
from twisted.internet import protocol, reactor


class ZmqPushConnection(ZmqConnection):
    socketType = constants.PUSH
    def __init__(self, factory, identity, *endpoints):
        self.identity = identity
        super(ZmqPushConnection, self).__init__(factory, *endpoints)


class ZmqPullConnection(ZmqConnection):
    socketType = constants.PULL


class RemoteEventPublisher(object):
    def __init__(self, zf, network, identity):
        self.network = network
        self.identity = identity
        e = ZmqEndpoint("connect", "tcp://127.0.0.1:9911")
        self.socket = ZmqPushConnection(zf, identity, e)

    def event(self, kind, *args):
        send = [self.network, self.identity, kind]
        send.extend(args)
        for i, value in enumerate(send):
            if isinstance(value, unicode):
                send[i] = value.encode("utf-8")
        self.socket.send(send)


class Client(irc.IRCClient):
    @property
    def nickname(self):
        return self.factory.nickname

    @property
    def network(self):
        return self.factory.network

    def signedOn(self):
        zf = self.factory.hashi.zf
        self.publish = RemoteEventPublisher(zf, self.network, self.nickname)
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

    def __init__(self, hashi, network, channel, nickname='hashi'):
        self.hashi = hashi
        self.network = network
        self.channel = channel
        self.nickname = nickname

    def clientConnectionLost(self, connector, reason):
        print("Lost connection ({0}), reconnecting.".format(reason))
        connector.connect()

    def clientConnectionFailed(self, connector, reason):
        print("Could not connect: {0}" % (reason))


class HashiController(ZmqPullConnection):
    def __init__(self, zf, e, clients):
        self.clients = clients
        super(HashiController, self).__init__(zf, e)
        
    def messageReceived(self, message):
        """Protocol is this:

        Servers control: {user} global {command}
        Connection control: {user} {server} {command}
        """
        user, server = message[:2]
        command = message[2:]

class Hashi(object):
    def __init__(self, config_path):
        self.config = json.load(open(config_path))
        e = ZmqEndpoint("connect", "tcp://127.0.0.1:9911")
        self.zf = ZmqFactory()
        self.socket = HashiController(self.zf, e, )

    def start(self):
        for user, servers in self.config.items():
            for server, config in servers.items():
                chan = str(config["channels"][0])
                port = config["port"]
                client_f = ClientFactory(self, server, chan, str(user))
                reactor.connectTCP(server, port, client_f)


if __name__ == "__main__":
    hashi = Hashi("config.json")
    hashi.start()

    reactor.run()
