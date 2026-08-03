-- El duplicado de cernylanois.com venía de los datos de origen: dos filas
-- para el mismo dominio (una vieja en HostGator, vencida en 2025, y una
-- vigente en Shopify, vence 2026). Se borra la vieja y se deja la vigente.
DELETE FROM domains
WHERE domain = 'cernylanois.com'
  AND registrar = 'HostGator'
  AND hosted_at = 'HostGator'
  AND renewal_date = '2025-11-22';

-- Evita que vuelva a pasar: un dominio no puede repetirse (case-insensitive,
-- ya que los nombres de dominio no distinguen mayúsculas/minúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS domains_domain_unique_idx ON domains (lower(domain));
