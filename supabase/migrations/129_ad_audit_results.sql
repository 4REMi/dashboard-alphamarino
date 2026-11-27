-- ============================================================
-- 129_ad_audit_results.sql — Resultado por conjunto y más datos
-- ============================================================
-- Las auditorías dejan de asumir e-commerce: el «Resultado» de cada
-- conjunto es lo que optimiza (mismo criterio que la columna Resultados del
-- Ads Manager y que el Creative Tracker, lib/meta/result-spec.ts). Para no
-- depender de una lista fija de eventos, se guardan TODAS las acciones de
-- Meta por anuncio y día. Ver docs/agent-guides/auditorias.md.

-- Todas las acciones y sus valores por anuncio y día: { action_type: n }.
-- Conversiones con 7 días después del clic cuando Meta lo da.
ALTER TABLE audit_ad_daily ADD COLUMN IF NOT EXISTS actions       JSONB NOT NULL DEFAULT '{}';
ALTER TABLE audit_ad_daily ADD COLUMN IF NOT EXISTS action_values JSONB NOT NULL DEFAULT '{}';

-- Para qué optimiza cada conjunto y la corrección manual del resultado.
ALTER TABLE audit_adsets ADD COLUMN IF NOT EXISTS promoted_object JSONB;
ALTER TABLE audit_adsets ADD COLUMN IF NOT EXISTS result_override TEXT;   -- action_type elegido a mano (null = automático)

-- Datos del período que no se pueden sumar por día.
ALTER TABLE audit_ad_retention ADD COLUMN IF NOT EXISTS reach         BIGINT;
ALTER TABLE audit_ad_retention ADD COLUMN IF NOT EXISTS frequency     NUMERIC(8,2);
ALTER TABLE audit_ad_retention ADD COLUMN IF NOT EXISTS avg_watch_sec NUMERIC(8,2);
-- La curva puede faltar aunque haya alcance/frecuencia (imágenes).
ALTER TABLE audit_ad_retention ALTER COLUMN curve DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
