#!/usr/bin/env python
import time
from collections import namedtuple

import redis
import zmq

class Identity(object):
    def __init__(self, redis, group, token):
        self.redis = redis
        set_name = "identity:{group}".format(group=group)
        self.redis.sadd(set_name, token)
        self.token = token


Event = namedtuple('Event', ['kind', 'source', 'target', 'content',
                             'timestamp'])


class History(object):
    """Interact with client history for a network."""
    def __init__(self, irc_network):
        self.redis = redis.Redis()
        self.irc_network = irc_network

    def identity(self, token):
        return Identity(self.redis, self.irc_network, token)

    def add_event(self, identity, event):
        # Identity is the client that submitted this event
        event_id = self.new_event(event)
        self.observe_event(identity, event_id)
        return event_id

    def new_event(self, event):
        event_id = self.redis.incr("event.next")
        event_key = "event:{id}".format(id=event_id)
        self.redis.hmset(event_key, 
                         {"kind": event.kind,
                          "source": event.source.token,
                          "target": event.target.token,
                          "content": event.content,
                          "timestamp": event.timestamp})
        return event_id

    def get_event(self, event_id):
        event_key = "event:{id}".format(id=event_id)
        values = self.redis.hvals(event_key)
        return Event(*values)

    def get_observed_history(self, identity, length=40):
        key = "observed:{group}:{identity}".format(group=self.irc_network,
                                                   identity=identity.token)
        return (self.get_event(x) for x in self.redis.lrange(key, -40, -1))

    def observe_event(self, identity, event_id):
        key = "observed:{group}:{identity}".format(group=self.irc_network,
                                                   identity=identity.token)
        self.redis.rpush(key, event_id)


class RemoteEventReceiver(object):
    def __init__(self):
        context = zmq.Context.instance()
        self.socket = context.socket(zmq.PULL)
        self.socket.bind("tcp://127.0.0.1:9911")
        
    def dump_forever(self):
        while True:
            print(self.socket.recv_multipart())


if __name__ == "__main__":
    r = RemoteEventReceiver()
    r.dump_forever()
