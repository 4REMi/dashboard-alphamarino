-- Actividad de IA: registro de lo que hacen las IAs (Claude vía MCP, y en el
-- futuro el agente autónomo) fuera de la bitácora humana. Solo admin la ve.
CREATE TABLE IF NOT EXISTS ai_activity (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  actor        TEXT NOT NULL DEFAULT 'claude_mcp',  -- claude_mcp | agente
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  platform     TEXT,                                 -- meta, …
  summary      TEXT NOT NULL,
  reason       TEXT,
  detail       JSONB
);
CREATE INDEX IF NOT EXISTS ai_activity_created_idx ON ai_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_activity_project_idx ON ai_activity (project_id, created_at DESC);

ALTER TABLE ai_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_activity_admin_read ON ai_activity;
CREATE POLICY ai_activity_admin_read ON ai_activity FOR SELECT USING (is_admin());

-- Mueve las notas viejas "Meta (vía Claude)" de la bitácora a la actividad.
INSERT INTO ai_activity (created_at, project_id, actor, requested_by, platform, summary)
SELECT created_at, project_id, 'claude_mcp', author_id, 'meta',
       regexp_replace(body, '^\*\*Meta \(vía Claude\):\*\*\s*', '')
FROM project_log_entries
WHERE body LIKE '**Meta (vía Claude):**%';
DELETE FROM project_log_entries WHERE body LIKE '**Meta (vía Claude):**%';

NOTIFY pgrst, 'reload schema';
