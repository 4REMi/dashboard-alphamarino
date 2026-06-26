-- Add file storage columns to creative_assets
ALTER TABLE creative_assets
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_path TEXT,
  ADD COLUMN IF NOT EXISTS file_type TEXT;

-- Create storage bucket for creative assets (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('creative-assets', 'creative-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload creative assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'creative-assets');

-- Allow public read
CREATE POLICY "Public read creative assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'creative-assets');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete creative assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'creative-assets');
