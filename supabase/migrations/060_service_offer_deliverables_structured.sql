-- ============================================================
-- 060_service_offer_deliverables_structured.sql
-- deliverables goes from a flat text[] to a JSONB array of
-- {text, cadence} objects — lays the groundwork for eventually
-- tracking, per project cycle, which recurring deliverables have
-- shipped. cadence: 'once' | 'monthly' | 'quarterly' | 'biannual'.
-- ============================================================

ALTER TABLE service_offers
  ALTER COLUMN deliverables TYPE JSONB
  USING (
    CASE
      WHEN deliverables IS NULL OR array_length(deliverables, 1) IS NULL THEN '[]'::jsonb
      ELSE (SELECT jsonb_agg(jsonb_build_object('text', d, 'cadence', 'once')) FROM unnest(deliverables) AS d)
    END
  );

ALTER TABLE service_offers ALTER COLUMN deliverables SET DEFAULT '[]'::jsonb;
