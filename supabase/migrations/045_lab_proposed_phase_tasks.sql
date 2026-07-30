-- ── 045: Tareas para fases nuevas propuestas ─────────────────────────────────
-- Una fase nueva propuesta (lab_proposed_phases) sin tareas no da contexto
-- suficiente para revisarla — se agrega la misma capacidad de declarar tareas
-- (y su checklist) que ya tiene el fork de fase completa (lab_phase_tasks).

CREATE TABLE IF NOT EXISTS lab_proposed_phase_tasks (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_phase_id     UUID        NOT NULL REFERENCES lab_proposed_phases(id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  description           TEXT,
  task_order            INT         NOT NULL DEFAULT 0,
  requires_deliverable  BOOLEAN     NOT NULL DEFAULT false,
  deliverable_instructions TEXT,
  sop_id                UUID        REFERENCES sops(id) ON DELETE SET NULL,
  default_position_id   UUID        REFERENCES positions(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_proposed_phase_task_checklist_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES lab_proposed_phase_tasks(id) ON DELETE CASCADE,
  text        TEXT        NOT NULL,
  is_blocking BOOLEAN     NOT NULL DEFAULT false,
  item_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE lab_proposed_phase_tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_proposed_phase_task_checklist_items  ENABLE ROW LEVEL SECURITY;

-- lab_proposed_phase_tasks: readable by the proposal's author or any admin/
-- subadmin (for review); writable by the same, mirroring lab_phase_tasks.
CREATE POLICY "lab_proposed_phase_tasks_select" ON lab_proposed_phase_tasks
  FOR SELECT TO authenticated
  USING (proposed_phase_id IN (SELECT id FROM lab_proposed_phases));

CREATE POLICY "lab_proposed_phase_tasks_write" ON lab_proposed_phase_tasks
  FOR ALL TO authenticated
  USING (proposed_phase_id IN (
    SELECT id FROM lab_proposed_phases
    WHERE user_id = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'subadmin')
  ));

-- lab_proposed_phase_task_checklist_items
CREATE POLICY "lab_proposed_phase_checklist_select" ON lab_proposed_phase_task_checklist_items
  FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM lab_proposed_phase_tasks));

CREATE POLICY "lab_proposed_phase_checklist_write" ON lab_proposed_phase_task_checklist_items
  FOR ALL TO authenticated
  USING (task_id IN (
    SELECT t.id FROM lab_proposed_phase_tasks t
    JOIN lab_proposed_phases p ON p.id = t.proposed_phase_id
    WHERE p.user_id = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'subadmin')
  ));
