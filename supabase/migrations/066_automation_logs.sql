-- ============================================================
-- 066_automation_logs.sql
-- Log of every inbound message/note processed by the Telegram bot
-- pipeline (lib/telegram-bot/router.ts), regardless of source
-- (Telegram text/photo, or a Vowen voice-dictation webhook). Backs
-- the "Automatizaciones" review section in /settings.
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('telegram', 'vowen')),
  raw_text TEXT NOT NULL,
  movements JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_logs_created_at_idx ON automation_logs(created_at DESC);

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only — this is a Settings-page review surface, and inserts only
-- ever come from the service-role client (webhook routes have no user
-- session), so there's no INSERT policy for regular authenticated users.
CREATE POLICY "al_select" ON automation_logs FOR SELECT
  USING (is_admin_or_subadmin());
