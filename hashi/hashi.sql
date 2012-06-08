CREATE TABLE channels (
    user_id integer references users(id),
    name text NOT NULL,
    server_id integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    key text,
    PRIMARY KEY (user_id, name)
);

CREATE TABLE events (
    id integer NOT NULL,
    server_id integer references servers(id),
    source integer references identities(id),
    target integer references identities(id),
    args text[],
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    observer_id integer references users(id),
    kind text DEFAULT 'privmsg'::text,
    PRIMARY KEY (id, observer_id, server_id)
);

CREATE TABLE identities (
    id integer PRIMARY KEY,
    token text UNIQUE
);

CREATE TABLE server_configs (
    user_id integer references users(id),
    server_id integer references servers(id),
    nick text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    PRIMARY KEY (user_id, server_id)
);

CREATE TABLE servers (
    id integer NOT NULL,
    hostname text NOT NULL,
    port integer NOT NULL,
    ssl boolean NOT NULL
);

CREATE TABLE users (
    id integer PRIMARY KEY,
    email text NOT NULL
);

