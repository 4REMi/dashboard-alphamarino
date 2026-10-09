-- Radar Paid Media: estrategia por ciclo (la definen personas) + registro
-- de lo que se aplicó o descartó de cada recomendación.

-- Una estrategia por proyecto y ciclo. Si el ciclo activo no tiene una,
-- el Radar del proyecto queda bloqueado hasta definirla ("Por revisar").
CREATE TABLE IF NOT EXISTS radar_strategies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id        UUID NOT NULL REFERENCES paid_media_cycles(id) ON DELETE CASCADE,
  budget          NUMERIC NOT NULL,                 -- presupuesto del ciclo, en la moneda de la cuenta
  budget_guard    TEXT NOT NULL DEFAULT 'warn' CHECK (budget_guard IN ('warn', 'auto_pause')),
  -- [{ key, name, brand_line_id, channel, conversion, budget, target_cpr }]
  lines           JSONB NOT NULL DEFAULT '[]'::jsonb,
  testing_concept_ids UUID[] NOT NULL DEFAULT '{}',
  bet             TEXT NOT NULL,                    -- la apuesta del ciclo, escrita por una persona
  confirmed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, cycle_id)
);

-- Cada recomendación aplicada o descartada (con motivo). rec_key identifica
-- la recomendación dentro del ciclo (regla + objeto) para no repetirla.
CREATE TABLE IF NOT EXISTS radar_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id    UUID REFERENCES paid_media_cycles(id) ON DELETE CASCADE,
  rec_key     TEXT NOT NULL,
  rule        TEXT NOT NULL,
  outcome     TEXT NOT NULL CHECK (outcome IN ('applied', 'dismissed', 'auto')),
  reason      TEXT,
  detail      TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_radar_events_cycle ON radar_events(project_id, cycle_id);

ALTER TABLE radar_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radar_strategies_read" ON radar_strategies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "radar_events_read" ON radar_events FOR SELECT USING (auth.uid() IS NOT NULL);
-- Escrituras: solo por el servidor (cliente admin) tras validar permisos.

NOTIFY pgrst, 'reload schema';
