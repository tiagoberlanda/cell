-- One-click connectors: which catalog entry a connection came from, whether its tools are available to every agent,
-- and whether it is an MCP server or a native integration (Google Tasks).
ALTER TABLE connections ADD COLUMN catalog_key text;
ALTER TABLE connections ADD COLUMN all_agents boolean NOT NULL DEFAULT false;
ALTER TABLE connections ADD COLUMN kind text NOT NULL DEFAULT 'mcp' CHECK(kind IN ('mcp','native'));
CREATE UNIQUE INDEX connections_catalog_key ON connections(catalog_key) WHERE catalog_key IS NOT NULL;
-- OAuth clients registered by the owner with providers that do not allow dynamic registration (Google). Secret encrypted.
CREATE TABLE oauth_clients(provider text PRIMARY KEY,client_id text NOT NULL,client_secret text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
