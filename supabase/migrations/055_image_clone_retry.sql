-- ============================================================
-- 055_image_clone_retry.sql
-- Store the exact Replicate submission payload used for a
-- generation so pollImageGeneration() can resubmit individual
-- predictions that come back failed/canceled (e.g. transient
-- model-side rejections under concurrent load) instead of
-- silently returning fewer variants than requested.
-- ============================================================

ALTER TABLE image_clones ADD COLUMN IF NOT EXISTS generation_input JSONB;
ALTER TABLE image_clones ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
