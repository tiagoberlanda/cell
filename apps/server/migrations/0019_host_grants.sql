-- Folders on the owner's computer that an agent may use, granted by approving the agent's access request.
CREATE TABLE host_grants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agent_id uuid NOT NULL REFERENCES agents ON DELETE CASCADE,path text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX host_grants_agent_path ON host_grants(agent_id,lower(path));
-- Drives the worker can see (the API container has none mounted), shown in Settings.
ALTER TABLE worker_health ADD COLUMN drives text[] NOT NULL DEFAULT '{}';
