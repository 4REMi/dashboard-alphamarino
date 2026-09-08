-- ============================================================
-- 067_notification_infra.sql
-- Infrastructure for per-employee Telegram notifications, built to
-- scale: profiles.telegram_chat_id + a short-lived linking code
-- (verified manually — the employee sends the code to the bot), and
-- notification_log as the audit trail for every notify() call
-- (lib/notifications/notify.ts), regardless of which event triggered
-- it or whether it actually sent (no channel linked yet counts too).
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_link_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_link_code_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'telegram',
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped_no_channel')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_log_profile_id_idx ON notification_log(profile_id);
CREATE INDEX IF NOT EXISTS notification_log_created_at_idx ON notification_log(created_at DESC);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nl_select" ON notification_log FOR SELECT
  USING (is_admin_or_subadmin());
