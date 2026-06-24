-- ============================================================
-- 032_update_angle_types.sql
-- Update the angle_type check constraint to match the current
-- ANGLE_GUIDE constant used in the application.
-- ============================================================

ALTER TABLE creative_concepts
  DROP CONSTRAINT IF EXISTS creative_concepts_angle_type_check;

ALTER TABLE creative_concepts
  ADD CONSTRAINT creative_concepts_angle_type_check
  CHECK (angle_type IN (
    'Desired Outcome', 'Objection', 'Feature / Benefit',
    'Use Case', 'Consequence', 'Misconception',
    'Education', 'Acceptance', 'Failed Solutions', 'Identity',
    -- Legacy values (keep for existing rows)
    'Problem Agitation', 'Mechanism Reveal', 'Enemy Framing',
    'Before/After Transformation', 'Social Proof', 'Contrarian',
    'Direct Desire', 'Fear of Missing Out', 'Authority', 'Curiosity Gap'
  ));
