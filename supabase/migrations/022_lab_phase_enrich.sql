-- ── 022: Enriquecer lab_phase_tasks ──────────────────────────────────────────
-- Agrega requires_deliverable, sop_id y tabla de checklist items.

ALTER TABLE lab_phase_tasks
  ADD COLUMN IF NOT EXISTS requires_deliverable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES sops(id) ON DELETE SET NULL;

-- ── Checklist items por tarea ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_phase_task_checklist_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES lab_phase_tasks(id) ON DELETE CASCADE,
  text        TEXT        NOT NULL,
  is_blocking BOOLEAN     NOT NULL DEFAULT false,
  item_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lab_phase_task_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_checklist_select" ON lab_phase_task_checklist_items
  FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM lab_phase_tasks));

CREATE POLICY "lab_checklist_write" ON lab_phase_task_checklist_items
  FOR ALL TO authenticated
  USING (task_id IN (
    SELECT t.id FROM lab_phase_tasks t
    JOIN lab_phases p ON p.id = t.phase_id
    WHERE p.author_id = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'subadmin')
  ));
