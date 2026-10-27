-- Sidebar sections (can exist empty) and manual ordering of sections and agents.
CREATE TABLE sections(name text PRIMARY KEY,position int NOT NULL DEFAULT 0);
INSERT INTO sections(name,position) SELECT section,row_number() OVER (ORDER BY min(created_at)) FROM agents GROUP BY section;
ALTER TABLE agents ADD COLUMN position int NOT NULL DEFAULT 0;
UPDATE agents a SET position=o.n FROM (SELECT id,row_number() OVER (ORDER BY pinned DESC,created_at) AS n FROM agents) o WHERE a.id=o.id;
-- Every agent can generate images through the 9router.
UPDATE agents SET tools=tools||'["generate_image"]'::jsonb WHERE NOT tools ? 'generate_image';
