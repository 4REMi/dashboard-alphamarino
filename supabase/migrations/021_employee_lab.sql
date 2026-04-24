-- ── 021: Employee Lab (proposals + SOP request improvements) ─────────────────

-- Lab proposals (personal workflow drafts)
CREATE TABLE IF NOT EXISTS lab_proposals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','submitted','approved','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_proposal_phases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES lab_proposals(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  phase_order  INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_proposal_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES lab_proposals(id) ON DELETE CASCADE,
  phase_id     UUID REFERENCES lab_proposal_phases(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  task_order   INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_proposal_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES lab_proposals(id) ON DELETE CASCADE,
  reviewer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('comment','approve','reject')),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE lab_proposals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_proposal_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_proposal_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_proposal_reviews ENABLE ROW LEVEL SECURITY;

-- Authors see their own; admins/subadmins see all
CREATE POLICY "lab_proposals_select" ON lab_proposals FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR
         (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','subadmin'));

CREATE POLICY "lab_proposals_insert" ON lab_proposals FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "lab_proposals_update" ON lab_proposals FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR
         (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','subadmin'));

CREATE POLICY "lab_proposals_delete" ON lab_proposals FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR
         (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Phases & tasks inherit proposal visibility
CREATE POLICY "lab_proposal_phases_select" ON lab_proposal_phases FOR SELECT TO authenticated
  USING (proposal_id IN (SELECT id FROM lab_proposals));

CREATE POLICY "lab_proposal_phases_write" ON lab_proposal_phases FOR ALL TO authenticated
  USING (proposal_id IN (SELECT id FROM lab_proposals WHERE author_id = auth.uid() OR
         (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','subadmin')));

CREATE POLICY "lab_proposal_tasks_select" ON lab_proposal_tasks FOR SELECT TO authenticated
  USING (proposal_id IN (SELECT id FROM lab_proposals));

CREATE POLICY "lab_proposal_tasks_write" ON lab_proposal_tasks FOR ALL TO authenticated
  USING (proposal_id IN (SELECT id FROM lab_proposals WHERE author_id = auth.uid() OR
         (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','subadmin')));

-- Reviews: admins/subadmins write, everyone sees
CREATE POLICY "lab_proposal_reviews_select" ON lab_proposal_reviews FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "lab_proposal_reviews_write" ON lab_proposal_reviews FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','subadmin'));

-- Trigger: auto-update updated_at on lab_proposals
CREATE OR REPLACE FUNCTION update_lab_proposal_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER lab_proposals_updated_at
  BEFORE UPDATE ON lab_proposals
  FOR EACH ROW EXECUTE FUNCTION update_lab_proposal_updated_at();
