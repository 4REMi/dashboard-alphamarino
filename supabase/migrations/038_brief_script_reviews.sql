-- ============================================================
-- 038_brief_script_reviews.sql
-- Fix: client_status/client_feedback on creative_briefs (037) were
-- whole-brief fields, but one brief can hold multiple scripts
-- (adapted_script keyed by reference ad id) — approving one script
-- flipped the status for all of them. Move review state to a
-- per-script JSONB map instead.
-- ============================================================

ALTER TABLE creative_briefs
  ADD COLUMN IF NOT EXISTS script_reviews JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Best-effort backfill: legacy single-script briefs (adapted_script as a
-- plain array) map to the "_single" key. Multi-script briefs can't be
-- disambiguated retroactively (the old design never tracked which script
-- was reviewed), so their old status is carried forward onto every key.
UPDATE creative_briefs
SET script_reviews = (
  SELECT jsonb_object_agg(
    CASE WHEN jsonb_typeof(adapted_script) = 'array' THEN '_single' ELSE key END,
    jsonb_build_object('client_status', client_status, 'client_feedback', client_feedback)
  )
  FROM jsonb_each(
    CASE WHEN jsonb_typeof(adapted_script) = 'array'
      THEN jsonb_build_object('_single', adapted_script)
      ELSE adapted_script
    END
  )
)
WHERE adapted_script IS NOT NULL
  AND client_status IS NOT NULL
  AND script_reviews = '{}'::jsonb;

ALTER TABLE creative_briefs
  DROP COLUMN IF EXISTS client_status,
  DROP COLUMN IF EXISTS client_feedback;
