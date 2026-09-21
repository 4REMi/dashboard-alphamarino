-- Nuevo paso intermedio en el Clonador de estáticos: "Dirección Visual" —
-- un plan de art direction (JSON) que Claude genera ANTES de la
-- generación de imagen, para que la parte visual venga "cocinada" desde
-- antes en vez de decidirse a ciegas dentro del prompt de generación.
ALTER TABLE image_clones ADD COLUMN IF NOT EXISTS visual_direction JSONB;
