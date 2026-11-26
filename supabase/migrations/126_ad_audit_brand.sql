-- ============================================================
-- 126_ad_audit_brand.sql — Marca inferida en Auditorías
-- ============================================================
-- Brand Brain y Brand Lines INFERIDOS de las campañas de una cuenta
-- auditada (copy de los anuncios, páginas de destino, análisis de concepto
-- y el sitio web). Viven solo en auditorías: no aparecen en /brand-brains
-- hasta que alguien los "lleva" (promoted_*). Mismos campos que
-- brand_brains / brand_lines para que llevarlos sea copiar.
-- Ver docs/agent-guides/auditorias.md. RLS sin políticas (como 124/125).

CREATE TABLE IF NOT EXISTS audit_brand_brains (
  account_id               UUID PRIMARY KEY REFERENCES audit_accounts(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  industry                 TEXT,
  language                 TEXT DEFAULT 'es',
  description              TEXT,
  usps                     TEXT[] NOT NULL DEFAULT '{}',
  key_benefits             TEXT[] NOT NULL DEFAULT '{}',
  pain_points              TEXT[] NOT NULL DEFAULT '{}',
  target_audience          TEXT,
  key_features             TEXT[] NOT NULL DEFAULT '{}',
  ctas                     TEXT[] NOT NULL DEFAULT '{}',
  tone_of_voice            TEXT,
  brand_colors             JSONB NOT NULL DEFAULT '[]',
  additional_context       TEXT,
  sources                  JSONB NOT NULL DEFAULT '{}',   -- de qué se infirió
  promoted_brand_brain_id  UUID REFERENCES brand_brains(id) ON DELETE SET NULL,
  promoted_at              TIMESTAMPTZ,
  created_by               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_brand_lines (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               UUID NOT NULL REFERENCES audit_accounts(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  description              TEXT,
  usps                     TEXT[] NOT NULL DEFAULT '{}',
  pain_points              TEXT[] NOT NULL DEFAULT '{}',
  keywords                 TEXT[] NOT NULL DEFAULT '{}',
  color                    TEXT NOT NULL DEFAULT '#6366f1',
  position                 INT NOT NULL DEFAULT 0,
  landing_urls             TEXT[] NOT NULL DEFAULT '{}',
  promoted_brand_line_id   UUID REFERENCES brand_lines(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_brand_lines_account ON audit_brand_lines(account_id);

-- Cada anuncio auditado queda ligado a su línea (para ver qué funciona por línea).
ALTER TABLE audit_ads ADD COLUMN IF NOT EXISTS audit_brand_line_id UUID REFERENCES audit_brand_lines(id) ON DELETE SET NULL;

ALTER TABLE audit_brand_brains ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_brand_lines  ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
