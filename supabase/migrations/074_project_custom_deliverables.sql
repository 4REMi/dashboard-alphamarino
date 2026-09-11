-- ============================================================
-- 074_project_custom_deliverables.sql
-- Two additions to the entregables-de-servicio system
-- (docs/agent-guides/entregables-de-servicio.md):
--
-- 1. A project can now track a one-off deliverable that isn't part of any
--    catalog offer — for projects whose scope genuinely isn't common enough
--    to formalize as a reusable Servicios offer. project_deliverable_periods
--    can now have a NULL service_offer_id for these.
-- 2. Since service_offer_id can be NULL for multiple rows of the same
--    project, it can no longer be part of the uniqueness key (SQL treats
--    each NULL as distinct, so the old constraint would never actually
--    prevent a duplicate custom-deliverable period). deliverable_key is
--    already a stable per-line UUID (the offer's deliverable line id, or —
--    new — the custom deliverable's own id), so the constraint is
--    tightened to (project_id, deliverable_key, period_start) instead.
-- ============================================================

ALTER TABLE project_deliverable_periods ALTER COLUMN service_offer_id DROP NOT NULL;

ALTER TABLE project_deliverable_periods
  ADD CONSTRAINT project_deliverable_periods_key_period_unique
  UNIQUE (project_id, deliverable_key, period_start);

CREATE TABLE IF NOT EXISTS project_custom_deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('once', 'monthly', 'quarterly', 'biannual')),
  quantity INT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_custom_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_custom_deliverables_admin" ON project_custom_deliverables FOR ALL
  USING (is_admin_or_subadmin()) WITH CHECK (is_admin_or_subadmin());

CREATE POLICY "project_custom_deliverables_member_read" ON project_custom_deliverables FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = project_custom_deliverables.project_id AND profile_id = auth.uid()
    )
  );
