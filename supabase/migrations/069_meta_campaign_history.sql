-- ============================================================
-- 069_meta_campaign_history.sql
-- Historial de Meta: creativos importados de campañas pasadas de la
-- cuenta publicitaria de un cliente (vía META_SYSTEM_USER_TOKEN),
-- independiente del ciclo activo de paid media. Vive debajo del
-- Creative Tracker normal — ver components/projects/hub/creatives/meta-history.tsx.
--
-- Las métricas (spend/results/etc.) son a nivel CAMPAÑA (lifetime),
-- copiadas a cada creativo importado de esa campaña — no se pide una
-- llamada de insights por anuncio individual para no multiplicar las
-- llamadas a la API de Meta por cada creativo seleccionado.
-- ============================================================

CREATE TABLE IF NOT EXISTS meta_campaign_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  ad_set_id TEXT NOT NULL,
  ad_set_name TEXT,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  image_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  body TEXT,
  title TEXT,
  cta TEXT,
  -- Métricas de la campaña (lifetime), copiadas al momento de importar
  spend NUMERIC,
  impressions BIGINT,
  clicks BIGINT,
  ctr NUMERIC,
  cpc NUMERIC,
  results BIGINT,
  results_type TEXT,
  date_start DATE,
  date_stop DATE,
  imported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, ad_id)
);

CREATE INDEX IF NOT EXISTS meta_campaign_creatives_project_id_idx ON meta_campaign_creatives(project_id);

-- Mirrors creative_assets' own RLS shape (see 017_creative_tracker.sql):
-- project members + admins can read, only admin/subadmin can write.
ALTER TABLE meta_campaign_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcc_select" ON meta_campaign_creatives FOR SELECT
  USING (
    is_admin_or_subadmin()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = meta_campaign_creatives.project_id
        AND pm.profile_id = auth.uid()
    )
  );

CREATE POLICY "mcc_write" ON meta_campaign_creatives FOR ALL
  USING (is_admin_or_subadmin())
  WITH CHECK (is_admin_or_subadmin());
