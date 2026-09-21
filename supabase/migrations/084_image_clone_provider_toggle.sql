-- Clonador de estáticos gana un toggle de proveedor de generación —
-- Replicate (google/nano-banana-pro, el de siempre) o APIMart
-- (gpt-image-2.5-sunburst, nuevo). Se guarda por clon para que
-- pollImageGeneration sepa contra cuál API está consultando ese registro
-- específico (los dos proveedores tienen formas de poll distintas).
ALTER TABLE image_clones ADD COLUMN IF NOT EXISTS generation_provider TEXT NOT NULL DEFAULT 'replicate';
