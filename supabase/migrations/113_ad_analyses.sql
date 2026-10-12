-- Análisis de concepto de anuncios de la librería (Ad Lab). Se guarda por
-- anuncio para reabrirlo al instante y, después, para ver patrones por marca.
CREATE TABLE IF NOT EXISTS ad_analyses (
  ad_archive_id TEXT PRIMARY KEY,
  page_id       TEXT,
  page_name     TEXT,
  media_type    TEXT,                 -- video | image
  analysis      JSONB NOT NULL,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_analyses_page ON ad_analyses(page_id);
ALTER TABLE ad_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_analyses_read" ON ad_analyses FOR SELECT USING (auth.uid() IS NOT NULL);
-- Escrituras solo desde el servidor (cliente admin).
NOTIFY pgrst, 'reload schema';
