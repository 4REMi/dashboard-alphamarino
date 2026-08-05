-- Paid media cycles hoy solo tienen cycle_month (siempre día 1). En realidad no
-- todos los clientes facturan/reportan por mes calendario — algunos arrancan el
-- 27, el 14, etc. según cuándo se dieron de alta. Se agregan start_date/end_date
-- reales para que la ventana de fechas del ciclo (y la consulta a Meta Ads
-- Insights) refleje el ciclo real del cliente, no el mes calendario.
--
-- cycle_month se conserva por compatibilidad hacia atrás (se sigue escribiendo
-- = start_date en cada insert/update), pero deja de ser la fuente de verdad
-- para lógica de fechas — eso pasa a start_date/end_date.

ALTER TABLE paid_media_cycles
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;

-- Backfill: para cada ciclo existente, start_date = cycle_month (el día 1 que
-- ya se guardaba) y end_date = el último día de ese mes calendario, para no
-- perder información de ningún ciclo ya creado.
UPDATE paid_media_cycles
SET start_date = cycle_month,
    end_date = (cycle_month + INTERVAL '1 month' - INTERVAL '1 day')::date
WHERE start_date IS NULL OR end_date IS NULL;

ALTER TABLE paid_media_cycles
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL;

-- Los ciclos ahora se identifican por su fecha de inicio real, no por el mes
-- calendario (dos ciclos del mismo cliente ya no pueden compartir cycle_month
-- por definición, pero start_date es la clave real).
ALTER TABLE paid_media_cycles
  DROP CONSTRAINT IF EXISTS paid_media_cycles_project_id_cycle_month_key;

ALTER TABLE paid_media_cycles
  ADD CONSTRAINT paid_media_cycles_project_id_start_date_key UNIQUE (project_id, start_date);

-- Día fijo del mes (1-31) en que arranca el ciclo de facturación/reporte de
-- cada cliente, para sugerir automáticamente la fecha de inicio al abrir un
-- nuevo ciclo en vez de calcularla a mano. Opcional — null si no aplica
-- (ej. proyectos que no son de paid media, o clientes sin día fijo).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS paid_media_cycle_start_day INT
    CHECK (paid_media_cycle_start_day IS NULL OR (paid_media_cycle_start_day BETWEEN 1 AND 31));
