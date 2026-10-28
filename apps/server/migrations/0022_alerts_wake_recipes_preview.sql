-- Wake-on-LAN for SSH computers.
ALTER TABLE computers ADD COLUMN mac text, ADD COLUMN broadcast text;
-- Computer alerts (disk almost full, offline, high CPU): open while the condition lasts; notified once when it starts
-- (after the configured duration) and once when it ends.
CREATE TABLE computer_alerts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),computer_key text NOT NULL,computer_name text NOT NULL,kind text NOT NULL,detail text NOT NULL DEFAULT '',since timestamptz NOT NULL DEFAULT now(),notified_at timestamptz,resolved_at timestamptz);
CREATE UNIQUE INDEX computer_alerts_open ON computer_alerts(computer_key,kind) WHERE resolved_at IS NULL;
-- Saved commands run with one tap or by agents; trusted ones run without asking for approval.
CREATE TABLE command_recipes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,computer_key text NOT NULL,command text NOT NULL,cwd text,background boolean NOT NULL DEFAULT false,trusted boolean NOT NULL DEFAULT false,last_run_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX command_recipes_name ON command_recipes(lower(name));
-- What a tool call will change, computed before approval (e.g. the diff of pc_edit).
ALTER TABLE tool_calls ADD COLUMN preview text;
