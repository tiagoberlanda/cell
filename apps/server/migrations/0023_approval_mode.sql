-- Approval mode per agent: 'ask' (every write waits for the owner), 'safe' (everything but deletions runs on its own),
-- 'yolo' (nothing waits). auto_approve: tools the owner chose "Aprovar sempre" for, as [{tool,label}].
ALTER TABLE agents ADD COLUMN approval_mode text NOT NULL DEFAULT 'ask' CHECK (approval_mode IN ('ask','safe','yolo')),
 ADD COLUMN auto_approve jsonb NOT NULL DEFAULT '[]';
-- Why an approval was granted without a tap: 'mode' or 'always' (null when the owner decided).
ALTER TABLE approvals ADD COLUMN auto text;
