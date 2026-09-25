-- Moneda de la cuenta publicitaria (Meta regresa todos los montos en esa
-- moneda, sin convertir). Se actualiza en cada sync.
ALTER TABLE project_integrations ADD COLUMN IF NOT EXISTS currency TEXT;
