-- Reportes de Paid Media bajo demanda, para cualquier rango de fechas.
-- `data` = snapshot de los números del dashboard al generar (no cambia si
-- después se re-sincroniza); `sections` = la narrativa (borrador de IA,
-- editable); `notes` = lo que el equipo agrega (inbox, llamada con el cliente).
CREATE TABLE IF NOT EXISTS paid_media_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id     UUID REFERENCES paid_media_cycles(id) ON DELETE SET NULL,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  title        TEXT,
  notes        TEXT,
  data         JSONB NOT NULL,
  sections     JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'delivered')),
  delivered_at TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paid_media_reports_project ON paid_media_reports(project_id, created_at DESC);

ALTER TABLE paid_media_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paid_media_reports_all" ON paid_media_reports FOR ALL
  USING (is_admin_or_subadmin() OR EXISTS (SELECT 1 FROM project_members WHERE project_id = paid_media_reports.project_id AND profile_id = auth.uid()))
  WITH CHECK (is_admin_or_subadmin() OR EXISTS (SELECT 1 FROM project_members WHERE project_id = paid_media_reports.project_id AND profile_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
