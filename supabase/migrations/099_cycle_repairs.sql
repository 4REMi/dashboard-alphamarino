-- Reparar ciclos desde la interfaz: corregir fechas mal capturadas, crear
-- ciclos faltantes, fusionar o eliminar ciclos sobrantes. Todo en una sola
-- transacción (apply_cycle_repair), con foto del estado anterior para
-- poder deshacer la última reparación (undo_cycle_repair) y registro en la
-- Bitácora del proyecto.

CREATE TABLE IF NOT EXISTS cycle_repairs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason      TEXT NOT NULL,
  plan        JSONB NOT NULL,
  snapshot    JSONB NOT NULL,   -- estado anterior (para deshacer)
  after_state JSONB,            -- ciclos justo después (para saber si hubo cambios encima)
  undone_at   TIMESTAMPTZ,
  undone_by   UUID REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS cycle_repairs_project_idx ON cycle_repairs(project_id, created_at DESC);
ALTER TABLE cycle_repairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cycle_repairs_select" ON cycle_repairs FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION assert_can_repair_cycles(p_project UUID) RETURNS UUID AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role IN ('admin', 'subadmin'))
     AND NOT EXISTS (SELECT 1 FROM project_members WHERE project_id = p_project AND profile_id = v_uid) THEN
    RAISE EXCEPTION 'Solo miembros del proyecto pueden reparar sus ciclos';
  END IF;
  RETURN v_uid;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cycles_state(p_project UUID) RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'start_date', start_date, 'end_date', end_date, 'is_active', is_active) ORDER BY id), '[]'::jsonb)
  FROM paid_media_cycles WHERE project_id = p_project
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION assert_cycles_valid(p_project UUID) RETURNS VOID AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM paid_media_cycles WHERE project_id = p_project AND start_date > end_date) THEN
    RAISE EXCEPTION 'Hay un ciclo que termina antes de empezar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM paid_media_cycles a JOIN paid_media_cycles b
      ON a.project_id = b.project_id AND a.id < b.id
    WHERE a.project_id = p_project AND a.start_date <= b.end_date AND b.start_date <= a.end_date
  ) THEN
    RAISE EXCEPTION 'Los ciclos se traslapan: cada día solo puede pertenecer a un ciclo';
  END IF;
  IF (SELECT COUNT(*) FROM paid_media_cycles WHERE project_id = p_project AND is_active) > 1 THEN
    RAISE EXCEPTION 'Solo puede haber un ciclo activo';
  END IF;
END $$ LANGUAGE plpgsql;

-- Evita choques con UNIQUE(project_id, cycle_month) mientras se mueven
-- fechas: primero valores temporales, al final cycle_month = start_date.
CREATE OR REPLACE FUNCTION park_cycle_months(p_project UUID) RETURNS VOID AS $$
  UPDATE paid_media_cycles c SET cycle_month = DATE '1000-01-01' + t.n
  FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id)::INT AS n FROM paid_media_cycles WHERE project_id = p_project) t
  WHERE c.id = t.id
$$ LANGUAGE sql;

-- Cada día de métricas de Meta pertenece al ciclo que lo cubre.
CREATE OR REPLACE FUNCTION reassign_daily_stats(p_project UUID) RETURNS VOID AS $$
BEGIN
  UPDATE meta_ad_daily_stats s SET cycle_id = c.id
  FROM paid_media_cycles c
  WHERE s.project_id = p_project AND c.project_id = p_project
    AND s.date BETWEEN c.start_date AND c.end_date
    AND s.cycle_id IS DISTINCT FROM c.id;
  UPDATE meta_ad_daily_stats s SET cycle_id = NULL
  WHERE s.project_id = p_project AND s.cycle_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM paid_media_cycles c WHERE c.project_id = p_project AND s.date BETWEEN c.start_date AND c.end_date);
END $$ LANGUAGE plpgsql;

-- p_plan:
--   cycles: [{ id (null = nuevo), start_date, end_date, is_active, summary_from (id cuyo resumen manual se conserva) }]
--   merges: [{ from_id, into_id }]   (into_id = ciclo existente que se queda)
--   deletes: [id]                    (solo ciclos sin conceptos ni assets)
--   summary_text: descripción legible de los cambios (para la Bitácora)
CREATE OR REPLACE FUNCTION apply_cycle_repair(p_project UUID, p_plan JSONB, p_reason TEXT) RETURNS UUID AS $$
DECLARE
  v_uid UUID;
  v_repair UUID;
  v_snapshot JSONB;
  m RECORD;
  c RECORD;
  d UUID;
  src JSONB;
