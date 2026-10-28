-- Hub de cotizaciones (solo admin): leads que requieren propuesta. Entran
-- desde GHL (etapa "Proposal Pending"), a mano, o desde el atajo del iPhone
-- (vía el callback de Make). La propuesta se genera con el escenario de Make
-- y su PDF regresa al lead.
CREATE TABLE IF NOT EXISTS quote_leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source               TEXT NOT NULL DEFAULT 'manual',   -- ghl | manual | atajo
  ghl_contact_id       TEXT,
  ghl_opportunity_id   TEXT UNIQUE,
  name                 TEXT NOT NULL,
  company              TEXT,
  email                TEXT,
  phone                TEXT,
  giro                 TEXT,
  site_type            TEXT,      -- lo que contestó en GHL
  problem              TEXT,
  socials              TEXT,
  website              TEXT,
  investment           TEXT,
  business_size        TEXT,
  offer                TEXT,
  ai_summary           TEXT,
  form_answers         TEXT,
  notes                TEXT,
  proposal_type        TEXT,      -- web_informativo | web_ecommerce | otra:<nombre>
  price                NUMERIC,
  status               TEXT NOT NULL DEFAULT 'nuevo',
                       -- nuevo | lista | generando | generada | enviada | ganada | perdida | error
  proposal_pdf_url     TEXT,
  proposal_slides_url  TEXT,
  proposal_generated_at TIMESTAMPTZ,
  last_error           TEXT,
  raw                  JSONB
);
CREATE INDEX IF NOT EXISTS quote_leads_status_idx ON quote_leads (status, created_at DESC);

ALTER TABLE quote_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quote_leads_admin ON quote_leads;
CREATE POLICY quote_leads_admin ON quote_leads FOR ALL USING (is_admin()) WITH CHECK (is_admin());

NOTIFY pgrst, 'reload schema';
