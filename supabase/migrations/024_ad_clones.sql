-- Ad Clones: stores cloned ad scripts generated via AssemblyAI + Claude

CREATE TABLE IF NOT EXISTS ad_clones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_ad_id     UUID NOT NULL REFERENCES saved_ads(id) ON DELETE CASCADE,
  brand_brain_id  UUID REFERENCES brand_brains(id) ON DELETE SET NULL,
  share_token     TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'transcribing', 'adapting', 'ready', 'error')),
  assemblyai_transcript_id TEXT,
  original_lines  JSONB NOT NULL DEFAULT '[]'::jsonb,
  adapted_lines   JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message   TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE ad_clones ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write their own clones
CREATE POLICY "auth_read_clones" ON ad_clones
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth_insert_clones" ON ad_clones
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "auth_update_clones" ON ad_clones
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth_delete_clones" ON ad_clones
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_ad_clones_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ad_clones_updated_at
  BEFORE UPDATE ON ad_clones
  FOR EACH ROW EXECUTE FUNCTION update_ad_clones_updated_at();
