-- Raw purchase value (revenue) from Meta, only populated for sales-objective
-- campaigns. ROAS itself (purchase_value / spend) is computed in the UI so
-- both per-row and aggregate ROAS stay mathematically correct.
ALTER TABLE meta_campaigns ADD COLUMN IF NOT EXISTS purchase_value NUMERIC(14,2);
