from twisted.enterprise import adbapi


database_config = {"database":"hashi"}
dbpool = adbapi.ConnectionPool("psycopg2", **database_config)
