-- ============================================================
-- 075_task_ping_flag.sql
-- Repurposes the unused "Urgente" flag into "Ping": marking a task pinged
-- and later completing it now notifies the whole project team, instead of
-- just being a decorative red flag nobody acted on now that a real
-- notification system exists. Same boolean column, renamed for clarity —
-- this only affects the live `tasks` table, not the task_set_tasks /
-- lab_* template tables (Ops Lab keeps its own separate is_urgent, a
-- template-authoring concept, out of scope here).
-- ============================================================

ALTER TABLE tasks RENAME COLUMN is_urgent TO is_pinged;
