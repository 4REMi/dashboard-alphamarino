-- ── 046: Instrucciones del entregable en las tareas de Mi Ops Lab ────────────
-- task_set_tasks (Operations Lab, admin) ya tenía deliverable_instructions.
-- Mi Ops Lab (lab_phase_tasks / lab_proposed_tasks) se había quedado atrás —
-- se agrega la misma columna para que el flujo de propuestas de empleados
-- tenga paridad con el editor de tareas canónicas del admin.

ALTER TABLE lab_phase_tasks
  ADD COLUMN IF NOT EXISTS deliverable_instructions TEXT;

ALTER TABLE lab_proposed_tasks
  ADD COLUMN IF NOT EXISTS deliverable_instructions TEXT;
