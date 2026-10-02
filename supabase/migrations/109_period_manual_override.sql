-- Marca explícita de que un periodo se editó a mano (lápiz en Alcance del
-- servicio). Sin la marca, el periodo sigue a la oferta: texto de control
-- actual y, si no se ha entregado nada, la cantidad actual.
ALTER TABLE project_deliverable_periods ADD COLUMN IF NOT EXISTS text_overridden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE project_deliverable_periods ADD COLUMN IF NOT EXISTS quantity_overridden BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
