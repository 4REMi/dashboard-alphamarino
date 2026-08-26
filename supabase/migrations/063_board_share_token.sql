-- ============================================================
-- 063_board_share_token.sql
-- Read-only public moodboard link for ad_boards — same
-- share_token pattern already used for briefs and clones.
-- No tropicalization/action surface on the public page, just
-- the saved images/videos.
-- ============================================================

ALTER TABLE ad_boards ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE DEFAULT gen_random_uuid()::text;
ALTER TABLE ad_boards ALTER COLUMN share_token SET NOT NULL;
