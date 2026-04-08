-- Add task_order for preserving Operations Lab sequence
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_order INT NOT NULL DEFAULT 0;

-- Link tasks to their source project phase (nullable — manual tasks have no phase)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_phase_id_idx ON tasks(phase_id);
