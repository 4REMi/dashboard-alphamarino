-- ============================================================
-- 058_service_catalog_currency.sql
-- Prices in the service catalog aren't all USD — add a currency
-- switch (USD/MXN) per offer and per addon, matching the
-- Currency type already used elsewhere (income.currency).
-- ============================================================

ALTER TABLE service_offers ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'MXN'
  CHECK (currency IN ('USD', 'MXN'));
ALTER TABLE service_addons ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'MXN'
  CHECK (currency IN ('USD', 'MXN'));
