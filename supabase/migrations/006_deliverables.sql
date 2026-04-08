-- ============================================================
-- MIGRATION 006: Deliverables
-- ============================================================

-- 1. Add requires_deliverable flag to tasks
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS requires_deliverable BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Create deliverables table
CREATE TABLE IF NOT EXISTS deliverables (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('text', 'document', 'image')),
  title        TEXT NOT NULL,
  content      TEXT,                  -- for type = 'text'
  file_url     TEXT,                  -- for type = 'document' | 'image'
  file_name    TEXT,
  uploaded_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_deliverables ON deliverables;
CREATE TRIGGER set_updated_at_deliverables
  BEFORE UPDATE ON deliverables
  EXECUTE FUNCTION set_updated_at();

-- 4. RLS
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deliverables_select" ON deliverables;
DROP POLICY IF EXISTS "deliverables_insert" ON deliverables;
DROP POLICY IF EXISTS "deliverables_update" ON deliverables;
DROP POLICY IF EXISTS "deliverables_delete" ON deliverables;

-- Any authenticated user can read deliverables (project access not enforced at DB level)
CREATE POLICY "deliverables_select" ON deliverables
  FOR SELECT TO authenticated USING (TRUE);

-- Authenticated users can insert their own deliverables
CREATE POLICY "deliverables_insert" ON deliverables
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

-- Uploader or admin/subadmin can update
CREATE POLICY "deliverables_update" ON deliverables
  FOR UPDATE TO authenticated USING (
    uploaded_by = auth.uid() OR is_admin_or_subadmin()
  );

-- Admin/subadmin can delete
CREATE POLICY "deliverables_delete" ON deliverables
  FOR DELETE TO authenticated USING (is_admin_or_subadmin());
