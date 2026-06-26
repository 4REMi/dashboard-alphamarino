-- Link projects to their brand brain
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brand_brain_id UUID REFERENCES brand_brains(id) ON DELETE SET NULL;
