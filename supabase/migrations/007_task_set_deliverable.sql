-- Add requires_deliverable to task_set_tasks (template tasks)
ALTER TABLE task_set_tasks
  ADD COLUMN IF NOT EXISTS requires_deliverable BOOLEAN NOT NULL DEFAULT FALSE;
