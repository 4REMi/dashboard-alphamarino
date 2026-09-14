-- ============================================================
-- 076_task_ping_targeting.sql
-- Optional targeted recipients for Ping (docs/agent-guides/tareas.md), on
-- top of the broadcast-to-everyone default from migration 075. NULL/empty
-- keeps today's behavior (notify every project member); a non-empty array
-- means "only these people" instead. Nothing here is blocking — a task
-- never depends on another, this only narrows who gets notified.
--
-- Also brings the same optional Ping default into Operaciones' task
-- templates (task_set_tasks), which don't know real people yet at
-- template-authoring time — only global "puestos" (positions), resolved
-- against the project's actual roster when the template is applied
-- (copyTaskSetsToProject), same mechanism already used for
-- default_position_id assignment.
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS ping_recipient_ids UUID[];

ALTER TABLE task_set_tasks
  ADD COLUMN IF NOT EXISTS is_pinged BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ping_position_ids UUID[];
