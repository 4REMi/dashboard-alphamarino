-- Sticky notes libres sobre el mapa de relaciones (Creative Tracker → Mapa)
-- — mismo patrón visual/de uso que los Sticky Note de Ad Nodes, pero acá
-- son anotaciones sueltas del usuario (no parte del grafo generado), así
-- que necesitan su propia tabla con CRUD completo (crear/editar
-- texto/mover/borrar), a diferencia de relationship_map_positions que
-- solo guarda la posición de nodos YA generados desde los datos.
CREATE TABLE IF NOT EXISTS relationship_map_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id   TEXT NOT NULL, -- puede ser un cycle_id real o el sentinel "none"
  x          DOUBLE PRECISION NOT NULL,
  y          DOUBLE PRECISION NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE relationship_map_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "relationship_map_notes_select" ON relationship_map_notes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "relationship_map_notes_insert" ON relationship_map_notes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "relationship_map_notes_update" ON relationship_map_notes FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "relationship_map_notes_delete" ON relationship_map_notes FOR DELETE USING (auth.uid() IS NOT NULL);
