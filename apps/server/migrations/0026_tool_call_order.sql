-- Older calls have no recoverable model order: preserve the previous stable fallback.
ALTER TABLE tool_calls ADD COLUMN ordinal bigint;
WITH ordered AS (
 SELECT id,row_number() OVER (PARTITION BY run_id ORDER BY created_at,id) AS ordinal
 FROM tool_calls
)
UPDATE tool_calls t SET ordinal=o.ordinal FROM ordered o WHERE t.id=o.id;
-- Nullable for compatibility with older workers during rollout; new workers append
-- after the existing calls and use created_at,id for any legacy NULL ordinals.
CREATE INDEX tool_calls_run_ordinal ON tool_calls(run_id,ordinal,created_at,id);
