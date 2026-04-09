-- ============================================================
-- SOP (Standard Operating Procedure) system
-- ============================================================

-- Bank of SOPs
CREATE TABLE IF NOT EXISTS sops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  doc_url     TEXT,
  video_url   TEXT,
  category    TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  visibility  TEXT NOT NULL DEFAULT 'public'
                CHECK (visibility IN ('public', 'restricted')),
  author_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link task templates to a SOP
ALTER TABLE task_set_tasks
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES sops(id) ON DELETE SET NULL;

-- Link project tasks to a SOP (NULL = inherit from task_set_task origin)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES sops(id) ON DELETE SET NULL;

-- Back-reference from project task → its template origin
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_set_task_id UUID REFERENCES task_set_tasks(id) ON DELETE SET NULL;

-- SOP requests
CREATE TABLE IF NOT EXISTS sop_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_set_task_id UUID REFERENCES task_set_tasks(id) ON DELETE CASCADE,
  task_id          UUID REFERENCES tasks(id) ON DELETE CASCADE,
  requested_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'fulfilled', 'dismissed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add request_sops to the permissions check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_permissions_check;
-- (permissions is a TEXT[] column — no check constraint needed; handled in app layer)

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_requests ENABLE ROW LEVEL SECURITY;

-- sops: public visibility → all authenticated; restricted → admin/subadmin or author
CREATE POLICY "sops_select" ON sops FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    OR author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin'))
  );

CREATE POLICY "sops_insert" ON sops FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "sops_update" ON sops FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin'))
  );

CREATE POLICY "sops_delete" ON sops FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin'))
  );

-- sop_requests: visible to requester, assignee, and admin/subadmin
CREATE POLICY "sop_requests_select" ON sop_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin'))
  );

CREATE POLICY "sop_requests_insert" ON sop_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "sop_requests_update" ON sop_requests FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin'))
  );

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_sops_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS sops_updated_at ON sops;
CREATE TRIGGER sops_updated_at
  BEFORE UPDATE ON sops
  FOR EACH ROW EXECUTE FUNCTION update_sops_updated_at();
