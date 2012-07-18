CREATE TABLE users (
    email text PRIMARY KEY
);

CREATE TABLE identities (
    id integer PRIMARY KEY,
    token text UNIQUE
);

CREATE TABLE servers (
    id integer NOT NULL,
    hostname text NOT NULL,
    port integer NOT NULL,
    ssl boolean NOT NULL
);

CREATE TABLE channels (
    user_email text references users(email),
    name text NOT NULL,
    server_id integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    key text,
    topic text,
    users hstore DEFAULT hstore(array[]::text[]),
    PRIMARY KEY (user_email, name)
);

CREATE TABLE events (
    id integer NOT NULL,
    server_id integer references servers(id),
    source integer references identities(id),
    target integer references identities(id),
    args text[],
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    observer_email text references users(email),
    kind text DEFAULT 'privmsg'::text,
    PRIMARY KEY (id, observer_id, server_id)
);

CREATE TABLE server_configs (
    user_email integer references users(email),
    server_id integer references servers(id),
    nick text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    PRIMARY KEY (user_email, server_id)
);
