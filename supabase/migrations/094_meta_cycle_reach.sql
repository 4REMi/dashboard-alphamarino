-- Alcance/frecuencia deduplicados por Meta sobre TODO el rango del ciclo,
-- a nivel ad y a nivel campaña. No se pueden derivar de filas diarias ni
-- sumando ads (la deduplicación de personas únicas solo la hace Meta), así
-- que se guardan tal cual los regresa la API para que coincidan 1 a 1 con
-- Ads Manager.
CREATE TABLE IF NOT EXISTS meta_cycle_reach (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id   TEXT NOT NULL,
  level      TEXT NOT NULL CHECK (level IN ('ad', 'campaign')),
  object_id  TEXT NOT NULL,
  reach      INTEGER,
  frequency  DOUBLE PRECISION,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, cycle_id, level, object_id)
);

ALTER TABLE meta_cycle_reach ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_cycle_reach_select" ON meta_cycle_reach FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "meta_cycle_reach_insert" ON meta_cycle_reach FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "meta_cycle_reach_update" ON meta_cycle_reach FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "meta_cycle_reach_delete" ON meta_cycle_reach FOR DELETE USING (auth.uid() IS NOT NULL);
