-- ============================================================
-- 054_standalone_tasks.sql
-- Allow tasks with no project (project_id nullable) — personal
-- to-dos that aren't tied to any project. update_project_progress()
-- already no-ops safely when project_id is null (COALESCE both
-- sides null -> matches no rows), but we guard explicitly for clarity.
-- ============================================================

ALTER TABLE tasks ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE deliverables ALTER COLUMN project_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  target_project_id UUID;
  total_tasks INT;
  done_tasks INT;
  new_progress INT;
BEGIN
  target_project_id := COALESCE(NEW.project_id, OLD.project_id);
  IF target_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'Done')
  INTO total_tasks, done_tasks
  FROM tasks
  WHERE project_id = target_project_id;

  IF total_tasks > 0 THEN
    new_progress := ROUND((done_tasks::NUMERIC / total_tasks) * 100);
  ELSE
    new_progress := 0;
  END IF;

  UPDATE projects
  SET progress = new_progress
  WHERE id = target_project_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
