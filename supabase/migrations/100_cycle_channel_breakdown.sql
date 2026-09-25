-- Desglose del resumen manual del ciclo por canal (Meta, Google, TikTok…).
-- [{ channel, spend, results, roas }] — los totales real_spend/real_results/
-- cpa_real/roas_real se siguen guardando, calculados a partir de esto.
ALTER TABLE paid_media_cycles ADD COLUMN IF NOT EXISTS channel_breakdown JSONB;

NOTIFY pgrst, 'reload schema';
