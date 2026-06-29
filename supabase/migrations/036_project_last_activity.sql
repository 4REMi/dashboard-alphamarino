-- Add last_activity_at to projects for tracking Creative Tracker and other activity
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Backfill with updated_at
UPDATE projects SET last_activity_at = created_at WHERE last_activity_at IS NULL;
