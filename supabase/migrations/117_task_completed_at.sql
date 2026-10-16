-- Fechas confiables en tareas: updated_at (se toca en cada cambio) y
-- completed_at (cuándo pasó a Done; se limpia si se reabre). Las usa la vista
-- Equipo → persona ("Hechas" de los últimos 14 días, "sin movimiento").
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Las que ya estaban hechas: la mejor aproximación disponible.
UPDATE tasks SET completed_at = updated_at WHERE status = 'Done' AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION tasks_touch_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status = 'Done' AND (OLD.status IS DISTINCT FROM 'Done') THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status <> 'Done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_touch_dates ON tasks;
CREATE TRIGGER tasks_touch_dates BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_touch_dates();

CREATE INDEX IF NOT EXISTS tasks_assignee_completed_idx ON tasks (assignee_id, completed_at DESC);
NOTIFY pgrst, 'reload schema';
