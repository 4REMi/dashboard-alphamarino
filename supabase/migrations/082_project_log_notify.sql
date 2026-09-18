-- Notificar por Telegram al agregar una nota de bitácora — opt-in,
-- nunca automático (la mayoría de las notas son solo constancia interna,
-- no le importan a todo el equipo). Mismo patrón que is_pinged/
-- ping_recipient_ids en tasks: notify_team = avisar a todo el equipo del
-- proyecto; notify_recipient_ids = avisar solo a gente específica (si
-- tiene valores, gana sobre notify_team). Ninguno de los dos = silenciosa,
-- como hoy.
ALTER TABLE project_log_entries ADD COLUMN IF NOT EXISTS notify_team BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE project_log_entries ADD COLUMN IF NOT EXISTS notify_recipient_ids UUID[];
