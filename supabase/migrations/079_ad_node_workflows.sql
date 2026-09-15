-- ============================================================
-- 079_ad_node_workflows.sql
-- Ad Lab: "Ad Nodes" — canvas visual de workflows de IA (nodos de
-- texto/LLM/análisis/generación de imagen/video conectados entre sí).
--
-- graph se guarda como JSON con la misma forma que React Flow usa
-- nativamente ({nodes:[...], edges:[...]}) — normalizar en filas
-- separadas sería overhead puro, nadie necesita filtrar aristas en SQL,
-- ese recorrido pasa en memoria al ejecutar el grafo.
--
-- ad_node_runs es una tabla aparte (no embebida en el JSON del grafo)
-- para que "re-correr solo este nodo" no implique reescribir todo el
-- grafo, y para que el output de cada nodo sobreviva recargas de página.
-- ============================================================

CREATE TABLE ad_node_workflows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  brand_brain_id  UUID REFERENCES brand_brains(id) ON DELETE SET NULL,
  graph           JSONB NOT NULL DEFAULT '{"nodes": [], "edges": []}'::jsonb,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ad_node_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id     UUID NOT NULL REFERENCES ad_node_workflows(id) ON DELETE CASCADE,
  node_id         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'done', 'error')),
  input_snapshot  JSONB,
  output          JSONB,
  error_message   TEXT,
  provider_job_id TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, node_id)
);

CREATE INDEX idx_ad_node_runs_workflow ON ad_node_runs(workflow_id);

ALTER TABLE ad_node_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_node_runs ENABLE ROW LEVEL SECURITY;

-- Same shape as scratch_ad_ideas (074/078) — Ad Lab access is gated at
-- the access_ad_lab permission level, not per-row.
CREATE POLICY "auth_read_ad_node_workflows" ON ad_node_workflows
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_ad_node_workflows" ON ad_node_workflows
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "auth_update_ad_node_workflows" ON ad_node_workflows
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_ad_node_workflows" ON ad_node_workflows
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth_all_ad_node_runs" ON ad_node_runs
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
