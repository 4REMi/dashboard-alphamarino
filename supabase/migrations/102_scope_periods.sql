-- Alcance del servicio: periodo por proyecto (no calendario), historial y
-- entregables continuos.
--
-- Regla de periodo del proyecto. NULL = automática: los ciclos del
-- proyecto si tiene (paid media), si no, mensual desde su fecha de inicio.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_period_mode TEXT
  CHECK (scope_period_mode IN ('cycles', 'monthly', 'weeks', 'calendar'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_period_anchor DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_period_weeks INT CHECK (scope_period_weeks > 0);

-- Fin del periodo (para el historial) y marcas hechas después de que
-- el periodo terminó.
ALTER TABLE project_deliverable_periods ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE project_deliverable_periods ADD COLUMN IF NOT EXISTS marked_late BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE project_deliverable_periods ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

-- Entregables continuos (gestión, optimización): parte del alcance, sin conteo.
ALTER TABLE project_custom_deliverables DROP CONSTRAINT IF EXISTS project_custom_deliverables_cadence_check;
ALTER TABLE project_custom_deliverables ADD CONSTRAINT project_custom_deliverables_cadence_check
  CHECK (cadence IN ('once', 'monthly', 'quarterly', 'biannual', 'continuous'));

NOTIFY pgrst, 'reload schema';
