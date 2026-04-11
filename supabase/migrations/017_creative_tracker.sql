-- ============================================================
-- 017_creative_tracker.sql
-- Creative Tracker: concepts + assets for Paid Media projects
-- ============================================================

-- ── creative_concepts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creative_concepts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id            UUID REFERENCES paid_media_cycles(id) ON DELETE SET NULL,
  -- nullable → Evergreen concepts live at project level
  parent_concept_id   UUID REFERENCES creative_concepts(id) ON DELETE SET NULL,

  organizing_principle TEXT CHECK (organizing_principle IN ('Pain-First', 'Desire-First')),
  angle_type           TEXT CHECK (angle_type IN (
    'Problem Agitation', 'Mechanism Reveal', 'Enemy Framing',
    'Before/After Transformation', 'Social Proof', 'Contrarian',
    'Direct Desire', 'Fear of Missing Out', 'Authority', 'Curiosity Gap'
  )),
  target_persona    TEXT NOT NULL DEFAULT '',
  pain_or_desire    TEXT NOT NULL DEFAULT '',
  emotional_insight TEXT,
  central_tension   TEXT,
  awareness_stage   INT CHECK (awareness_stage BETWEEN 1 AND 5),
  mechanism         TEXT,
  references        TEXT,
  proposed_hook     TEXT,

  status      TEXT CHECK (status IN ('Active', 'Archived', 'Transmuted', 'Evergreen')) DEFAULT 'Active',
  insight     TEXT, -- visible only to admin/subadmin

  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── creative_assets ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creative_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id    UUID REFERENCES paid_media_cycles(id) ON DELETE SET NULL,
  concept_id  UUID REFERENCES creative_concepts(id) ON DELETE SET NULL,

  format    TEXT, -- 'Video B-roll+VO', 'Video UGC', 'Static', 'Carousel'
  platform  TEXT, -- 'Meta Ads', 'Google Ads', 'TikTok Ads'
  variant   TEXT, -- A, B, C
  iteration TEXT, -- v1, v2, v3
  hook      TEXT,
  copy      TEXT,
  cta       TEXT,
  asset_url TEXT,

  production_status TEXT CHECK (production_status IN (
    'Pending', 'In Production', 'In Review', 'Approved', 'Published'
  )) DEFAULT 'Pending',

  -- Admin/subadmin only (filtered in server actions by role)
  ctr          NUMERIC,
  cpc          NUMERIC,
  cpm          NUMERIC,
  roas         NUMERIC,
  cpa          NUMERIC,
  spend        NUMERIC,
  results      NUMERIC,
  results_type TEXT,
  verdict      TEXT CHECK (verdict IN ('Winner', 'Scale', 'Iterate', 'Archive')),
  verdict_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS creative_concepts_project_idx ON creative_concepts(project_id);
CREATE INDEX IF NOT EXISTS creative_concepts_cycle_idx   ON creative_concepts(cycle_id);
CREATE INDEX IF NOT EXISTS creative_assets_project_idx   ON creative_assets(project_id);
CREATE INDEX IF NOT EXISTS creative_assets_cycle_idx     ON creative_assets(cycle_id);
CREATE INDEX IF NOT EXISTS creative_assets_concept_idx   ON creative_assets(concept_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE creative_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_assets   ENABLE ROW LEVEL SECURITY;

-- creative_concepts: project members + admins can SELECT
CREATE POLICY "cc_select" ON creative_concepts FOR SELECT
  USING (
    is_admin_or_subadmin()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = creative_concepts.project_id
        AND pm.profile_id = auth.uid()
    )
  );

-- creative_concepts: only admin/subadmin can INSERT/UPDATE/DELETE
CREATE POLICY "cc_write" ON creative_concepts FOR ALL
  USING (is_admin_or_subadmin())
  WITH CHECK (is_admin_or_subadmin());

-- creative_assets: project members + admins can SELECT
CREATE POLICY "ca_select" ON creative_assets FOR SELECT
  USING (
    is_admin_or_subadmin()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = creative_assets.project_id
        AND pm.profile_id = auth.uid()
    )
  );

-- creative_assets: only admin/subadmin can INSERT/UPDATE/DELETE
CREATE POLICY "ca_write" ON creative_assets FOR ALL
  USING (is_admin_or_subadmin())
  WITH CHECK (is_admin_or_subadmin());
