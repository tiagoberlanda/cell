ALTER TABLE messages ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES runs ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_run_idx ON messages(run_id);

UPDATE messages m
SET run_id = r.id
FROM runs r
WHERE r.conversation_id = m.conversation_id
  AND m.role = 'assistant'
  AND r.output = m.content
  AND m.run_id IS NULL;
