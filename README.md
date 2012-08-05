# Hashi web IRC client/bouncer

Licensing:
  * This software is licensed under the GNU Affero General Public License v3 as provided in LICENSE.txt or at http://www.gnu.org/licenses/agpl.txt

Install requirements:
  * [txWebSocket](https://github.com/wulczer/txWebSocket)
  * txZMQ
  * PostgreSQL 9.1

Setup: 
  * Create a python virtual environment, activate it, run setup.py install or develop
  * Create a database named hashi and grant access to the local user hashi.
  * Start all three daemons, web.py, client.py, and history.py
  * (Recommended) Setup an SSL proxy with websocket support, such as [stud](https://github.com/bumptech/stud) with Varnish, and forward to port 8080
  * Connect to port the SSL proxy or port 8080 directly
