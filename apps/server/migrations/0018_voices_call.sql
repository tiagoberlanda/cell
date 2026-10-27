-- Voice per agent (empty: use the workspace default) and voice-call messages, which are always answered with speech.
ALTER TABLE agents ADD COLUMN tts_model text NOT NULL DEFAULT '', ADD COLUMN tts_voice text NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN call boolean NOT NULL DEFAULT false;
