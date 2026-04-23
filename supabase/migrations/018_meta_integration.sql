-- Add Meta Ads account ID to paid_media_context (token lives in env, not DB)
ALTER TABLE paid_media_context
  ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT;

-- Store synced campaign metrics per cycle
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id      UUID REFERENCES paid_media_cycles(id) ON DELETE SET NULL,
  campaign_id   TEXT NOT NULL,
  campaign_name TEXT,
  spend         NUMERIC(14,2),
  impressions   BIGINT,
  clicks        BIGINT,
  ctr           NUMERIC(10,4),
  cpc           NUMERIC(14,2),
  cpm           NUMERIC(14,2),
  reach         BIGINT,
  results       NUMERIC(14,2),
  results_type  TEXT,
  date_start    DATE,
  date_stop     DATE,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, cycle_id, campaign_id)
);

ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_campaigns_select" ON meta_campaigns
  FOR SELECT USING (is_admin_or_subadmin());

CREATE POLICY "meta_campaigns_insert" ON meta_campaigns
  FOR INSERT WITH CHECK (is_admin_or_subadmin());

CREATE POLICY "meta_campaigns_update" ON meta_campaigns
  FOR UPDATE USING (is_admin_or_subadmin());

CREATE POLICY "meta_campaigns_delete" ON meta_campaigns
  FOR DELETE USING (is_admin_or_subadmin());
