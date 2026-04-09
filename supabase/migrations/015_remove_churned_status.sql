-- Remove 'Churned' customer status
-- Convert any existing Churned customers to Inactive, then tighten the constraint.

UPDATE customers SET status = 'Inactive' WHERE status = 'Churned';

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_status_check
  CHECK (status IN ('Prospect', 'Active', 'Inactive'));
