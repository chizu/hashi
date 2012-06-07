from sqlalchemy import create_engine
from sqlalchemy import Boolean, Column, DateTime, Integer, String, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.declarative import declarative_base
from twisted.enterprise import adbapi


database_config = {"database":"hashi",
                   "hostname":"localhost",
                   "user":"hashi"
                   "password":""}
dbpool = adbapi.ConnectionPool("psycopg2", **database_config)


def connect():
    return create_engine("postgresql+psycopg2://{user}:{password}@{hostname}/{database}".format(database_config))


def create():
    engine = connect()
    

Base = declarative_base()


class Users(Base):
    """Hashi users."""
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    email = Column(String, nullable=False)
    enabled = Column(Boolean, server_default=False, nullable=False)


class Channels(Base):
    __tablename__ = 'channels'
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, nullable=False)


class Servers(Base):
    __tablename__ = 'servers'
    id = Column(Integer)
    hostname = Column(String)
    port = Column(Integer, server_default=6697)
    ssl = Column(Boolean, server_default=True, nullable=False)
    

class Identities(Base):
    """IRC users."""
    __tablename__ = 'identities'
    id = Column(Integer, primary_key=True)


class Events(Base):
    __tablename__ = 'events'
    id = Column(Integer, primary_key=True)
    server_id = Column(Integer, ForeignKey("servers.id"))
    source = Column(Integer, ForeignKey("identities.id"))
    target = Column(Integer, ForeignKey("identities.id"))
    args = Column(ARRAY(String))
    timestamp = Column(DateTime, nullable=False, server_default=func.now())
    observer_id = Column(Users, 
    kind = Column(Enum('notice', 'userRenamed', 'userQuit', 'action',
                       'userLeft', 'privmsg', 'userJoined', 'signedOn',
                       'userKicked', 'names', 'joined'))
