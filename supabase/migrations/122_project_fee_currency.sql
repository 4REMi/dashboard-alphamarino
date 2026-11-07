-- Moneda del fee mensual de un proyecto. Antes el fee solo existía en USD:
-- un fee pactado en pesos se guardaba convertido al tipo de cambio de ese
-- día y se quedaba fijo, así que el MRR se desfasaba cuando se movía el peso.
--
-- monthly_fee sigue siendo el equivalente en USD (lo leen MRR, Finanzas,
-- reportes). Para fees en MXN, monthly_fee_original guarda el monto pactado
-- en pesos y el cron diario (/api/cron/check-cycles → refreshMxnFees,
-- lib/finance/project-fee.ts) recalcula monthly_fee con el tipo de cambio
-- del día.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS monthly_fee_currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (monthly_fee_currency IN ('USD', 'MXN')),
  ADD COLUMN IF NOT EXISTS monthly_fee_original NUMERIC(12,2);

NOTIFY pgrst, 'reload schema';
