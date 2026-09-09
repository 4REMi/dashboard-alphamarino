-- ============================================================
-- 070_task_personal_scope.sql
-- Lets a task stay linked to a real project (for context/grouping in
-- "Mi lista") while staying OFF that project's shared board — for
-- personal-only details that would otherwise clutter the team's view.
-- A task is "personal" when is_personal = true, regardless of whether
-- it has a project_id. Project progress (and the shared board query)
-- must ignore personal tasks; only "Mi lista" ever shows them.
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT false;

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
  WHERE project_id = target_project_id AND is_personal = false;

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
