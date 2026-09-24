-- Guarda dónde arrastró el usuario cada nodo del mapa de relaciones
-- (Creative Tracker → Mapa) — antes se recalculaba desde cero cada vez,
-- y con varios nodos compartiendo el mismo punto de partida (bug de
-- layout, corregido en el mismo commit) era tedioso volver a acomodarlos
-- en cada visita.
CREATE TABLE IF NOT EXISTS relationship_map_positions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id   TEXT NOT NULL, -- puede ser un cycle_id real o el sentinel "none"
  node_id    TEXT NOT NULL, -- "concept-<id>" | "asset-<id>" | "campaign-<id>"
  x          DOUBLE PRECISION NOT NULL,
  y          DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, cycle_id, node_id)
);

ALTER TABLE relationship_map_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "relationship_map_positions_select" ON relationship_map_positions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "relationship_map_positions_upsert" ON relationship_map_positions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "relationship_map_positions_update" ON relationship_map_positions FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "relationship_map_positions_delete" ON relationship_map_positions FOR DELETE USING (auth.uid() IS NOT NULL);
