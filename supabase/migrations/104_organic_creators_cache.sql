-- Discovery orgánico: creadores guardados (separados de tracked_brands,
-- que son marcas competidoras) y caché de resultados por perfil para no
-- volver a pagar Apify cada vez que se abre el mismo feed.
CREATE TABLE IF NOT EXISTS saved_creators (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_handle TEXT NOT NULL UNIQUE,
  display_name     TEXT,
  avatar_url       TEXT,
  tag              TEXT,
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS organic_search_cache (
  handle     TEXT NOT NULL,
  results_limit INT NOT NULL,
  since_days INT NOT NULL DEFAULT 0, -- 0 = sin límite de fecha
  results    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (handle, results_limit, since_days)
);

ALTER TABLE saved_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_creators_all" ON saved_creators FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "organic_search_cache_all" ON organic_search_cache FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
