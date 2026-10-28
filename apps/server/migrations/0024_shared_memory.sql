-- Memory shared by every agent (was a memory.md inside each container: lost on update, separate in api and worker,
-- left out of backups). One row.
CREATE TABLE shared_memory(id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),body text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO shared_memory(id) VALUES(1);
