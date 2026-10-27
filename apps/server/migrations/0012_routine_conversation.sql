-- Routines answer in the conversation they were proposed in (when it still exists and is not archived).
ALTER TABLE routines ADD COLUMN conversation_id uuid REFERENCES conversations ON DELETE SET NULL;
-- Backfill routines proposed by agents with the conversation of the proposing run.
UPDATE routines r SET conversation_id=ru.conversation_id
 FROM tool_calls t JOIN runs ru ON ru.id=t.run_id
 WHERE t.tool='propose_routine' AND t.status='done' AND t.result LIKE '{%' AND (t.result::jsonb)->>'id'=r.id::text AND r.conversation_id IS NULL;
