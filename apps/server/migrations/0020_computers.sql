-- Computers reached over SSH (Linux, or Windows with OpenSSH). The local Windows computer comes from the Cell Host
-- settings (.env) and is not stored here. auth is encrypted; fingerprint pins the server's host key.
CREATE TABLE computers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,host text NOT NULL,port int NOT NULL DEFAULT 22,username text NOT NULL,auth text NOT NULL,shell text NOT NULL DEFAULT 'bash' CHECK(shell IN('bash','powershell')),fingerprint text NOT NULL,enabled boolean NOT NULL DEFAULT true,info jsonb,last_seen timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX computers_name ON computers(lower(name));
