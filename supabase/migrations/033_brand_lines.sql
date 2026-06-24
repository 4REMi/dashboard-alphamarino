-- ============================================================
-- 033_brand_lines.sql
-- Brand Lines: product/service lines within a Brand Brain.
-- Each line has its own USPs, pain points, and keywords that
-- differentiate it from other lines in the same brand.
-- ============================================================

-- ── brand_lines ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_brain_id  UUID NOT NULL REFERENCES brand_brains(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  usps            TEXT[] DEFAULT '{}',
  pain_points     TEXT[] DEFAULT '{}',
  keywords        TEXT[] DEFAULT '{}',
  color           TEXT DEFAULT '#6366f1',
  position        INT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_lines_brain_idx ON brand_lines(brand_brain_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE brand_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bl_select" ON brand_lines;
CREATE POLICY "bl_select" ON brand_lines FOR SELECT
  USING (is_admin_or_subadmin());

DROP POLICY IF EXISTS "bl_write" ON brand_lines;
CREATE POLICY "bl_write" ON brand_lines FOR ALL
  USING (is_admin_or_subadmin())
  WITH CHECK (is_admin_or_subadmin());

-- ── Add brand_line_id to creative_concepts ──────────────────
ALTER TABLE creative_concepts
  ADD COLUMN IF NOT EXISTS brand_line_id UUID REFERENCES brand_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS creative_concepts_brand_line_idx ON creative_concepts(brand_line_id);

-- ── Add brand_line_id to creative_briefs ────────────────────
ALTER TABLE creative_briefs
  ADD COLUMN IF NOT EXISTS brand_line_id UUID REFERENCES brand_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS creative_briefs_brand_line_idx ON creative_briefs(brand_line_id);
