-- Los puntos de comparación de tendencia pasan a ser los mismos presets
-- que ya ofrece Meta Ads Manager (últimos 3/7/14 días, ayer, inicio del
-- ciclo) en vez de un "promedio del ciclo" genérico — reemplaza
-- 'cycle_avg' por 'last_7d' (la lectura más cercana: un promedio de
-- varios días recientes, solo que acotado a una ventana fija en vez de
-- "todo lo que lleve corriendo el ciclo").
ALTER TABLE paid_media_context DROP CONSTRAINT IF EXISTS paid_media_context_trend_window_check;

UPDATE paid_media_context SET trend_window = 'last_7d' WHERE trend_window = 'cycle_avg';

-- campaign_trend_overrides es un JSONB {campaign_id: trend_window} — mismo
-- reemplazo, valor por valor.
UPDATE paid_media_context
SET campaign_trend_overrides = (
  SELECT jsonb_object_agg(key, CASE WHEN value = '"cycle_avg"' THEN '"last_7d"'::jsonb ELSE value END)
  FROM jsonb_each(campaign_trend_overrides)
)
WHERE campaign_trend_overrides::text LIKE '%cycle_avg%';

ALTER TABLE paid_media_context ADD CONSTRAINT paid_media_context_trend_window_check
  CHECK (trend_window IN ('previous_day', 'last_3d', 'last_7d', 'last_14d', 'baseline'));
