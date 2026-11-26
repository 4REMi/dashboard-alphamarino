-- ============================================================
-- 125_ad_audit_hypotheses_metrics.sql — Auditorías, fases 2 y 3
-- ============================================================
-- Ver docs/agent-guides/auditorias.md. Mismo criterio que la 124: RLS sin
-- políticas, todo desde el servidor tras verificar access_ad_lab.

-- Hipótesis por campaña (generadas con IA a partir de los datos) y su
-- seguimiento: abierta → confirmada / descartada, con nota y fecha.
CREATE TABLE IF NOT EXISTS audit_hypotheses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES audit_campaigns(id) ON DELETE CASCADE,
  adset_id          UUID REFERENCES audit_adsets(id) ON DELETE CASCADE,
  part              TEXT NOT NULL DEFAULT 'general' CHECK (part IN ('gancho', 'cuerpo', 'cierre', 'tienda', 'general')),
  claim             TEXT NOT NULL,
  evidence          TEXT NOT NULL,
  test              TEXT,
  confidence        TEXT NOT NULL DEFAULT 'media' CHECK (confidence IN ('alta', 'media', 'baja')),
  ad_ids            UUID[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'discarded')),
  status_note       TEXT,
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  period_since      DATE,                     -- datos con los que se generó
  period_until      DATE,
  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_hypotheses_campaign ON audit_hypotheses(campaign_id);

-- Cambios de la agencia a las fórmulas de las métricas (lib/ad-audit/metrics.ts
-- → applyOverrides). Una fila por métrica cambiada; sin fila = la de fábrica.
CREATE TABLE IF NOT EXISTS audit_metric_overrides (
  metric_id   TEXT PRIMARY KEY,
  num         TEXT NOT NULL,
  den         TEXT NOT NULL,
  min_key     TEXT NOT NULL,
  min_value   NUMERIC NOT NULL DEFAULT 0,
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_hypotheses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_metric_overrides ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
