-- Let project members upload/edit/delete their own finished creative assets
-- (video/image files) without needing an admin or subadmin to do it for
-- them. Concepts and briefs (the strategy layer) stay admin/subadmin-only —
-- this only opens the "produce and upload the final piece" step.

DROP POLICY IF EXISTS "ca_write" ON creative_assets;
CREATE POLICY "ca_write" ON creative_assets FOR ALL
  USING (
    is_admin_or_subadmin()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = creative_assets.project_id
        AND pm.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin_or_subadmin()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = creative_assets.project_id
        AND pm.profile_id = auth.uid()
    )
  );
