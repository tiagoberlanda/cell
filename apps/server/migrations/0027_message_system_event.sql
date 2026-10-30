-- Keep the existing chat roles compatible; provenance is explicit and independent of agent speech.
ALTER TABLE messages ADD COLUMN system_event jsonb;
