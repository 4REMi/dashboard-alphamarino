-- brand_lines' SELECT policy never got the project-member exception that
-- creative_concepts/creative_assets/creative_briefs already have — so a
-- project member (e.g. a video editor) could see the concepts of a project
-- but the Brand Line each one belongs to came back empty, collapsing the
-- whole Creative Tracker grouping into a single empty "General" bucket.
--
-- Brand Lines hang off a Brand Brain, and a project has at most one Brand
-- Brain (projects.brand_brain_id), so the exception mirrors that path:
-- a member of any project whose brand_brain_id matches this line's brain
-- can read it. Write stays admin/subadmin-only — line management is
-- still strategy work, not something project members do.

DROP POLICY IF EXISTS "bl_select" ON brand_lines;
CREATE POLICY "bl_select" ON brand_lines FOR SELECT
  USING (
    is_admin_or_subadmin()
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.brand_brain_id = brand_lines.brand_brain_id
        AND pm.profile_id = auth.uid()
    )
  );
