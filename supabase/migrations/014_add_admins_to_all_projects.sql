-- Add all admin-role users to every project where they are not already a member.
-- This backfills historical projects created before the auto-add feature existed.
-- New projects going forward already auto-add the creator on createProject().

INSERT INTO project_members (project_id, profile_id)
SELECT p.id, pr.id
FROM projects p
CROSS JOIN profiles pr
WHERE pr.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = p.id AND pm.profile_id = pr.id
  );
