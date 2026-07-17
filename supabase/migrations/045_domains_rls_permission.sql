-- Las políticas de domains eran admin-only desde 003_full_rewrite.sql y nunca
-- se actualizaron: un subadmin/empleado con view_domains=true en la app no
-- podía ver ni escribir ninguna fila por RLS. Este chequeo replica la lógica
-- de can() en lib/permissions.ts: admin siempre puede; si hay override
-- explícito en profiles.permissions se respeta (incluso si es false); si no,
-- cae al default por rol (subadmin sí, empleado no).
CREATE OR REPLACE FUNCTION can_view_domains()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    role = 'admin'
    OR COALESCE((permissions->>'view_domains')::boolean, role = 'subadmin')
  FROM profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "domains_select" ON domains;
DROP POLICY IF EXISTS "domains_insert" ON domains;
DROP POLICY IF EXISTS "domains_update" ON domains;
DROP POLICY IF EXISTS "domains_delete" ON domains;
CREATE POLICY "domains_select" ON domains FOR SELECT TO authenticated USING (can_view_domains());
CREATE POLICY "domains_insert" ON domains FOR INSERT TO authenticated WITH CHECK (can_view_domains());
CREATE POLICY "domains_update" ON domains FOR UPDATE TO authenticated USING (can_view_domains());
CREATE POLICY "domains_delete" ON domains FOR DELETE TO authenticated USING (can_view_domains());
