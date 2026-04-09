-- Add icon column to project_types for badge display in project views
ALTER TABLE project_types ADD COLUMN IF NOT EXISTS icon TEXT;
