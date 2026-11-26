-- ============================================================
-- 127_ad_audit_analysis_jobs.sql — Cola de análisis por partes
-- ============================================================
-- «Analizar partes» ya no depende del navegador: encola aquí y el
-- trabajador /api/audit-worker los procesa en el servidor (de 2 en 2,
-- encadenándose) aunque el usuario salga de la página.
-- Ver docs/agent-guides/auditorias.md. RLS sin políticas (como 124–126).

CREATE TABLE IF NOT EXISTS audit_analysis_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES audit_accounts(id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES audit_campaigns(id) ON DELETE CASCADE,
  ad_id        UUID NOT NULL REFERENCES audit_ads(id) ON DELETE CASCADE,
  analysis_key TEXT NOT NULL,                  -- audit:v:<video> / audit:i:<anuncio>
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'error')),
  error        TEXT,
  attempts     INT NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_status ON audit_analysis_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_campaign ON audit_analysis_jobs(campaign_id);
-- Un mismo video no se encola dos veces mientras está pendiente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_jobs_pending_key ON audit_analysis_jobs(analysis_key) WHERE status IN ('queued', 'running');

ALTER TABLE audit_analysis_jobs ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
