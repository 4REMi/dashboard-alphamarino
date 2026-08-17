-- ============================================================
-- 056_image_clone_review_step.sql
-- Not every generated variant is a keeper. Adds a "reviewing"
-- status between "generating" and "done": pollImageGeneration()
-- now lands here with ALL mirrored variants once Replicate
-- settles, and finalizeImageClone() (called when the user picks
-- which ones to keep) moves it to "done" with only the kept URLs
-- — or deletes the row entirely if nothing was kept.
-- ============================================================

ALTER TABLE image_clones DROP CONSTRAINT IF EXISTS image_clones_status_check;
ALTER TABLE image_clones ADD CONSTRAINT image_clones_status_check
  CHECK (status IN ('pending', 'extracting', 'ready', 'generating', 'reviewing', 'done', 'error'));
