-- Totales "Máximo" (toda la vida de la campaña/anuncio, date_preset=maximum,
-- el mismo preset de Ads Manager) — para el selector Ciclo / Máximo del mapa.
-- No depende del ciclo: una fila por objeto, se sobreescribe en cada sync.
CREATE TABLE IF NOT EXISTS meta_lifetime_stats (
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  level          TEXT NOT NULL CHECK (level IN ('ad', 'campaign')),
  object_id      TEXT NOT NULL,
  spend          DOUBLE PRECISION,
  impressions    INTEGER,
  clicks         INTEGER,
  reach          INTEGER,
  frequency      DOUBLE PRECISION,
  results        DOUBLE PRECISION,
  results_type   TEXT,
  purchase_value DOUBLE PRECISION,
  link_clicks    INTEGER,
  video_views    INTEGER,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, level, object_id)
);

ALTER TABLE meta_lifetime_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_lifetime_stats_select" ON meta_lifetime_stats FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "meta_lifetime_stats_insert" ON meta_lifetime_stats FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "meta_lifetime_stats_update" ON meta_lifetime_stats FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "meta_lifetime_stats_delete" ON meta_lifetime_stats FOR DELETE USING (auth.uid() IS NOT NULL);
