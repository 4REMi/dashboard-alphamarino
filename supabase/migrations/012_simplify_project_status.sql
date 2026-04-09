-- Simplify project status to three states: Active, Completed, Archived
-- Must drop constraint BEFORE updating data (old constraint rejects 'Active')
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

UPDATE projects SET status = 'Active' WHERE status IN ('Planning', 'In Progress', 'Review');

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('Active', 'Completed', 'Archived'));
