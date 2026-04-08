-- Replace Low/Medium/High priority with a simple urgent boolean flag
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE task_set_tasks
  ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark previously "High" priority tasks as urgent
UPDATE tasks SET is_urgent = TRUE WHERE priority = 'High';
UPDATE task_set_tasks SET is_urgent = TRUE WHERE priority = 'High';
