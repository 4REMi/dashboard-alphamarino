-- ============================================================
-- 073_project_deliverable_periods.sql
-- Tracked "how many of X are we owed / have we delivered this period" for
-- a project's attached service offers. One row per (project, offer,
-- deliverable line, period) — created lazily the first time that period is
-- viewed (see getCurrentPeriodDeliverables in
-- lib/actions/service-deliverables.ts), so expected_quantity can be
-- overridden for one specific period without touching the offer's own
-- definition or any other period.
--
-- Deliberately generic, not anchored to paid_media_cycles or any other
-- project-type-specific cycle concept — periods are always calendar-based
-- (month/quarter/half-year, or a single period for "once"), for any project
-- type. This is about tracking contracted scope for any service of a
-- recurring nature, not just Paid Media.
--
-- Entirely separate from the internal task/deliverable system
-- (tasks.requires_deliverable, the `deliverables` table, task_set_tasks) —
-- this is about what the client tangibly receives, not internal work
-- artifacts. Purely internal tooling: nothing here is ever exposed to a
-- client, there is no portal/share page involved.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_deliverable_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service_offer_id UUID NOT NULL REFERENCES service_offers(id) ON DELETE CASCADE,
  deliverable_key TEXT NOT NULL,
  deliverable_text TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_label TEXT NOT NULL,
  expected_quantity INT NOT NULL CHECK (expected_quantity >= 0),
  fulfilled_quantity INT NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, service_offer_id, deliverable_key, period_start)
);

ALTER TABLE project_deliverable_periods ENABLE ROW LEVEL SECURITY;

-- Writes (including the "mark as fulfilled" action available to employees
-- with manage_tasks) go through the admin client after an app-level can()
-- check in lib/actions/service-deliverables.ts — same pattern already used
-- by lib/actions/tasks.ts — so RLS itself only needs to cover admin/subadmin
-- direct access plus read access for project members.
CREATE POLICY "project_deliverable_periods_admin" ON project_deliverable_periods FOR ALL
  USING (is_admin_or_subadmin()) WITH CHECK (is_admin_or_subadmin());

CREATE POLICY "project_deliverable_periods_member_read" ON project_deliverable_periods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = project_deliverable_periods.project_id AND profile_id = auth.uid()
    )
  );
