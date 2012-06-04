#!/usr/bin/env python
import time
from collections import namedtuple

import unicodenazi
import psycopg2
import zmq
import json

from connections import database_config


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
        if hasattr(self, "history"):
            # Skip reinit if we already have.
            return
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
    def __init__(self, irc_network):
        print("called init")
        self.sql = psycopg2.connect(**database_config)
        self.irc_network = irc_network
        cur = self.sql.cursor()
        cur.execute("SELECT id FROM servers WHERE hostname = %s",
                    (irc_network,))
        result = cur.fetchone()
        if result:
            self.id = result[0]
        #else:
        #    cur.execute("INSERT INTO networks (name) VALUES (%s)",
        #                (irc_network,))
        # Done with setup, commit
        self.sql.commit()

    def record(self, event_id, email, identity, kind, timestamp, args):
        cur = self.sql.cursor()
        record_sql = """INSERT INTO events (id, network_id, source, target, args, observer_email, kind, timestamp)
VALUES (%s, %s, %s, %s, %s, %s, %s, timestamp 'epoch' + %s * INTERVAL '1 second');"""
        # Record each kind of message, with a fallback for unimplemented ones
        if kind == 'privmsg' or kind == 'action' or kind == 'notice'\
                or kind == 'userJoined' or kind == 'userLeft'\
                or kind == 'userRenamed':
            source = NickIdentity(self, args[0]).id
            target = NickIdentity(self, args[1]).id
            cur.execute(record_sql,
                        (event_id, self.id, source, target, args[2:],
                         email, kind, timestamp))
        elif kind == 'names':
            target = NickIdentity(self, args[0]).id
            cur.execute(record_sql,
                        (event_id, self.id, None, target, args[1:],
                         email, kind, timestamp))
        else:
            # No formatter, stuff it all into the args column (to prevent loss)
            cur.execute(record_sql, (event_id, self.id, None, None, 
                                     args, email, kind, timestamp))
        self.sql.commit()


class RemoteEventReceiver(object):
    def __init__(self):
        context = zmq.Context.instance()
        self.clients = context.socket(zmq.PULL)
        self.clients.bind("tcp://127.0.0.1:9913")
        self.listeners = context.socket(zmq.PUB)
        self.listeners.bind("tcp://127.0.0.1:9914")

    def run(self):
        while True:
            event = self.clients.recv_multipart()
            email, event_id, network, identity, kind, timestamp = event[:6]
            args = event[6:]
            if network not in history_registry:
                history_registry[network] = History(network)
            this = history_registry[network]
            id_obj = NickIdentity(this, identity)
            this.record(event_id, email, id_obj, kind, timestamp, args)
            # Publish it for listening clients
            publish = json.dumps({"event_id":event_id,
                                  "network":network,
                                  "identity":identity,
                                  "kind":kind,
                                  "args":args,
                                  "timestamp":timestamp})
            self.listeners.send_multipart([email, publish])

            print("{0}:{1}:{2}:{3}:{4}".format(network, id_obj.token, kind, 
                                               args, timestamp))

if __name__ == "__main__":
    r = RemoteEventReceiver()
    r.run()
