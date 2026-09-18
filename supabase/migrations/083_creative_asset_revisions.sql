-- Antes, subir una versión revisada de un asset era manual y de dos pasos:
-- crear el asset nuevo como fila aparte, y luego ocultarlo del cliente a
-- mano en el viejo — sin ningún vínculo real entre ambos. Mismo patrón que
-- asset_copies.parent_copy_id (065_asset_copy_bank.sql): la fila nueva
-- apunta hacia atrás a la que reemplaza, en vez de mutar la original.
ALTER TABLE creative_assets ADD COLUMN IF NOT EXISTS revises_asset_id UUID REFERENCES creative_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_creative_assets_revises ON creative_assets(revises_asset_id);
