-- Track which canonical phase set / phase a lab_phases draft was forked from,
-- so Mi Ops Lab can display its origin instead of treating every draft as
-- created from scratch. Both columns are nullable — a phase built from
-- scratch (not via forkCanonicalPhase) simply has no origin.

ALTER TABLE lab_phases
  ADD COLUMN IF NOT EXISTS source_phase_set_id UUID REFERENCES phase_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_phase_set_phase_id UUID REFERENCES phase_set_phases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lab_phases_source_phase_set_idx ON lab_phases(source_phase_set_id);
