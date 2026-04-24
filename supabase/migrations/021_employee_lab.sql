-- ── 021: Employee Lab — fases como unidad atómica ────────────────────────────
-- Cada empleado propone fases individuales con sus tareas.
-- El admin aprueba fase por fase e inyecta las aprobadas en Operations Lab.

-- ── Fases del Lab ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_phases (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Tareas de las fases del Lab ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_phase_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id    UUID        NOT NULL REFERENCES lab_phases(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  task_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Revisiones de fases ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_phase_reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id    UUID        NOT NULL REFERENCES lab_phases(id) ON DELETE CASCADE,
  reviewer_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL CHECK (action IN ('comment', 'approve', 'reject')),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Auto-update updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_lab_phase_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lab_phases_updated_at ON lab_phases;
CREATE TRIGGER trg_lab_phases_updated_at
  BEFORE UPDATE ON lab_phases
  FOR EACH ROW EXECUTE FUNCTION update_lab_phase_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE lab_phases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_phase_tasks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_phase_reviews ENABLE ROW LEVEL SECURITY;

-- lab_phases: autores ven las suyas; admins/subadmins ven todas
CREATE POLICY "lab_phases_author_select" ON lab_phases
  FOR SELECT TO authenticated
  USING (author_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'subadmin'));

CREATE POLICY "lab_phases_insert" ON lab_phases
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "lab_phases_update" ON lab_phases
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'subadmin'));

CREATE POLICY "lab_phases_delete" ON lab_phases
  FOR DELETE TO authenticated
  USING (author_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- lab_phase_tasks: visibilidad heredada de la fase
CREATE POLICY "lab_phase_tasks_select" ON lab_phase_tasks
  FOR SELECT TO authenticated
  USING (phase_id IN (SELECT id FROM lab_phases));

CREATE POLICY "lab_phase_tasks_write" ON lab_phase_tasks
  FOR ALL TO authenticated
  USING (phase_id IN (
    SELECT id FROM lab_phases
    WHERE author_id = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'subadmin')
  ));

-- lab_phase_reviews: admins/subadmins escriben; autor y revisor pueden leer
CREATE POLICY "lab_phase_reviews_select" ON lab_phase_reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR phase_id IN (SELECT id FROM lab_phases WHERE author_id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'subadmin')
  );

CREATE POLICY "lab_phase_reviews_insert" ON lab_phase_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'subadmin')
  );
