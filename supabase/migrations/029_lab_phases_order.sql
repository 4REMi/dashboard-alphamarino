-- Add phase_order to lab_phases so users can drag-reorder their personal phases
ALTER TABLE lab_phases ADD COLUMN IF NOT EXISTS phase_order INT NOT NULL DEFAULT 0;

-- Backfill: preserve current display order (newest first = lowest order value)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY author_id ORDER BY updated_at DESC) - 1 AS rn
  FROM lab_phases
)
UPDATE lab_phases SET phase_order = ranked.rn
FROM ranked WHERE lab_phases.id = ranked.id;
