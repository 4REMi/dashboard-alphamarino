-- ============================================================
-- 062_fix_organic_external_id_unique.sql
-- saveOrganicPost() upserts with ON CONFLICT (external_id), but
-- 061 created a PARTIAL unique index (WHERE post_type =
-- 'organic_post'). Postgres can't match a plain ON CONFLICT
-- clause against a partial index — the upsert failed silently.
-- Swapped for a plain unique index; NULLs (all meta_ad rows)
-- are still unaffected since UNIQUE allows multiple NULLs.
-- ============================================================

DROP INDEX IF EXISTS saved_ads_organic_external_id_idx;
CREATE UNIQUE INDEX IF NOT EXISTS saved_ads_external_id_idx ON saved_ads (external_id);
