-- Per-agent choice to receive notifications (push, in-app alerts and the notification center). On by default.
ALTER TABLE agents ADD COLUMN notify boolean NOT NULL DEFAULT true;
