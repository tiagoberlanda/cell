-- Archived conversations stay readable in the history but are no longer the agent's active chat.
ALTER TABLE conversations ADD COLUMN archived_at timestamptz;
CREATE INDEX conversations_agent_active ON conversations(agent_id,archived_at,created_at);
