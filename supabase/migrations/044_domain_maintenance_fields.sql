-- Separar costo de mantenimiento del costo de dominio, y agregar hosting/última mantención.
ALTER TABLE domains
  ADD COLUMN IF NOT EXISTS hosted_at TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_type TEXT NOT NULL DEFAULT 'client'
    CHECK (maintenance_type IN ('client', 'own_project', 'n_a')),
  ADD COLUMN IF NOT EXISTS maintenance_cost NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS last_maintenance_date DATE,
  ADD COLUMN IF NOT EXISTS last_maintenance_notes TEXT;
