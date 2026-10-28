-- Hub de cotizaciones: cuándo se envió (para el seguimiento de "sin
-- respuesta") y cuándo se cerró (ganada/perdida, para la tasa de cierre).
ALTER TABLE quote_leads ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE quote_leads ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';
