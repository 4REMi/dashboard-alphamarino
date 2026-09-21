-- La bitácora se vuelve una parte más central de cada proyecto — se le
-- agrega fecha propia del evento (distinta de created_at, para poder
-- registrar algo que ya pasó, como "Galcen pasó el dominio hace dos
-- semanas") y una categoría simple para escanear la bitácora de un
-- vistazo.
ALTER TABLE project_log_entries ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE project_log_entries ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IS NULL OR category IN ('Decisión', 'Bloqueo', 'Cliente', 'Interno'));
