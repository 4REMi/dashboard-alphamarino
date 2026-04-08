-- Add language preference column to profiles
-- Allows per-user UI language selection (es/en)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'es'
  CHECK (language IN ('es', 'en'));
