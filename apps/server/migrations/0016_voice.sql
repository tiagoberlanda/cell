-- Voice: agents may answer voice messages with audio; messages remember whether they were spoken (user audio or audio reply).
ALTER TABLE agents ADD COLUMN voice_reply boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN voice boolean NOT NULL DEFAULT false;
