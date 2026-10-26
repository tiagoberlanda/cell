-- One master agent (the coordinator): cannot be archived or deleted and manages the other agents.
ALTER TABLE agents ADD COLUMN is_master boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX agents_one_master ON agents(is_master) WHERE is_master;
UPDATE agents SET is_master=true,archived=false WHERE id=(SELECT id FROM agents ORDER BY (name='Coordenador') DESC,created_at LIMIT 1);
