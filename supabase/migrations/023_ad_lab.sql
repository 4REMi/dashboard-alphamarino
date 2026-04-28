-- ============================================================
-- 023_ad_lab.sql — Ad Lab: tracked brands, saved ads, boards
-- ============================================================

-- Brands competitors track, linked to a customer
CREATE TABLE IF NOT EXISTS tracked_brands (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  meta_page_id   TEXT,                  -- Facebook Page ID for Meta Ads Library API
  page_url       TEXT,
  notes          TEXT,
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snapshot of an ad saved from Meta Ads Library
CREATE TABLE IF NOT EXISTS saved_ads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_archive_id       TEXT NOT NULL UNIQUE,  -- Meta's ad_archive_id
  page_id             TEXT NOT NULL,
  page_name           TEXT NOT NULL,
  body                TEXT,                  -- ad copy / text
  image_url           TEXT,
  video_url           TEXT,
  snapshot_url        TEXT,                  -- Meta's iframe snapshot URL
  start_date          DATE,
  end_date            DATE,
  status              TEXT CHECK (status IN ('active', 'inactive')),
  platforms           TEXT[] DEFAULT '{}',   -- facebook, instagram, etc.
  spend_lower         NUMERIC(12,2),
  spend_upper         NUMERIC(12,2),
  impressions_lower   BIGINT,
  impressions_upper   BIGINT,
  currency            TEXT DEFAULT 'MXN',
  -- Enriched manually by the team
  hook                TEXT,
  format              TEXT,                  -- UGC, Studio, Founder POV, Static + VO
  notes               TEXT,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Global agency boards (like Pinterest boards)
CREATE TABLE IF NOT EXISTS ad_boards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  cover_ad_id   UUID REFERENCES saved_ads(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many: boards <-> saved ads
CREATE TABLE IF NOT EXISTS board_ads (
  board_id      UUID NOT NULL REFERENCES ad_boards(id) ON DELETE CASCADE,
  saved_ad_id   UUID NOT NULL REFERENCES saved_ads(id) ON DELETE CASCADE,
  added_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, saved_ad_id)
);

-- Optional: link a board to a paid media project for reference
CREATE TABLE IF NOT EXISTS board_projects (
  board_id    UUID NOT NULL REFERENCES ad_boards(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (board_id, project_id)
);

-- Creative brief / context per client (for clone flow)
CREATE TABLE IF NOT EXISTS client_creative_context (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  brand_name            TEXT,
  brand_voice           TEXT,           -- tono de voz, estilo de comunicación
  product_description   TEXT,           -- qué venden
  target_audience       TEXT,           -- a quién le hablan
  key_differentiators   TEXT,           -- por qué son diferentes
  content_restrictions  TEXT,           -- qué NO hacer
  reference_urls        TEXT[] DEFAULT '{}',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- ── RLS ──────────────────────────────────────────────────────────

ALTER TABLE tracked_brands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_ads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_boards               ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_ads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_creative_context ENABLE ROW LEVEL SECURITY;

-- tracked_brands: all authenticated users can read; admin/subadmin can write
CREATE POLICY "tracked_brands_select" ON tracked_brands
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tracked_brands_insert" ON tracked_brands
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_subadmin());
CREATE POLICY "tracked_brands_update" ON tracked_brands
  FOR UPDATE TO authenticated USING (is_admin_or_subadmin());
CREATE POLICY "tracked_brands_delete" ON tracked_brands
  FOR DELETE TO authenticated USING (is_admin_or_subadmin());

-- saved_ads: all authenticated users can read and insert; admin/subadmin can delete
CREATE POLICY "saved_ads_select" ON saved_ads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "saved_ads_insert" ON saved_ads
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "saved_ads_update" ON saved_ads
  FOR UPDATE TO authenticated USING (is_admin_or_subadmin());
CREATE POLICY "saved_ads_delete" ON saved_ads
  FOR DELETE TO authenticated USING (is_admin_or_subadmin());

-- ad_boards: all authenticated users can read and create
CREATE POLICY "ad_boards_select" ON ad_boards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ad_boards_insert" ON ad_boards
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ad_boards_update" ON ad_boards
  FOR UPDATE TO authenticated USING (is_admin_or_subadmin() OR created_by = auth.uid());
CREATE POLICY "ad_boards_delete" ON ad_boards
  FOR DELETE TO authenticated USING (is_admin_or_subadmin() OR created_by = auth.uid());

-- board_ads: all authenticated users can read and manage
CREATE POLICY "board_ads_select" ON board_ads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "board_ads_insert" ON board_ads
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "board_ads_delete" ON board_ads
  FOR DELETE TO authenticated USING (is_admin_or_subadmin() OR added_by = auth.uid());

-- board_projects: all authenticated users can read; admin/subadmin can write
CREATE POLICY "board_projects_select" ON board_projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "board_projects_insert" ON board_projects
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_subadmin());
CREATE POLICY "board_projects_delete" ON board_projects
  FOR DELETE TO authenticated USING (is_admin_or_subadmin());

-- client_creative_context: all authenticated can read; admin/subadmin can write
CREATE POLICY "client_creative_context_select" ON client_creative_context
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_creative_context_insert" ON client_creative_context
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_subadmin());
CREATE POLICY "client_creative_context_update" ON client_creative_context
  FOR UPDATE TO authenticated USING (is_admin_or_subadmin());
CREATE POLICY "client_creative_context_delete" ON client_creative_context
  FOR DELETE TO authenticated USING (is_admin());
