-- ============================================================
-- 037_brief_client_review.sql
-- Client-facing approval for tropicalized video scripts inside
-- a Creative Brief. Decoupled from the editor-facing brief
-- content (brief_content, attached_ad_ids, etc.) — the client
-- portal only ever reads adapted_script + these two columns.
-- ============================================================

ALTER TABLE creative_briefs
  ADD COLUMN IF NOT EXISTS client_status   TEXT
    CHECK (client_status IN ('pending_review', 'approved', 'changes_requested')),
  ADD COLUMN IF NOT EXISTS client_feedback TEXT;

-- Backfill: only briefs that actually have a script are relevant to the client.
UPDATE creative_briefs
SET client_status = 'pending_review'
WHERE adapted_script IS NOT NULL
  AND client_status IS NULL;
