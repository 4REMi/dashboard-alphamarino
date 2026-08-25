-- ============================================================
-- 061_organic_discovery_foundation.sql
-- Phase 1 of Organic Discovery: lets tracked_brands and saved_ads
-- also represent organic Instagram posts, not just Meta ads.
-- No UI/fetch logic yet — just the data model.
-- ============================================================

-- A tracked competitor can now be followed by Instagram handle too,
-- independent of (or in addition to) its Meta Page ID.
ALTER TABLE tracked_brands ADD COLUMN IF NOT EXISTS instagram_handle TEXT;

-- ad_archive_id only exists for Meta ads — organic posts have no such
-- id, so it has to become nullable. Postgres allows multiple NULLs
-- under a UNIQUE constraint, so existing meta_ad rows keep their
-- uniqueness guarantee unaffected.
ALTER TABLE saved_ads ALTER COLUMN ad_archive_id DROP NOT NULL;

-- post_type distinguishes what a saved_ads row actually is. Named
-- differently from the existing `source` column (discovery/upload,
-- how it was captured) — this is about what kind of content it is.
ALTER TABLE saved_ads ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'meta_ad'
  CHECK (post_type IN ('meta_ad', 'organic_post'));

-- Organic-post-specific fields (null for meta_ad rows).
ALTER TABLE saved_ads ADD COLUMN IF NOT EXISTS caption         TEXT;
ALTER TABLE saved_ads ADD COLUMN IF NOT EXISTS likes_count     BIGINT;
ALTER TABLE saved_ads ADD COLUMN IF NOT EXISTS comments_count  BIGINT;
ALTER TABLE saved_ads ADD COLUMN IF NOT EXISTS post_url        TEXT;
ALTER TABLE saved_ads ADD COLUMN IF NOT EXISTS posted_at       TIMESTAMPTZ;

-- external_id is organic posts' equivalent of ad_archive_id (e.g. the
-- IG shortcode) — its own column so we don't overload ad_archive_id's
-- Meta-specific semantics. Unique only among organic posts.
ALTER TABLE saved_ads ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS saved_ads_organic_external_id_idx
  ON saved_ads (external_id) WHERE post_type = 'organic_post';

-- Carousel support: multiple images for one organic post. Single-image
-- or video/Reel posts keep using the existing image_url/video_url
-- columns untouched.
ALTER TABLE saved_ads ADD COLUMN IF NOT EXISTS carousel_image_urls        TEXT[] DEFAULT '{}';
ALTER TABLE saved_ads ADD COLUMN IF NOT EXISTS cached_carousel_image_urls TEXT[] DEFAULT '{}';

-- Phase 4 groundwork: ties together the N independent image_clones
-- rows produced by "Clonar carrusel completo" into one batch, without
-- changing what a single image_clones row means.
ALTER TABLE image_clones ADD COLUMN IF NOT EXISTS batch_id UUID;
CREATE INDEX IF NOT EXISTS image_clones_batch_id_idx ON image_clones(batch_id);