BEGIN
  v_uid := assert_can_repair_cycles(p_project);
  IF COALESCE(TRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'El motivo es obligatorio'; END IF;

  PERFORM 1 FROM paid_media_cycles WHERE project_id = p_project FOR UPDATE;

  v_snapshot := jsonb_build_object(
    'cycles',         (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]') FROM paid_media_cycles x WHERE project_id = p_project),
    'concept_cycles', (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]') FROM creative_concept_cycles x WHERE project_id = p_project),
    'asset_cycles',   (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]') FROM creative_asset_cycles x WHERE project_id = p_project),
    'concepts',       (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'cycle_id', cycle_id)), '[]') FROM creative_concepts WHERE project_id = p_project),
    'assets',         (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'cycle_id', cycle_id)), '[]') FROM creative_assets WHERE project_id = p_project),
    'stats',          (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'cycle_id', cycle_id)), '[]') FROM meta_ad_daily_stats WHERE project_id = p_project),
    'reach',          (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]') FROM meta_cycle_reach x WHERE project_id = p_project)
  );

  INSERT INTO cycle_repairs (project_id, created_by, reason, plan, snapshot)
  VALUES (p_project, v_uid, TRIM(p_reason), p_plan, v_snapshot) RETURNING id INTO v_repair;

  -- Fusiones: todo lo del ciclo que desaparece pasa al que se queda.
  FOR m IN SELECT * FROM jsonb_to_recordset(COALESCE(p_plan->'merges', '[]')) AS x(from_id UUID, into_id UUID) LOOP
    IF NOT EXISTS (SELECT 1 FROM paid_media_cycles WHERE id = m.into_id AND project_id = p_project) THEN
      RAISE EXCEPTION 'Ciclo destino de fusión inválido';
    END IF;
    INSERT INTO creative_concept_cycles (concept_id, cycle_id, project_id)
      SELECT concept_id, m.into_id, project_id FROM creative_concept_cycles WHERE cycle_id = m.from_id ON CONFLICT DO NOTHING;
    INSERT INTO creative_asset_cycles (asset_id, cycle_id, project_id)
      SELECT asset_id, m.into_id, project_id FROM creative_asset_cycles WHERE cycle_id = m.from_id ON CONFLICT DO NOTHING;
    UPDATE creative_concepts SET cycle_id = m.into_id WHERE cycle_id = m.from_id;
    UPDATE creative_assets SET cycle_id = m.into_id WHERE cycle_id = m.from_id;
    UPDATE paid_media_cycles SET next_cycle_id = m.into_id WHERE next_cycle_id = m.from_id;
    UPDATE relationship_map_notes SET cycle_id = m.into_id::TEXT WHERE project_id = p_project AND cycle_id = m.from_id::TEXT;
    DELETE FROM paid_media_cycles WHERE id = m.from_id AND project_id = p_project;
  END LOOP;

  FOREACH d IN ARRAY ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_plan->'deletes', '[]'))::UUID) LOOP
    IF EXISTS (SELECT 1 FROM creative_concept_cycles WHERE cycle_id = d)
       OR EXISTS (SELECT 1 FROM creative_asset_cycles WHERE cycle_id = d)
       OR EXISTS (SELECT 1 FROM creative_concepts WHERE cycle_id = d)
       OR EXISTS (SELECT 1 FROM creative_assets WHERE cycle_id = d) THEN
      RAISE EXCEPTION 'Un ciclo con conceptos o assets no se puede eliminar: fusiónalo en otro';
    END IF;
    DELETE FROM paid_media_cycles WHERE id = d AND project_id = p_project;
  END LOOP;

  PERFORM park_cycle_months(p_project);

  FOR c IN SELECT * FROM jsonb_to_recordset(COALESCE(p_plan->'cycles', '[]'))
    AS x(id UUID, start_date DATE, end_date DATE, is_active BOOLEAN, summary_from UUID) LOOP
    IF c.id IS NULL THEN
      INSERT INTO paid_media_cycles (project_id, cycle_month, start_date, end_date, is_active, review_pending)
      VALUES (p_project, DATE '0999-01-01' - (SELECT COUNT(*)::INT FROM paid_media_cycles WHERE project_id = p_project), c.start_date, c.end_date, COALESCE(c.is_active, FALSE), FALSE);
    ELSE
      UPDATE paid_media_cycles SET start_date = c.start_date, end_date = c.end_date, is_active = COALESCE(c.is_active, is_active)
      WHERE id = c.id AND project_id = p_project;
      IF c.summary_from IS NOT NULL AND c.summary_from <> c.id THEN
        SELECT e INTO src FROM jsonb_array_elements(v_snapshot->'cycles') e WHERE e->>'id' = c.summary_from::TEXT;
        IF src IS NOT NULL THEN
          UPDATE paid_media_cycles SET
            real_spend = (src->>'real_spend')::NUMERIC, roas_real = (src->>'roas_real')::NUMERIC,
            cpa_real = (src->>'cpa_real')::NUMERIC, cpl_real = (src->>'cpl_real')::NUMERIC,
            real_results = (src->>'real_results')::NUMERIC
          WHERE id = c.id;
        END IF;
      END IF;
    END IF;
  END LOOP;

  UPDATE paid_media_cycles SET cycle_month = start_date WHERE project_id = p_project;
  PERFORM assert_cycles_valid(p_project);
  PERFORM reassign_daily_stats(p_project);

  -- El alcance deduplicado de ciclos cuyas fechas cambiaron ya no aplica;
  -- se recalcula en la siguiente sincronización.
  DELETE FROM meta_cycle_reach r WHERE r.project_id = p_project AND NOT EXISTS (
    SELECT 1 FROM paid_media_cycles pc, jsonb_array_elements(v_snapshot->'cycles') o
    WHERE pc.id::TEXT = r.cycle_id AND o->>'id' = pc.id::TEXT
      AND (o->>'start_date')::DATE = pc.start_date AND (o->>'end_date')::DATE = pc.end_date
  );

  UPDATE cycle_repairs SET after_state = cycles_state(p_project) WHERE id = v_repair;

  INSERT INTO project_log_entries (project_id, author_id, body, category)
  VALUES (p_project, v_uid, 'Reparación de ciclos — ' || TRIM(p_reason) || COALESCE(E'\n' || (p_plan->>'summary_text'), ''), 'Interno');

  RETURN v_repair;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Deshacer: solo la última reparación del proyecto, y solo si los ciclos
