-- Approvals left pending by runs that already ended (e.g. the jsonb key-order fingerprint mismatch) can no longer be acted on.
UPDATE approvals SET status='cancelled' WHERE status='pending' AND call_id IN(SELECT t.id FROM tool_calls t JOIN runs r ON r.id=t.run_id WHERE r.state IN('completed','failed','cancelled'));
