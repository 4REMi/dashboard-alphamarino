-- Hub Paid Media, reconstruido creative-first: en vez de un formulario
-- manual de "real_spend/roas_real/cpa_real/cpl_real" (que nadie llenaba
-- porque duplicaba lo que ya sincroniza Meta) y una tabla de campañas
-- donde el creativo estaba enterrado 3 clics abajo, la unidad primaria
-- pasa a ser el AD individual de Meta con su propia miniatura y métrica.

-- ── Dimensión: un ad real de Meta (creativo + a qué campaña/ad set pertenece) ──
CREATE TABLE IF NOT EXISTS meta_ads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ad_id         TEXT NOT NULL,
  ad_name       TEXT,
  ad_set_id     TEXT,
  ad_set_name   TEXT,
  campaign_id   TEXT,
  campaign_name TEXT,
  status        TEXT,
  thumbnail_url TEXT,
  image_url     TEXT,
  video_url     TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, ad_id)
);

ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_ads_select" ON meta_ads FOR SELECT USING (is_admin_or_subadmin());
CREATE POLICY "meta_ads_insert" ON meta_ads FOR INSERT WITH CHECK (is_admin_or_subadmin());
CREATE POLICY "meta_ads_update" ON meta_ads FOR UPDATE USING (is_admin_or_subadmin());
CREATE POLICY "meta_ads_delete" ON meta_ads FOR DELETE USING (is_admin_or_subadmin());

-- ── Hechos: una fila por ad por día (time_increment=1 en el sync) — es lo
-- que permite calcular tendencia (día anterior / promedio del ciclo /
-- baseline) sin depender de qué tan seguido alguien le da "Sincronizar".
CREATE TABLE IF NOT EXISTS meta_ad_daily_stats (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id       UUID REFERENCES paid_media_cycles(id) ON DELETE SET NULL,
  ad_id          TEXT NOT NULL,
  date           DATE NOT NULL,
  spend          NUMERIC(14,2),
  impressions    BIGINT,
  clicks         BIGINT,
  results        NUMERIC(14,2),
  results_type   TEXT,
  purchase_value NUMERIC(14,2),
  synced_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_stats_lookup ON meta_ad_daily_stats(project_id, ad_id, date DESC);

ALTER TABLE meta_ad_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_ad_daily_stats_select" ON meta_ad_daily_stats FOR SELECT USING (is_admin_or_subadmin());
CREATE POLICY "meta_ad_daily_stats_insert" ON meta_ad_daily_stats FOR INSERT WITH CHECK (is_admin_or_subadmin());
CREATE POLICY "meta_ad_daily_stats_update" ON meta_ad_daily_stats FOR UPDATE USING (is_admin_or_subadmin());
CREATE POLICY "meta_ad_daily_stats_delete" ON meta_ad_daily_stats FOR DELETE USING (is_admin_or_subadmin());

-- ── Puente many-to-many: qué creative_assets (producido internamente, con
-- su concept_id) SE VOLVIÓ cuál ad real de Meta. Nunca bloqueante — se
-- vincula desde la propia tarjeta, cuando sea, no en un paso obligatorio
-- upstream. Many-to-many porque un asset puede resizearse en variantes que
-- corren como ads distintos, y un mismo creativo puede reusarse en más de
-- una campaña (prospecting + retargeting).
CREATE TABLE IF NOT EXISTS creative_asset_meta_ads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_asset_id UUID NOT NULL REFERENCES creative_assets(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  meta_ad_id        TEXT NOT NULL,
  linked_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  linked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creative_asset_id, meta_ad_id)
);

CREATE INDEX IF NOT EXISTS idx_creative_asset_meta_ads_ad ON creative_asset_meta_ads(project_id, meta_ad_id);

ALTER TABLE creative_asset_meta_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creative_asset_meta_ads_select" ON creative_asset_meta_ads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "creative_asset_meta_ads_insert" ON creative_asset_meta_ads FOR INSERT WITH CHECK (auth.uid() = linked_by);
CREATE POLICY "creative_asset_meta_ads_delete" ON creative_asset_meta_ads FOR DELETE USING (auth.uid() IS NOT NULL);

-- ── Preferencias de visualización del grid creative-first — qué métricas
-- mostrar (por proyecto) y con qué ventana de tendencia, con override por
-- campaña vía JSONB en vez de una tabla nueva para algo tan chico.
ALTER TABLE paid_media_context ADD COLUMN IF NOT EXISTS display_metrics TEXT[] NOT NULL DEFAULT ARRAY['spend', 'cost_per_result']::TEXT[];
ALTER TABLE paid_media_context ADD COLUMN IF NOT EXISTS trend_window TEXT NOT NULL DEFAULT 'previous_day'
  CHECK (trend_window IN ('previous_day', 'cycle_avg', 'baseline'));
ALTER TABLE paid_media_context ADD COLUMN IF NOT EXISTS campaign_trend_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
