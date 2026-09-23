-- La vista general de Boards (/ad-lab/boards) cargaba lento: getBoards()
-- traía TODAS las filas de board_ads de TODOS los boards solo para
-- contar en JS, y otra vez completas (con join a saved_ads) solo para
-- quedarse con 4 por board como preview — PostgREST no soporta "limit N
-- por grupo" en un solo select. Se resuelve en Postgres: un contador
-- desnormalizado mantenido por trigger, y una función con window function
-- para traer solo las miniaturas que realmente se muestran.

-- ── Contador desnormalizado ──────────────────────────────────
ALTER TABLE ad_boards ADD COLUMN IF NOT EXISTS ad_count INT NOT NULL DEFAULT 0;

UPDATE ad_boards b SET ad_count = (
  SELECT COUNT(*) FROM board_ads WHERE board_id = b.id
);

CREATE OR REPLACE FUNCTION bump_board_ad_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ad_boards SET ad_count = ad_count + 1 WHERE id = NEW.board_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ad_boards SET ad_count = GREATEST(ad_count - 1, 0) WHERE id = OLD.board_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_board_ads_bump_count ON board_ads;
CREATE TRIGGER trg_board_ads_bump_count
  AFTER INSERT OR DELETE ON board_ads
  FOR EACH ROW EXECUTE FUNCTION bump_board_ad_count();

-- ── Miniaturas top-4 por board (para el colage de cada tile) ─
-- ROW_NUMBER() acotado a 4 por board_id — sustituye traer el join
-- completo board_ads->saved_ads de todos los boards y cortar en JS.
CREATE OR REPLACE FUNCTION board_preview_ads(p_board_ids UUID[])
RETURNS TABLE (board_id UUID, ad_id UUID, cached_image_url TEXT, image_url TEXT)
LANGUAGE sql STABLE AS $$
  SELECT board_id, ad_id, cached_image_url, image_url
  FROM (
    SELECT
      ba.board_id,
      sa.id AS ad_id,
      sa.cached_image_url,
      sa.image_url,
      ROW_NUMBER() OVER (PARTITION BY ba.board_id ORDER BY ba.added_at DESC) AS rn
    FROM board_ads ba
    JOIN saved_ads sa ON sa.id = ba.saved_ad_id
    WHERE ba.board_id = ANY(p_board_ids)
  ) ranked
  WHERE rn <= 4;
$$;
