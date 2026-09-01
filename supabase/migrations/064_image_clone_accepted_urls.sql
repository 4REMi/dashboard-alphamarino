-- ============================================================
-- 064_image_clone_accepted_urls.sql
-- Supports multi-round image-clone review: "Guardar y generar otra
-- tanda" / "Descartar y regresar" at step 3 of the wizard. Variants
-- kept from earlier rounds accumulate here (locked in immediately),
-- separate from generated_image_urls which stays scoped to whatever
-- round is currently being reviewed/finalized.
-- ============================================================

ALTER TABLE image_clones ADD COLUMN IF NOT EXISTS accepted_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
