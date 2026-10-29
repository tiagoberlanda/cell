ALTER TABLE conversations ADD COLUMN parent_conversation_id uuid REFERENCES conversations ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN source_agent_id uuid REFERENCES agents ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN delegation_task text;
CREATE INDEX conversations_parent ON conversations(parent_conversation_id) WHERE parent_conversation_id IS NOT NULL;
