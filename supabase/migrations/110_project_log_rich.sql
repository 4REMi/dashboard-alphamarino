-- Bitácora enriquecida: notas fijadas ("contexto fijo") e imágenes.
ALTER TABLE project_log_entries ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
-- [{ path, name, width, height }] dentro del bucket privado project-log.
ALTER TABLE project_log_entries ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE project_log_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE project_log_entries ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Bucket PRIVADO: la bitácora es interna; las imágenes se ven con enlaces
-- firmados temporales, solo con sesión.
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-log', 'project-log', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "project_log_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-log');
CREATE POLICY "project_log_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-log');
CREATE POLICY "project_log_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-log');

NOTIFY pgrst, 'reload schema';
