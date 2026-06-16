-- ============================================================
-- 028: Limpia task_sets y phase_sets huérfanos
--
-- Conserva únicamente los task_sets referenciados por al menos
-- una fase (phase_set_phases.default_task_set_id) y los
-- phase_sets referenciados por al menos un tipo de proyecto
-- (project_types.default_phase_set_id).
--
-- REVISA este script antes de correrlo: lista primero los
-- registros que se eliminarán con las consultas SELECT de abajo.
-- ============================================================

-- ── Vista previa (ejecuta esto primero para ver qué se borrará) ──
-- SELECT id, name FROM task_sets
--   WHERE id NOT IN (
--     SELECT default_task_set_id FROM phase_set_phases
--     WHERE default_task_set_id IS NOT NULL
--   );
--
-- SELECT id, name FROM phase_sets
--   WHERE id NOT IN (
--     SELECT default_phase_set_id FROM project_types
--     WHERE default_phase_set_id IS NOT NULL
--   );

-- ── Borrado en cascada: task_sets huérfanos ───────────────────
-- Los checklist items y tasks dependen del task_set vía FK CASCADE,
-- pero si tu BD no tiene ON DELETE CASCADE explícito, borramos manualmente.

DELETE FROM task_set_checklist_items
WHERE task_set_task_id IN (
  SELECT id FROM task_set_tasks
  WHERE task_set_id NOT IN (
    SELECT default_task_set_id FROM phase_set_phases
    WHERE default_task_set_id IS NOT NULL
  )
);

DELETE FROM task_set_tasks
WHERE task_set_id NOT IN (
  SELECT default_task_set_id FROM phase_set_phases
  WHERE default_task_set_id IS NOT NULL
);

DELETE FROM task_sets
WHERE id NOT IN (
  SELECT default_task_set_id FROM phase_set_phases
  WHERE default_task_set_id IS NOT NULL
);

-- ── Borrado en cascada: phase_sets huérfanos ─────────────────
-- Primero nullificamos default_task_set_id en las fases huérfanas
-- (ya no existen los task_sets, así que evitamos FK violations).

UPDATE phase_set_phases
SET default_task_set_id = NULL
WHERE phase_set_id NOT IN (
  SELECT default_phase_set_id FROM project_types
  WHERE default_phase_set_id IS NOT NULL
);

DELETE FROM phase_set_phases
WHERE phase_set_id NOT IN (
  SELECT default_phase_set_id FROM project_types
  WHERE default_phase_set_id IS NOT NULL
);

DELETE FROM phase_sets
WHERE id NOT IN (
  SELECT default_phase_set_id FROM project_types
  WHERE default_phase_set_id IS NOT NULL
);
