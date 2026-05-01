-- Image Clones: stores cloned ad creatives generated via Claude Vision + FAL.ai Flux Kontext

CREATE TABLE IF NOT EXISTS image_clones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_ad_id         UUID NOT NULL REFERENCES saved_ads(id) ON DELETE CASCADE,
  brand_brain_id      UUID REFERENCES brand_brains(id) ON DELETE SET NULL,
  share_token         TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'extracting', 'ready', 'generating', 'done', 'error')),
  -- Text extraction + adaptation (Claude Vision, one-shot)
  original_lines      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{element, original}]
  adapted_lines       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{element, original, adapted}]
  -- Generation config (set by user before triggering FAL)
  reference_image_urls TEXT[] NOT NULL DEFAULT '{}',        -- product/brand images uploaded by user
  brand_color         TEXT,                                 -- hex e.g. "#1a2b3c"
  aspect_ratio        TEXT NOT NULL DEFAULT '1:1'
                        CHECK (aspect_ratio IN ('1:1', '9:16', '16:9', '4:5')),
  num_images          INT NOT NULL DEFAULT 2
                        CHECK (num_images BETWEEN 1 AND 4),
  -- FAL.ai async job
  fal_request_id      TEXT,
  generated_image_urls TEXT[] NOT NULL DEFAULT '{}',
  -- Error state
  error_message       TEXT,
  -- Ownership
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE image_clones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_image_clones" ON image_clones
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth_insert_image_clones" ON image_clones
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "auth_update_image_clones" ON image_clones
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth_delete_image_clones" ON image_clones
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_image_clones_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_image_clones_updated_at
  BEFORE UPDATE ON image_clones
  FOR EACH ROW EXECUTE FUNCTION update_image_clones_updated_at();