-- siguen exactamente como los dejó (nadie abrió/cerró/editó ciclos
-- después). Restaura ciclos, pertenencias, ciclo de origen de conceptos y
-- assets, a qué ciclo apunta cada día de métricas, y el alcance guardado.
CREATE OR REPLACE FUNCTION undo_cycle_repair(p_repair UUID) RETURNS VOID AS $$
DECLARE
  r cycle_repairs%ROWTYPE;
  v_uid UUID;
  o JSONB;
BEGIN
  SELECT * INTO r FROM cycle_repairs WHERE id = p_repair FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la reparación'; END IF;
  v_uid := assert_can_repair_cycles(r.project_id);
  IF r.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Esta reparación ya se deshizo'; END IF;
  IF EXISTS (SELECT 1 FROM cycle_repairs WHERE project_id = r.project_id AND created_at > r.created_at) THEN
    RAISE EXCEPTION 'Solo se puede deshacer la última reparación';
  END IF;
  IF cycles_state(r.project_id) IS DISTINCT FROM r.after_state THEN
    RAISE EXCEPTION 'No se puede deshacer: los ciclos cambiaron después de la reparación';
  END IF;

  PERFORM 1 FROM paid_media_cycles WHERE project_id = r.project_id FOR UPDATE;

  -- Ciclos creados por la reparación: fuera.
  DELETE FROM paid_media_cycles WHERE project_id = r.project_id
    AND id::TEXT NOT IN (SELECT e->>'id' FROM jsonb_array_elements(r.snapshot->'cycles') e);

  PERFORM park_cycle_months(r.project_id);
  UPDATE paid_media_cycles SET next_cycle_id = NULL WHERE project_id = r.project_id;

  FOR o IN SELECT e FROM jsonb_array_elements(r.snapshot->'cycles') e LOOP
    IF EXISTS (SELECT 1 FROM paid_media_cycles WHERE id = (o->>'id')::UUID) THEN
      UPDATE paid_media_cycles p SET
        start_date = (o->>'start_date')::DATE, end_date = (o->>'end_date')::DATE,
        is_active = (o->>'is_active')::BOOLEAN, review_pending = COALESCE((o->>'review_pending')::BOOLEAN, FALSE),
        campaign_status = o->>'campaign_status',
        real_spend = (o->>'real_spend')::NUMERIC, roas_real = (o->>'roas_real')::NUMERIC,
        cpa_real = (o->>'cpa_real')::NUMERIC, cpl_real = (o->>'cpl_real')::NUMERIC,
        real_results = (o->>'real_results')::NUMERIC
      WHERE p.id = (o->>'id')::UUID;
    ELSE
      INSERT INTO paid_media_cycles SELECT * FROM jsonb_populate_record(NULL::paid_media_cycles,
        (o - 'next_cycle_id') || jsonb_build_object('cycle_month', DATE '0998-01-01' - (SELECT COUNT(*)::INT FROM paid_media_cycles WHERE project_id = r.project_id)));
    END IF;
  END LOOP;

  UPDATE paid_media_cycles p SET cycle_month = start_date,
    next_cycle_id = (SELECT (e->>'next_cycle_id')::UUID FROM jsonb_array_elements(r.snapshot->'cycles') e WHERE e->>'id' = p.id::TEXT)
  WHERE project_id = r.project_id;

  -- Pertenencias: se restaura lo de la foto; lo agregado después para
  -- conceptos/assets que NO existían entonces se respeta.
  DELETE FROM creative_concept_cycles x WHERE x.project_id = r.project_id
    AND x.concept_id::TEXT IN (SELECT e->>'id' FROM jsonb_array_elements(r.snapshot->'concepts') e)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.snapshot->'concept_cycles') e
                    WHERE e->>'concept_id' = x.concept_id::TEXT AND e->>'cycle_id' = x.cycle_id::TEXT);
  INSERT INTO creative_concept_cycles (concept_id, cycle_id, project_id, created_at)
    SELECT (e->>'concept_id')::UUID, (e->>'cycle_id')::UUID, (e->>'project_id')::UUID, (e->>'created_at')::TIMESTAMPTZ
    FROM jsonb_array_elements(r.snapshot->'concept_cycles') e
    WHERE EXISTS (SELECT 1 FROM creative_concepts WHERE id = (e->>'concept_id')::UUID)
    ON CONFLICT DO NOTHING;

  DELETE FROM creative_asset_cycles x WHERE x.project_id = r.project_id
    AND x.asset_id::TEXT IN (SELECT e->>'id' FROM jsonb_array_elements(r.snapshot->'assets') e)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.snapshot->'asset_cycles') e
                    WHERE e->>'asset_id' = x.asset_id::TEXT AND e->>'cycle_id' = x.cycle_id::TEXT);
  INSERT INTO creative_asset_cycles (asset_id, cycle_id, project_id, created_at)
    SELECT (e->>'asset_id')::UUID, (e->>'cycle_id')::UUID, (e->>'project_id')::UUID, (e->>'created_at')::TIMESTAMPTZ
    FROM jsonb_array_elements(r.snapshot->'asset_cycles') e
    WHERE EXISTS (SELECT 1 FROM creative_assets WHERE id = (e->>'asset_id')::UUID)
    ON CONFLICT DO NOTHING;

  UPDATE creative_concepts x SET cycle_id = (e->>'cycle_id')::UUID
    FROM jsonb_array_elements(r.snapshot->'concepts') e WHERE x.id::TEXT = e->>'id';
  UPDATE creative_assets x SET cycle_id = (e->>'cycle_id')::UUID
    FROM jsonb_array_elements(r.snapshot->'assets') e WHERE x.id::TEXT = e->>'id';

  -- Métricas diarias: a su ciclo original; las sincronizadas después, por fecha.
  PERFORM reassign_daily_stats(r.project_id);
  UPDATE meta_ad_daily_stats s SET cycle_id = (e->>'cycle_id')::UUID
    FROM jsonb_array_elements(r.snapshot->'stats') e WHERE s.id::TEXT = e->>'id';

  DELETE FROM meta_cycle_reach WHERE project_id = r.project_id;
  INSERT INTO meta_cycle_reach SELECT * FROM jsonb_populate_recordset(NULL::meta_cycle_reach, r.snapshot->'reach');

  UPDATE cycle_repairs SET undone_at = NOW(), undone_by = v_uid WHERE id = p_repair;
  INSERT INTO project_log_entries (project_id, author_id, body, category)
  VALUES (r.project_id, v_uid, 'Se deshizo la reparación de ciclos — ' || r.reason, 'Interno');
END $$ LANGUAGE plpgsql SECURITY DEFINER;
