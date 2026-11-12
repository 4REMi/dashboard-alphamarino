-- Campos nuevos de las ofertas de Servicios (catálogo). Todos opcionales e
-- informativos del catálogo: ningún proyecto los lee; el fee de cada
-- proyecto sigue siendo su propio campo (projects.monthly_fee).
--
-- - recommended_ad_budget / _note: presupuesto de pauta recomendado para
--   el cliente (en la moneda de la oferta) y texto libre ("Desde $10,000/mes").
-- - cycle_count / cycle_length_days: duración del servicio ("3 ciclos de
--   30 días"). La periodicidad del PRECIO sigue en price_note.
-- - sort_order: orden manual dentro de la categoría (menor = primero; null =
--   después, por nombre).
ALTER TABLE service_offers
  ADD COLUMN IF NOT EXISTS recommended_ad_budget      NUMERIC(12,2) CHECK (recommended_ad_budget IS NULL OR recommended_ad_budget >= 0),
  ADD COLUMN IF NOT EXISTS recommended_ad_budget_note TEXT,
  ADD COLUMN IF NOT EXISTS cycle_count                INTEGER CHECK (cycle_count IS NULL OR cycle_count > 0),
  ADD COLUMN IF NOT EXISTS cycle_length_days          INTEGER CHECK (cycle_length_days IS NULL OR cycle_length_days > 0),
  ADD COLUMN IF NOT EXISTS sort_order                 INTEGER;

NOTIFY pgrst, 'reload schema';
