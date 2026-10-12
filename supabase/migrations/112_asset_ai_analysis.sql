-- Embudo "Subir y clasificar": cada video guarda su transcripción y el
-- análisis de la IA (lo que se ve/oye por escena + la clasificación), para
-- reusarlos después en análisis de creativos, guiones y reportes.
ALTER TABLE creative_assets ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE creative_assets ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
NOTIFY pgrst, 'reload schema';
