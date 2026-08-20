-- ============================================================
-- 059_brief_script_titles.sql
-- A brief can hold several scripts (multiple tropicalizations/
-- variants under one concept), and they all showed up with the
-- same generic "Guión #N" label everywhere — no way to tell them
-- apart at a glance. Lets an admin name each script individually,
-- same pattern as creative_briefs.title.
-- ============================================================

ALTER TABLE creative_briefs ADD COLUMN IF NOT EXISTS script_titles JSONB NOT NULL DEFAULT '{}'::jsonb;
