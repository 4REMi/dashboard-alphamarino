-- ============================================================
-- 060_service_offer_deliverables_structured.sql
-- deliverables goes from a flat text[] to a JSONB array of
-- {text, cadence} objects — lays the groundwork for eventually
-- tracking, per project cycle, which recurring deliverables have
-- shipped. cadence: 'once' | 'monthly' | 'quarterly' | 'biannual'.
--
-- Postgres doesn't allow a subquery inside ALTER COLUMN ... USING,
-- so this converts via a temp column + backfill + swap instead of a
-- single-step type change.
-- ============================================================

ALTER TABLE service_offers ADD COLUMN IF NOT EXISTS deliverables_jsonb JSONB;

UPDATE service_offers
SET deliverables_jsonb = COALESCE(
  (SELECT jsonb_agg(jsonb_build_object('text', d, 'cadence', 'once')) FROM unnest(deliverables) AS d),
  '[]'::jsonb
)
WHERE deliverables_jsonb IS NULL;

ALTER TABLE service_offers ALTER COLUMN deliverables_jsonb SET DEFAULT '[]'::jsonb;
ALTER TABLE service_offers ALTER COLUMN deliverables_jsonb SET NOT NULL;

ALTER TABLE service_offers DROP COLUMN deliverables;
ALTER TABLE service_offers RENAME COLUMN deliverables_jsonb TO deliverables;
