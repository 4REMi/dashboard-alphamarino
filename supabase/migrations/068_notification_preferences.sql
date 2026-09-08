-- ============================================================
-- 068_notification_preferences.sql
-- Tracks when a Telegram link was made/broken (last transition of
-- each kind, not full history), and per-event notification
-- preferences per person — opt-out model, same shape as profiles.permissions:
-- absent/true = enabled, explicit false = disabled for that event_key.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_unlinked_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- New status so notify() can distinguish "no Telegram linked" from
-- "linked, but this person turned this specific event off".
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_status_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_status_check
  CHECK (status IN ('sent', 'failed', 'skipped_no_channel', 'skipped_disabled'));
