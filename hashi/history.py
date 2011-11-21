#!/usr/bin/env python
import time
from collections import namedtuple

import psycopg2
import zmq


psycopg2.extensions.register_type(psycopg2.extensions.UNICODE)
psycopg2.extensions.register_type(psycopg2.extensions.UNICODEARRAY)


Event = namedtuple('Event', ['kind', 'source', 'target', 'content',
                             'timestamp'])

history_registry = dict()
identity_registry = dict()


class Identity(object):
    def __new__(cls, history, token):
        print("Identity {0}".format(token))
        # Pull it out of cached objects if we can
        if token in identity_registry:
            return identity_registry[token]
        else:
            id_obj = object.__new__(cls, history, token)
            identity_registry[token] = id_obj
            return id_obj

    def __init__(self, history, token):
        self.history = history
        self.sql = history.sql
        self.token = token
        cur = self.sql.cursor()
        def get_identity():
            cur.execute("SELECT id FROM identities WHERE token = %s", (token,))
            return cur.fetchone()
        result = get_identity()
        if result:
            self.id = result[0]
        else:
            cur.execute("INSERT INTO identities (token) VALUES (%s)",
                        (token,))
            print("Inserting token {0}".format(token))
            self.id = get_identity()[0]
        self.sql.commit()
        identity_registry[self.token] = self


class NickIdentity(Identity):
    @classmethod
    def filter_token(cls, token):
        return token.split("!")[0]

    def __new__(cls, history, token):
        # After modifying the token, do exactly as Identity
        return Identity.__new__(NickIdentity, history, cls.filter_token(token))

    def __init__(self, history, token):
        token = NickIdentity.filter_token(token)
        super(NickIdentity, self).__init__(history, token)


class History(object):
    """Interact with client history for a network."""
    def __new__(cls, irc_network):
        # Pull it out of cached objects if we can
        if irc_network in history_registry:
            return history_registry[irc_network]
        else:
            h_obj = object.__new__(cls, irc_network)
            history_registry[irc_network] = h_obj
            return h_obj

    def __init__(self, irc_network):
        self.sql = psycopg2.connect("dbname=hashi")
        self.irc_network = irc_network
        cur = self.sql.cursor()
        cur.execute("SELECT id FROM networks WHERE name = %s", (irc_network,))
        result = cur.fetchone()
        if result:
            self.id = result[0]
        else:
            cur.execute("INSERT INTO networks (name) VALUES (%s)",
                        (irc_network,))
        # Done with setup, commit
        self.sql.commit()

    def record(self, identity, kind, args):
        cur = self.sql.cursor()
        record_sql = """INSERT INTO events (network_id, source, target, args)
VALUES (%s, %s, %s, %s);"""
        # Record each kind of message, with a fallback for unimplemented ones
        if kind == 'privmsg':
            source = NickIdentity(self, args[0]).id
            target = NickIdentity(self, args[1]).id
            cur.execute(record_sql, (self.id, source, target, args[2:]))
        else:
            # No formatter, stuff it all into the args column (to prevent loss)
            cur.execute(record_sql, (self.id, None, None, args))
        self.sql.commit()


class RemoteEventReceiver(object):
    def __init__(self):
        context = zmq.Context.instance()
        self.socket = context.socket(zmq.PULL)
        self.socket.bind("tcp://127.0.0.1:9911")
        self.queries = context.socket(zmq.REP)
        self.queries.bind("tcp://127.0.0.1:9922")
        self.poller = zmq.Poller()
        self.poller.register(self.socket, zmq.POLLIN)
        self.poller.register(self.queries, zmq.POLLIN)

    def run(self):
        while True:
            socks = dict(self.poller.poll())

            # New history
            if self.socket in socks and socks[self.socket] == zmq.POLLIN:
                event = [unicode(x) for x in self.socket.recv_multipart()]
                network, identity, kind = event[:3]
                args = event[3:]
                history = History(network)
                id_obj = NickIdentity(history, identity)
                history_registry[network].record(id_obj, kind, args)
                print("{0}:{1}:{2}:{3}".format(network, id_obj.token, kind, 
                                               args))

            # Queries against the history
            if self.queries in socks and socks[self.queries] == zmq.POLLIN:
                pass

if __name__ == "__main__":
    r = RemoteEventReceiver()
    r.run()
