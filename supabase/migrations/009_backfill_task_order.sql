-- Backfill task_order for existing tasks that all defaulted to 0.
-- Assigns sequential order within each (project_id, phase_id) group
-- based on created_at so existing data gets a stable, meaningful order.
UPDATE tasks t
SET task_order = subq.new_order
FROM (
  SELECT
    id,
    (ROW_NUMBER() OVER (
      PARTITION BY project_id, COALESCE(phase_id::text, 'no-phase')
      ORDER BY created_at ASC
    ) - 1)::int AS new_order
  FROM tasks
) subq
WHERE t.id = subq.id;
