-- "Conversaciones iniciadas" como métrica propia del grid, sin importar el
-- objetivo de la campaña (onsite_conversion.messaging_conversation_started_7d).
ALTER TABLE meta_ad_daily_stats ADD COLUMN IF NOT EXISTS messaging_conversations INTEGER;
ALTER TABLE meta_lifetime_stats ADD COLUMN IF NOT EXISTS messaging_conversations INTEGER;
