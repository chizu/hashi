#!/usr/bin/env python
import time
from collections import namedtuple

import psycopg2
import zmq

Event = namedtuple('Event', ['kind', 'source', 'target', 'content',
                             'timestamp'])


class History(object):
    """Interact with client history for a network."""
    def __init__(self, irc_network):
        self.conn = psycopg2.connect("dbname=hashi")
        self.irc_network = irc_network

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
                identity, kind = event[:2]
                print("{0}:{1}:{2}".format(identity, kind, event[2:]))
                

            # Queries against the history
            if self.queries in socks and socks[self.queries] == zmq.POLLIN:
                pass

if __name__ == "__main__":
    r = RemoteEventReceiver()
    r.run()
