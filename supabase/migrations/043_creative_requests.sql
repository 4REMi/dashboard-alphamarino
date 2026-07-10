-- ============================================================
-- 043_creative_requests.sql
-- Creative Requests: admins declare exactly how many creative
-- deliverables (video/imagen) are expected per brief/concept,
-- assign each to a specific editor/designer, and track fulfillment.
-- ============================================================

CREATE TABLE IF NOT EXISTS creative_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  concept_id            UUID NOT NULL REFERENCES creative_concepts(id) ON DELETE CASCADE,
  brief_id              UUID REFERENCES creative_briefs(id) ON DELETE SET NULL,

  tipo                  TEXT NOT NULL CHECK (tipo IN ('video', 'imagen')),
  assigned_to           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  notes                 TEXT,

  -- Only meaningful when tipo = 'video' — matches a key in
  -- creative_briefs.adapted_script / script_reviews
  script_key            TEXT,
  -- Only meaningful when tipo = 'imagen' — links to an existing Ad Lab draft
  image_clone_id        UUID REFERENCES image_clones(id) ON DELETE SET NULL,
  fulfilled_by_asset_id UUID REFERENCES creative_assets(id) ON DELETE SET NULL,

  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS creative_requests_project_idx ON creative_requests(project_id);
CREATE INDEX IF NOT EXISTS creative_requests_concept_idx ON creative_requests(concept_id);
CREATE INDEX IF NOT EXISTS creative_requests_brief_idx   ON creative_requests(brief_id);
CREATE INDEX IF NOT EXISTS creative_requests_assigned_idx ON creative_requests(assigned_to);

-- ── updated_at trigger ──────────────────────────────────────
CREATE TRIGGER trg_creative_requests_updated_at
  BEFORE UPDATE ON creative_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE creative_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: admins/subadmins, or any project member
CREATE POLICY "cr_select" ON creative_requests FOR SELECT
  USING (
    is_admin_or_subadmin()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = creative_requests.project_id
        AND pm.profile_id = auth.uid()
    )
  );

-- INSERT: admin/subadmin only
CREATE POLICY "cr_insert" ON creative_requests FOR INSERT
  WITH CHECK (is_admin_or_subadmin());

-- DELETE: admin/subadmin only
CREATE POLICY "cr_delete" ON creative_requests FOR DELETE
  USING (is_admin_or_subadmin());

-- UPDATE: admin/subadmin, or the assigned editor (while also a project member)
-- fulfilling their own request — mirrors the project-member write pattern
-- from 042_creative_assets_project_member_write.sql.
CREATE POLICY "cr_update" ON creative_requests FOR UPDATE
  USING (
    is_admin_or_subadmin()
    OR (
      assigned_to = auth.uid()
      AND EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = creative_requests.project_id
          AND pm.profile_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    is_admin_or_subadmin()
    OR (
      assigned_to = auth.uid()
      AND EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = creative_requests.project_id
          AND pm.profile_id = auth.uid()
      )
    )
  );

-- ── image_clones: link a generated draft back to the concept it belongs to ──
ALTER TABLE image_clones
  ADD COLUMN IF NOT EXISTS concept_id UUID REFERENCES creative_concepts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS image_clones_concept_idx ON image_clones(concept_id);

-- ── creative_assets: track which script an uploaded video fulfills ──
ALTER TABLE creative_assets
  ADD COLUMN IF NOT EXISTS script_key TEXT;
