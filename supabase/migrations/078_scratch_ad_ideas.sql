-- ============================================================
-- 078_scratch_ad_ideas.sql
-- Ad Lab: crear estáticos DESDE CERO (sin anuncio de referencia), en dos
-- pasos deliberados para que nunca sea "hit and miss":
--   1. Ideación barata (solo texto) — la IA propone 4-5 ideas de creativo,
--      guardadas aquí ANTES de gastar nada en generar imagen.
--   2. El usuario edita/descarta/aprueba. Solo lo aprobado pasa a
--      image_clones (el motor de generación ya existente) para generarse.
--
-- image_clones se reusa desde el paso 2 en adelante sin tocar su lógica de
-- polling/revisión/aceptar-descartar — solo se le quita el requisito de
-- tener un saved_ad_id (aquí no hay ningún anuncio de referencia) y se le
-- agrega de dónde viene.
-- ============================================================

CREATE TABLE scratch_ad_ideas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_brain_id      UUID NOT NULL REFERENCES brand_brains(id) ON DELETE CASCADE,
  concept_id          UUID REFERENCES creative_concepts(id) ON DELETE SET NULL,
  -- Dirección libre cuando no se elige un concepto — una idea necesita
  -- concept_id O brief, nunca ninguno de los dos (se valida en la acción).
  brief               TEXT,
  batch_id            UUID NOT NULL,
  round               INT NOT NULL DEFAULT 1,
  headline            TEXT NOT NULL,
  copy_angle          TEXT NOT NULL,
  visual_description  TEXT NOT NULL,
  brand_elements_used TEXT[] NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'proposed'
                        CHECK (status IN ('proposed', 'edited', 'discarded', 'approved')),
  edited_headline     TEXT,
  edited_copy_angle   TEXT,
  edited_visual_description TEXT,
  image_clone_id      UUID REFERENCES image_clones(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scratch_ad_ideas_brand_brain ON scratch_ad_ideas(brand_brain_id);
CREATE INDEX idx_scratch_ad_ideas_concept ON scratch_ad_ideas(concept_id);

ALTER TABLE scratch_ad_ideas ENABLE ROW LEVEL SECURITY;

-- Same RLS shape as image_clones (025_image_clones.sql) — Ad Lab access is
-- gated at the app/permission level (access_ad_lab), not per-row here.
CREATE POLICY "auth_read_scratch_ad_ideas" ON scratch_ad_ideas
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_scratch_ad_ideas" ON scratch_ad_ideas
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "auth_update_scratch_ad_ideas" ON scratch_ad_ideas
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_scratch_ad_ideas" ON scratch_ad_ideas
  FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE image_clones
  ALTER COLUMN saved_ad_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'reference' CHECK (source IN ('reference', 'scratch')),
  ADD COLUMN IF NOT EXISTS scratch_idea_id UUID REFERENCES scratch_ad_ideas(id) ON DELETE SET NULL;
