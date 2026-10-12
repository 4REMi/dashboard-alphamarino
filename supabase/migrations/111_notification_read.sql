-- Bandeja de notificaciones en el inicio del dashboard: lo mismo que llega
-- por Telegram (notification_log), con marca de leído por persona.
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS notification_log_unread_idx ON notification_log(profile_id, created_at DESC) WHERE read_at IS NULL;
NOTIFY pgrst, 'reload schema';
