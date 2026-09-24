-- Amplía las métricas crudas por día para poder ofrecer mucho más que
-- Inversión/CTR/CPC/CPM/Costo-Resultado/ROAS/Resultados en el picker de
-- "Métricas a mostrar en el grid de creativos" (paid-media-context-card).
-- reach/frequency vienen directo del insights de Meta; link_clicks y
-- video_views se extraen de actions[] igual que resultados (ver
-- pickResults en lib/actions/meta.ts) — clics en enlace específicamente,
-- no el total de "clicks" (que incluye cualquier interacción).
ALTER TABLE meta_ad_daily_stats
  ADD COLUMN IF NOT EXISTS reach       INTEGER,
  ADD COLUMN IF NOT EXISTS frequency   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS link_clicks INTEGER,
  ADD COLUMN IF NOT EXISTS video_views INTEGER;
