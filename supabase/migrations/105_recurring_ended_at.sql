-- Fecha de baja de un gasto recurrente: deja de contar desde aquí sin
-- desaparecer de los meses en que sí aplicó (antes desactivarlo lo borraba
-- de toda la gráfica de 12 meses).
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS ended_at DATE;

NOTIFY pgrst, 'reload schema';
