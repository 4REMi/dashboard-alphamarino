-- Add color column to project_types for badge styling in project views
ALTER TABLE project_types ADD COLUMN IF NOT EXISTS color TEXT;
