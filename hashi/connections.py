import types

from zmq.core import constants
import txzmq
from txzmq import ZmqFactory, ZmqConnection
from twisted.enterprise import adbapi

dbpool = adbapi.ConnectionPool("psycopg2", database='hashi')
zmqfactory = ZmqFactory()


class ZmqPubConnection(txzmq.ZmqPubConnection):
    def publish(self, message, tag=''):
        if isinstance(message, types.StringTypes):
            self.send(tag + '\0' + message)
        else:
            li = [tag,]+message
            self.send(li)


class ZmqSubConnection(txzmq.ZmqSubConnection):
    def messageReceived(self, message):
        if isinstance(message, types.StringTypes):
            self.gotMessage(*reversed(message[0].split('\0', 1)))
        else:
            self.gotMessage(message[1:], message[0])


class ZmqPushConnection(ZmqConnection):
    socketType = constants.PUSH
    def __init__(self, factory, identity, *endpoints):
        self.identity = identity
        super(ZmqPushConnection, self).__init__(factory, *endpoints)


class ZmqPullConnection(ZmqConnection):
    socketType = constants.PULL
