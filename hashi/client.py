#!/usr/bin/env python
from zmq_irc import IRC, Client, ClientFactory
from twisted.internet import reactor

from db import dbpool


class HashiClient(Client):
    def signedOn(self):
        Client.signedOn(self)
        def initial_join(l):
            for channel in l:
                self.join(channel[0], channel[1] or None)
        # Join channels
        join_sql = """SELECT name, key
FROM channels
JOIN servers ON (servers.id = channels.server_id)
WHERE enabled = true AND user_email = %s AND servers.hostname = %s;
"""
        d = dbpool.runQuery(join_sql, (self.email, self.network))
        d.addCallback(initial_join)


class HashiClientFactory(ClientFactory):
    protocol = HashiClient


class Hashi(IRC):
    client_factory = HashiClientFactory
    def start(self):
        """Initialize the IRC client.

        Load existing configuration from PostgreSQL and join all clients."""
        # This is pretty terrible but it's just once at start up
        start_sql = """SELECT user_email, hostname, port, ssl, nick,
max(events.id) as max_event_id
FROM servers
JOIN server_configs ON (servers.id = server_configs.server_id)
JOIN events ON (user_email = observer_email AND server_id = network_id)
WHERE server_configs.enabled = true
GROUP BY user_email, hostname, port, ssl, nick;
"""
        d = dbpool.runQuery(start_sql)
        d.addCallback(self.server_init)
        return d


if __name__ == "__main__":
    hashi = Hashi()
    hashi.start()

    reactor.run()
