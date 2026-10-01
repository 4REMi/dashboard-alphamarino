-- Reporte mensual de bonos: cada empleado de nómina registra las
-- actividades que corresponden a sus bonos pactados y lo envía (fecha
-- límite: día 3 del mes siguiente). El admin aprueba o rechaza cada una;
-- aprobar crea el bono pendiente de pago en Nómina.

CREATE TABLE IF NOT EXISTS bonus_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_month  DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reviewed')),
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, period_month)
);

CREATE TABLE IF NOT EXISTS bonus_report_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES bonus_reports(id) ON DELETE CASCADE,
  agreement_id    UUID REFERENCES bonus_agreements(id) ON DELETE SET NULL,
  description     TEXT NOT NULL,
  evidence_url    TEXT,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_comment   TEXT,
  approved_amount NUMERIC(12, 2),
  payroll_item_id UUID REFERENCES payroll_items(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bonus_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_report_items ENABLE ROW LEVEL SECURITY;

-- Admin: todo.
CREATE POLICY "bonus_reports_admin" ON bonus_reports FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "bonus_report_items_admin" ON bonus_report_items FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Empleado: solo su propio reporte. Las reglas de edición (borrador y fecha
-- límite) se validan en el servidor (lib/actions/my-compensation.ts).
CREATE POLICY "bonus_reports_own" ON bonus_reports FOR ALL
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "bonus_report_items_own" ON bonus_report_items FOR ALL
  USING (EXISTS (SELECT 1 FROM bonus_reports r WHERE r.id = report_id AND r.profile_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM bonus_reports r WHERE r.id = report_id AND r.profile_id = auth.uid()));

-- Empleado: puede LEER su propia compensación (nunca la de otros).
CREATE POLICY "compensation_profiles_own_read" ON compensation_profiles FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "bonus_agreements_own_read" ON bonus_agreements FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "payroll_items_own_read" ON payroll_items FOR SELECT USING (profile_id = auth.uid());

NOTIFY pgrst, 'reload schema';
