-- Repaso que cierra sin abrir el siguiente ciclo (pausas, pago por campaña,
-- último mes de un cliente). Lo marcado como "continúa" queda en espera aquí
-- y se pasa solo al siguiente ciclo cuando se abra.
ALTER TABLE paid_media_cycles ADD COLUMN IF NOT EXISTS carry_over_pending JSONB;
NOTIFY pgrst, 'reload schema';
