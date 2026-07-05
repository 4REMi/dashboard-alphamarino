-- Add campaign status (from Meta's effective_status) so the UI can show
-- which campaigns are currently active vs paused/archived.
ALTER TABLE meta_campaigns ADD COLUMN IF NOT EXISTS status TEXT;
