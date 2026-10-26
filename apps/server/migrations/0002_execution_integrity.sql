ALTER TABLE tool_calls ADD COLUMN target text;
ALTER TABLE tool_calls ADD COLUMN binding text NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN source_call_id uuid UNIQUE;
ALTER TABLE files ADD COLUMN source_call_id uuid UNIQUE;
ALTER TABLE routines ADD COLUMN source_call_id uuid UNIQUE;
