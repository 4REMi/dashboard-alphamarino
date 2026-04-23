-- Dedicated integrations table: one row per platform per project
CREATE TABLE IF NOT EXISTS project_integrations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,   -- 'meta', 'google', 'tiktok', 'linkedin', etc.
  account_id TEXT NOT NULL,
  extra      JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, platform)
);

ALTER TABLE project_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_integrations_select" ON project_integrations
  FOR SELECT USING (is_admin_or_subadmin());

CREATE POLICY "project_integrations_insert" ON project_integrations
  FOR INSERT WITH CHECK (is_admin_or_subadmin());

CREATE POLICY "project_integrations_update" ON project_integrations
  FOR UPDATE USING (is_admin_or_subadmin());

CREATE POLICY "project_integrations_delete" ON project_integrations
  FOR DELETE USING (is_admin_or_subadmin());

-- Migrate existing meta_ad_account_id data (if any) before dropping the column
INSERT INTO project_integrations (project_id, platform, account_id)
  SELECT project_id, 'meta', meta_ad_account_id
  FROM paid_media_context
  WHERE meta_ad_account_id IS NOT NULL
ON CONFLICT (project_id, platform) DO NOTHING;

ALTER TABLE paid_media_context DROP COLUMN IF EXISTS meta_ad_account_id;
