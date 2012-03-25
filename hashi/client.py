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

e = ZmqEndpoint("connect", "tcp://127.0.0.1:9913")
event_publisher = ZmqPushConnection(zmqfactory, "client", e)

class RemoteEventPublisher(object):
    def __init__(self, network, identity, email):
        self.network = network
        self.identity = identity
        self.email = email
        event_id_sql = """SELECT max(events.id)
FROM events
JOIN servers ON (servers.id = events.network_id)
WHERE events.observer_email = %s AND servers.hostname = %s;
"""
        # Deferred for finishing init
        self.init = dbpool.runQuery(event_id_sql, (self.email, self.network))
        def finish(l):
            self.current_id = (l[0][0] or 0)
        self.init.addCallback(finish)

    def event(self, kind, *args):
        if not hasattr(self, "current_id"):
            # Don't know what ID to use yet, handle events later
            def retry(caller):
                self.event(kind, *args)
            self.init.addCallback(retry)
            return
        self.current_id += 1
        send = [self.email, str(self.current_id), self.network,
                self.identity, kind]
        send.extend(args)
        print(send)
        for i, value in enumerate(send):
            if isinstance(value, unicode):
                send[i] = value.encode("utf-8")
        event_publisher.send(send)


class Client(irc.IRCClient):
    @property
    def email(self):
        return self.factory.email

    @property
    def nickname(self):
        return self.factory.nickname

    @property
    def network(self):
        return self.factory.network

    def signedOn(self):
        self.channels = list()
        self.publish = RemoteEventPublisher(self.network, self.nickname, self.email)
        self.publish.event("signedOn", self.nickname)
        def initial_join(l):
            for channel in l:
                self.join(channel[0], channel[1] or None)
        # Join channels
        join_sql = """SELECT name, key
FROM channel_configs
JOIN servers ON (servers.id = channel_configs.server_id)
WHERE enabled = true AND user_email = %s AND servers.hostname = %s;
"""
        d = dbpool.runQuery(join_sql, (self.email, self.network))
        d.addCallback(initial_join)
        
    def joined(self, channel):
        self.channels.append(channel)
        self.publish.event("joined", channel)

    def left(self, channel):
        self.channels.remove(channel)
        self.publish.event("left", channel)

    def msg(self, target, msg, length=None):
        ret = irc.IRCClient.msg(self, target, msg, length)
        self.publish.event("privmsg", self.nickname, target, msg)
        return ret

    def privmsg(self, user, channel, msg):
        self.publish.event("privmsg", user, channel, msg)

    def action(self, user, channel, msg):
        self.publish.event("action", user, channel, msg)


class ClientFactory(protocol.ClientFactory):
    protocol = Client

    def __init__(self, email, network, nickname='hashi'):
        self.email = email
        self.network = network
        self.nickname = nickname

    def clientConnectionLost(self, connector, reason):
        print("Lost connection ({0}), reconnecting.".format(reason))
        connector.connect()

    def clientConnectionFailed(self, connector, reason):
        print("Could not connect: {0}" % (reason))


class HashiController(ZmqPullConnection):
    def __init__(self, zf, e, hashi):
        self.hashi = hashi
        super(HashiController, self).__init__(zf, e)

    def connectCallback(self, rows, user, nick):
        hostname, port, ssl = rows[0]
        self.hashi.server_connect(user, hostname, port, ssl, nick)

    def joinCallback(self, rows, server):
        server.join(*rows[0])

    def messageReceived(self, message):
        """Protocol is this:

        Servers control: {user} global {command} {arguments...}
        Connection control: {user} {server} {command} {arguments...}
        """
        print("Controller message: {0}".format(message))
        user, server = message[:2]
        command = message[2]
        if len(message) >= 3:
            command_args = message[3:]
        else:
            command_args = None
        subject = self.hashi[user]
        # If there's a server specified, pick that server here
        if server != "global":
            subject = subject[server]
        # Otherwise, the iterable subject means for all servers
        if command == 'connect':
            # Arguments are 'hostname nick'
            start_sql = """SELECT hostname, port, ssl
FROM servers WHERE hostname = %s;"""
            d = dbpool.runQuery(start_sql, (hostname,))
            d.addCallback(self.connectCallback, user, nick)
        elif command == 'join':
            # Arguments are 'channel [key]'
            subject.join(*command_args[:2])
        elif command == 'msg':
            # Arguments are 'target message ...'
            target = command_args[0]
            subject.msg(target, command_args[1], 500 - len(target))


class Hashi(object):
    def __init__(self):
        # Dict of all clients indexed by email
        self.clients = defaultdict(dict)
        e = ZmqEndpoint("bind", "tcp://127.0.0.1:9912")
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
            self.server_connect(email, hostname, port, ssl, nick)

    def server_connect(self, email, hostname, port, ssl, nick):
        # We're reusing hostnames as network names for now
        client_f = ClientFactory(email, hostname, nick)
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
    hashi = Hashi()
    hashi.start()

    reactor.run()
