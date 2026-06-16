ALTER TABLE task_set_tasks ADD COLUMN IF NOT EXISTS deliverable_instructions TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deliverable_instructions TEXT;
