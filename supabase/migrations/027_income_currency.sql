-- ============================================================
-- 027: Multi-currency support for income (MXN clients, USD dashboard)
-- ============================================================

-- amount sigue siendo el equivalente en USD (usado por todos los cálculos existentes).
-- original_amount/currency/exchange_rate guardan el monto y tipo de cambio originales.
ALTER TABLE income
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'MXN')),
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10, 4);
