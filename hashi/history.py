class Identity(object):
    """Unique identity of an IRC user.

    Determining this varies greatly, but the naive solution is any nick is a particular identity. Most IRC networks have a more sphisiticated means of determining identity, but nick is the only universal identity concept to IRC."""
    def __init__(self, nick):
        self.token = nick

    def __eq__(self, other):
        return self.token == other.token

class History(object):
    """Interact with client history from the perspective of one user."""
    def __init__(self, identity):
        self.identity = identity
