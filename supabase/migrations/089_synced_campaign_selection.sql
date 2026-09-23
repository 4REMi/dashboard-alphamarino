-- Picker "elegir qué campañas sincronizar" antes de traer datos a nivel
-- ad — pensado para cuentas con muchos creativos corriendo (80+), donde
-- sincronizar/mostrar TODO de golpe deja de tener sentido. La selección
-- se recuerda por proyecto — no se vuelve a preguntar en cada sync.
ALTER TABLE paid_media_context ADD COLUMN IF NOT EXISTS synced_campaign_ids TEXT[];
