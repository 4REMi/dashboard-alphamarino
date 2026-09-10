-- ============================================================
-- 071_brief_skip_transcription.sql
-- Lets a video reference attached to a brief opt OUT of automatic
-- transcription/tropicalization — some video references (b-roll
-- montages, stitched clips, no dialogue) have nothing to transcribe,
-- and burning AssemblyAI + Claude tokens trying was wasted work.
-- Default stays empty (every video reference transcribes, same as
-- today) so existing briefs are unaffected.
-- ============================================================

ALTER TABLE creative_briefs ADD COLUMN IF NOT EXISTS no_transcribe_ad_ids UUID[] NOT NULL DEFAULT '{}';
