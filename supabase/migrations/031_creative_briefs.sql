-- ============================================================
-- 031_creative_briefs.sql
-- Creative Briefs: AI-generated briefs that combine a concept
-- with a Brand Brain, replacing the heavy asset creation flow.
-- ============================================================

-- ── creative_briefs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creative_briefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  concept_id      UUID NOT NULL REFERENCES creative_concepts(id) ON DELETE CASCADE,
  brand_brain_id  UUID REFERENCES brand_brains(id) ON DELETE SET NULL,

  brief_content     JSONB NOT NULL DEFAULT '{}',
  attached_ad_ids   UUID[] DEFAULT '{}',
  attached_board_ids UUID[] DEFAULT '{}',
  adapted_script    JSONB,

  share_token  TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,

  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS creative_briefs_project_idx  ON creative_briefs(project_id);
CREATE INDEX IF NOT EXISTS creative_briefs_concept_idx  ON creative_briefs(concept_id);
CREATE INDEX IF NOT EXISTS creative_briefs_token_idx    ON creative_briefs(share_token);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE creative_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cb_select" ON creative_briefs FOR SELECT
  USING (
    is_admin_or_subadmin()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = creative_briefs.project_id
        AND pm.profile_id = auth.uid()
    )
  );

CREATE POLICY "cb_write" ON creative_briefs FOR ALL
  USING (is_admin_or_subadmin())
  WITH CHECK (is_admin_or_subadmin());

-- ── Add brief_id to creative_assets ─────────────────────────
ALTER TABLE creative_assets
  ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES creative_briefs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS creative_assets_brief_idx ON creative_assets(brief_id);
