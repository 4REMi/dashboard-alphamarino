-- ============================================================
-- 072_project_service_offers.sql
-- Links a project to one or more service_offers — a project can combine
-- several independent offers (not just a single base offer). This is what
-- lets us know "what this client is actually owed" per project, which
-- previously had no connection to the Servicios catalog at all.
-- ============================================================

CREATE TABLE IF NOT EXISTS project_service_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service_offer_id UUID NOT NULL REFERENCES service_offers(id) ON DELETE RESTRICT,
  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, service_offer_id)
);

ALTER TABLE project_service_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_service_offers_admin" ON project_service_offers FOR ALL
  USING (is_admin_or_subadmin()) WITH CHECK (is_admin_or_subadmin());

CREATE POLICY "project_service_offers_member_read" ON project_service_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = project_service_offers.project_id AND profile_id = auth.uid()
    )
  );
