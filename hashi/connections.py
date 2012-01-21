from zmq.core import constants
from txZMQ import ZmqFactory, ZmqConnection
from twisted.enterprise import adbapi

dbpool = adbapi.ConnectionPool("psycopg2", database='hashi')
zmqfactory = ZmqFactory()


class ZmqPushConnection(ZmqConnection):
    socketType = constants.PUSH
    def __init__(self, factory, identity, *endpoints):
        self.identity = identity
        super(ZmqPushConnection, self).__init__(factory, *endpoints)


class ZmqPullConnection(ZmqConnection):
    socketType = constants.PULL
