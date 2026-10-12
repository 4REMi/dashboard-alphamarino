-- Proyectos internos de la agencia (marca propia, procesos): no llevan
-- alcance de cliente, así que no muestran barra de entregables ni alerta de
-- "Sin alcance definido".
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;
NOTIFY pgrst, 'reload schema';
