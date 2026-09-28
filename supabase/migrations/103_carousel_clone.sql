-- Clonar carrusel completo: cada slide es un image_clone hijo agrupado por
-- batch_id (columna ya existente), con su orden y su imagen de origen.
ALTER TABLE image_clones ADD COLUMN IF NOT EXISTS slide_index INT;
ALTER TABLE image_clones ADD COLUMN IF NOT EXISTS source_image_url TEXT;

-- Un asset puede ser un carrusel: las imágenes en orden (asset_url = la primera).
ALTER TABLE creative_assets ADD COLUMN IF NOT EXISTS carousel_urls TEXT[];

NOTIFY pgrst, 'reload schema';
