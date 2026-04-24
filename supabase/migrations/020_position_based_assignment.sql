-- ── 020: Position-based task assignment ─────────────────────────────────────
-- Replaces hardcoded employee assignment on task sets with position-based
-- assignment at the individual task level.

-- 1. Controlled positions list
CREATE TABLE IF NOT EXISTS positions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read positions"
  ON positions FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage positions"
  ON positions FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 2. Link profiles to a controlled position
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES positions(id) ON DELETE SET NULL;

-- 3. Per-task position in templates (replaces task_sets.default_assignee_id)
ALTER TABLE task_set_tasks
  ADD COLUMN IF NOT EXISTS default_position_id UUID REFERENCES positions(id) ON DELETE SET NULL;

-- 4. Remove assignee from task_sets (assignment is now per-task via position)
ALTER TABLE task_sets
  DROP COLUMN IF EXISTS default_assignee_id;

-- 5. Track unresolved assignment reason on real tasks
--    'none'      = no position set on template task
--    'no_match'  = position set but no project member has it
--    'multi'     = position set but multiple project members match
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_flag TEXT CHECK (
    assignment_flag IN ('no_match', 'multi')
  );
