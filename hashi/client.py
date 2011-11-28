#!/usr/bin/env python
import sys
import json
from collections import defaultdict

from zmq.core import constants
from txZMQ import ZmqEndpoint
from twisted.internet import protocol, reactor
from twisted.internet.endpoints import TCP4ClientEndpoint, SSL4ClientEndpoint
from twisted.internet.ssl import ClientContextFactory
from twisted.words.protocols import irc

from connections import *


class RemoteEventPublisher(object):
    def __init__(self, network, identity):
        self.network = network
        self.identity = identity
        e = ZmqEndpoint("connect", "tcp://127.0.0.1:9911")
        self.socket = ZmqPushConnection(zmqfactory, identity, e)

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
        self.channels = list()
        self.publish = RemoteEventPublisher(self.network, self.nickname)
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

    def __init__(self, network, nickname='hashi'):
        self.network = network
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
        subject = self.clients[user]
        # If there's a server specified, pick that server here
        if server != "global":
            subject = subject[server]
        # Otherwise, the iterable subject means for all servers
        if command == 'connect':
            pass
        elif command == 'join':
            pass


class Hashi(object):
    def __init__(self, config_path):
        # Dict of all clients indexed by email
        self.clients = defaultdict(dict)
        self.config = json.load(open(config_path))
        e = ZmqEndpoint("connect", "tcp://127.0.0.1:9911")
        self.socket = HashiController(zmqfactory, e, self.clients)
        self.ssl_context = ClientContextFactory()

    def start(self):
        """Initialize the IRC client.

        Load existing configuration and join all clients."""
        start_sql = """SELECT user_email, hostname, port, ssl, nick
FROM servers JOIN server_configs ON (servers.id = server_configs.server_id)
WHERE server_configs.enabled = true;
"""
        d = dbpool.runQuery(start_sql)
        d.addCallback(self.server_init)
        return d

    def server_init(self, servers_config):
        for email, hostname, port, ssl, nick in servers_config:
            # We're reusing hostnames as network names for now
            client_f = ClientFactory(hostname, nick)
            if ssl:
                point = SSL4ClientEndpoint(reactor, hostname, port,
                                           self.ssl_context)
            else:
                point = TCP4ClientEndpoint(reactor, hostname, port)
            d = point.connect(client_f)
            d.addCallback(self.register_client, email)

    def register_client(self, client, email):
        self.clients[email][client.network] = client
        print("Registered '{0}' for user '{1}'".format(client.network, email))
        print(self.clients)


if __name__ == "__main__":
    hashi = Hashi("config.json")
    hashi.start()

    reactor.run()
