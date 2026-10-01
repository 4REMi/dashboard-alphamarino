-- Nómina: compensación por persona, acuerdos de bono y pagos (solo admin).
-- Montos brutos, en la moneda de cada concepto (MXN o USD). Al marcar un
-- pago como pagado se crea su gasto en Finanzas (recurring_expenses
-- One-time, categoría Payroll, en USD con el tipo de cambio del día).

CREATE TABLE IF NOT EXISTS compensation_profiles (
  profile_id  UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  scheme      TEXT NOT NULL DEFAULT 'fixed' CHECK (scheme IN ('fixed', 'commission', 'mixed')),
  base_salary NUMERIC(12, 2),            -- mensual; NULL si solo comisión
  currency    TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'MXN')),
  pay_day     INT NOT NULL DEFAULT 1 CHECK (pay_day BETWEEN 1 AND 31),
  starts_on   DATE NOT NULL DEFAULT CURRENT_DATE, -- desde qué mes se genera el salario
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historial de cambios de salario base.
CREATE TABLE IF NOT EXISTS compensation_salary_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount         NUMERIC(12, 2),
  currency       TEXT NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bonos pactados ("Onboarding bien ejecutado → $150"): se otorgan a mano.
CREATE TABLE IF NOT EXISTS bonus_agreements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  amount     NUMERIC(12, 2) NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'MXN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('salary', 'bonus', 'commission')),
  amount        NUMERIC(12, 2) NOT NULL,
  currency      TEXT NOT NULL CHECK (currency IN ('USD', 'MXN')),
  period_month  DATE NOT NULL,          -- primer día del mes al que corresponde
  due_date      DATE NOT NULL,
  reason        TEXT,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  agreement_id  UUID REFERENCES bonus_agreements(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'skipped')),
  paid_at       DATE,
  exchange_rate NUMERIC(12, 6),         -- USD→MXN usado al pagar (si fue en MXN)
  amount_usd    NUMERIC(12, 2),
  expense_id    UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payroll_items_month ON payroll_items(period_month);
-- Un solo salario por persona por mes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_salary_month ON payroll_items(profile_id, period_month) WHERE kind = 'salary';

ALTER TABLE compensation_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_salary_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compensation_profiles_admin" ON compensation_profiles FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "compensation_salary_history_admin" ON compensation_salary_history FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "bonus_agreements_admin" ON bonus_agreements FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "payroll_items_admin" ON payroll_items FOR ALL USING (is_admin()) WITH CHECK (is_admin());

NOTIFY pgrst, 'reload schema';
