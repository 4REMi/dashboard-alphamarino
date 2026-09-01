-- ============================================================
-- 065_asset_copy_bank.sql
-- A reusable bank of AI-generated copy per creative_asset, built
-- from the asset's concept strategy (not from the image/video
-- content itself). Each entry is either the first generation or a
-- refinement of a prior entry (shorter/longer/richer) — refinements
-- add a new row instead of overwriting, so the bank accumulates
-- variants to compare/reuse.
-- ============================================================

CREATE TABLE IF NOT EXISTS asset_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES creative_assets(id) ON DELETE CASCADE,
  hook TEXT,
  copy TEXT,
  cta TEXT,
  source TEXT NOT NULL DEFAULT 'generated' CHECK (source IN ('generated', 'shorter', 'longer', 'richer')),
  parent_copy_id UUID REFERENCES asset_copies(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_copies_asset_id_idx ON asset_copies(asset_id);

-- Mirrors creative_assets' own RLS shape: project members + admins can
-- read, only admin/subadmin can write — same access boundary as the asset
-- this copy belongs to.
ALTER TABLE asset_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ac_select" ON asset_copies FOR SELECT
  USING (
    is_admin_or_subadmin()
    OR EXISTS (
      SELECT 1 FROM creative_assets ca
      JOIN project_members pm ON pm.project_id = ca.project_id
      WHERE ca.id = asset_copies.asset_id
        AND pm.profile_id = auth.uid()
    )
  );

CREATE POLICY "ac_write" ON asset_copies FOR ALL
  USING (is_admin_or_subadmin())
  WITH CHECK (is_admin_or_subadmin());
