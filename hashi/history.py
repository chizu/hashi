from sqlalchemy import *
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import text

class History(object):
    """Interact with client history for a network."""
    def __init__(self, irc_network, database_info="postgresql:///hashi"):
        self.engine = create_engine(database_info)
        self.session = sessionmaker(self.engine)()
        self.irc_network = irc_network
        self.Base = declarative_base()

        class Identity(self.Base):
            """Unique identity of an IRC user or channel.
        
            Determining this varies greatly, but the naive solution is any nick is a particular identity. Most IRC networks have a more sphisiticated means of determining identity, but nick is the only universal identity concept to IRC."""
            __tablename__ = 'identities_{0}'.format(self.irc_network)
    
            id = Column(Integer, primary_key=True)
            token = Column(String, unique=True)

        self.Identity = Identity

    def create_all(self):
        self.Base.metadata.create_all(self.engine)

    def get_channel(self, identity):
        identity_id = self.session.query(self.Identity).\
            filter_by(token=name).one()
        class Events(self.Base):
            """List of all channels."""
            __tablename__ == 'events_{network}_{ident}'.format(\
                network=self.irc_network,
                ident=identity_id)

            id = Column(Integer, primary_key=True)
            type = Column(Enum(["privmsg","action","topic","mode","part",
                                "join"]))
            value = Column(String)
            source = Column(Integer, ForeignKey('identities.id'))
            target = Column(Integer, ForeignKey('identities.id'))

        return Events
