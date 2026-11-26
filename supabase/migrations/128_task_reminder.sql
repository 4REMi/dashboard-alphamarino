-- "Recordar" (buzz) en el modal de tarea: reenvía al responsable un aviso de
-- que la tarea sigue pendiente. Se guarda cuándo fue el último para
-- mostrarlo en el modal y para limitar a uno por hora por tarea (que no se
-- vuelva spam). Ver sendTaskReminder en lib/actions/tasks.ts.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
