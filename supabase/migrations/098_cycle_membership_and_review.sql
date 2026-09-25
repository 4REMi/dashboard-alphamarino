-- Conceptos y assets pueden pertenecer a VARIOS ciclos. Antes cada uno
-- tenía un solo cycle_id (el de origen) y "Evergreen" lo sacaba de todos
-- los ciclos (cycle_id = null) sin llevarse sus assets. Ahora "continuar al
-- siguiente ciclo" agrega una fila aquí: no copia ni mueve nada, y el
-- historial del ciclo de origen se conserva. cycle_id en las tablas
-- originales se queda como "ciclo de origen".

CREATE TABLE IF NOT EXISTS creative_concept_cycles (
  concept_id UUID NOT NULL REFERENCES creative_concepts(id) ON DELETE CASCADE,
  cycle_id   UUID NOT NULL REFERENCES paid_media_cycles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (concept_id, cycle_id)
);
CREATE INDEX IF NOT EXISTS creative_concept_cycles_cycle_idx ON creative_concept_cycles(cycle_id);

CREATE TABLE IF NOT EXISTS creative_asset_cycles (
  asset_id   UUID NOT NULL REFERENCES creative_assets(id) ON DELETE CASCADE,
  cycle_id   UUID NOT NULL REFERENCES paid_media_cycles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset_id, cycle_id)
);
CREATE INDEX IF NOT EXISTS creative_asset_cycles_cycle_idx ON creative_asset_cycles(cycle_id);

ALTER TABLE creative_concept_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creative_concept_cycles_select" ON creative_concept_cycles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "creative_concept_cycles_insert" ON creative_concept_cycles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "creative_concept_cycles_delete" ON creative_concept_cycles FOR DELETE USING (auth.uid() IS NOT NULL);
ALTER TABLE creative_asset_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creative_asset_cycles_select" ON creative_asset_cycles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "creative_asset_cycles_insert" ON creative_asset_cycles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "creative_asset_cycles_delete" ON creative_asset_cycles FOR DELETE USING (auth.uid() IS NOT NULL);

-- Todo concepto/asset creado con un cycle_id queda registrado en ese ciclo,
-- venga de donde venga (formulario, IA, Ad Lab, historial de Meta).
CREATE OR REPLACE FUNCTION register_concept_cycle() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cycle_id IS NOT NULL THEN
    INSERT INTO creative_concept_cycles (concept_id, cycle_id, project_id)
    VALUES (NEW.id, NEW.cycle_id, NEW.project_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION register_asset_cycle() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cycle_id IS NOT NULL THEN
    INSERT INTO creative_asset_cycles (asset_id, cycle_id, project_id)
    VALUES (NEW.id, NEW.cycle_id, NEW.project_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS creative_concepts_register_cycle ON creative_concepts;
CREATE TRIGGER creative_concepts_register_cycle AFTER INSERT ON creative_concepts
  FOR EACH ROW EXECUTE FUNCTION register_concept_cycle();
DROP TRIGGER IF EXISTS creative_assets_register_cycle ON creative_assets;
CREATE TRIGGER creative_assets_register_cycle AFTER INSERT ON creative_assets
  FOR EACH ROW EXECUTE FUNCTION register_asset_cycle();

-- Relleno con lo que ya existe: cada concepto/asset en su ciclo de origen.
INSERT INTO creative_concept_cycles (concept_id, cycle_id, project_id)
SELECT id, cycle_id, project_id FROM creative_concepts WHERE cycle_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO creative_asset_cycles (asset_id, cycle_id, project_id)
SELECT id, cycle_id, project_id FROM creative_assets WHERE cycle_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Los Evergreen de hoy (cycle_id = null) y TODOS sus assets continúan en el
-- ciclo activo de su proyecto — sus assets estaban huérfanos en ciclos viejos.
INSERT INTO creative_concept_cycles (concept_id, cycle_id, project_id)
SELECT c.id, pc.id, c.project_id
FROM creative_concepts c
JOIN paid_media_cycles pc ON pc.project_id = c.project_id AND pc.is_active
WHERE c.cycle_id IS NULL AND c.status = 'Evergreen'
ON CONFLICT DO NOTHING;
INSERT INTO creative_asset_cycles (asset_id, cycle_id, project_id)
SELECT a.id, pc.id, a.project_id
FROM creative_assets a
JOIN creative_concepts c ON c.id = a.concept_id AND c.cycle_id IS NULL AND c.status = 'Evergreen'
JOIN paid_media_cycles pc ON pc.project_id = a.project_id AND pc.is_active
ON CONFLICT DO NOTHING;

-- Repaso de cierre: un ciclo cerrado (a mano sin repaso, o por el
-- auto-cierre) queda "pendiente" hasta que se haga su repaso, que es el
-- único camino para abrir el siguiente. next_cycle_id = a qué ciclo se
-- traspasó lo que continúa (para poder corregirlo después).
ALTER TABLE paid_media_cycles ADD COLUMN IF NOT EXISTS review_pending BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE paid_media_cycles ADD COLUMN IF NOT EXISTS next_cycle_id UUID REFERENCES paid_media_cycles(id) ON DELETE SET NULL;
