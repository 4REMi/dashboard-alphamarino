-- ============================================================
-- 026: Tax breakdown for income/project_expenses + expense_date
--       for one-time recurring expenses
-- ============================================================

-- income / project_expenses: monto neto (amount) + desglose opcional de impuestos
ALTER TABLE income
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2);

ALTER TABLE project_expenses
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2);

-- recurring_expenses: fecha real del gasto para frecuencia "One-time"
ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS expense_date DATE;
