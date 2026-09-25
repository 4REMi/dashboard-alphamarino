-- Campañas manuales: canales sin integración (TikTok, Pinterest…) que se
-- operan para el cliente. Nivel campaña, con assets del dashboard
-- vinculados y métricas capturadas a mano como acumulado a una fecha.
-- Internas: el portal del cliente no las lee.
CREATE TABLE IF NOT EXISTS manual_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  result_type TEXT,
  start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date    DATE,
  -- Cuando exista la integración real del canal: id de la campaña real.
  external_id TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manual_campaigns_project ON manual_campaigns(project_id);

CREATE TABLE IF NOT EXISTS manual_campaign_assets (
  campaign_id UUID NOT NULL REFERENCES manual_campaigns(id) ON DELETE CASCADE,
  asset_id    UUID NOT NULL REFERENCES creative_assets(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, asset_id)
);

-- Acumulado de la campaña al día as_of (lo que muestra el Ads Manager del
-- canal). Lo de un ciclo = última captura dentro del ciclo − última antes.
CREATE TABLE IF NOT EXISTS manual_campaign_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES manual_campaigns(id) ON DELETE CASCADE,
  as_of       DATE NOT NULL,
  spend       NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT,
  clicks      BIGINT,
  results     NUMERIC,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, as_of)
);

-- Solo equipo (el cliente no tiene perfil de equipo).
ALTER TABLE manual_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_campaign_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_campaign_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manual_campaigns_all" ON manual_campaigns FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "manual_campaign_assets_all" ON manual_campaign_assets FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "manual_campaign_snapshots_all" ON manual_campaign_snapshots FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
