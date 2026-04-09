-- Fix: allow subadmins (and admins) to insert/update/delete project members
-- Previously only admins could write to project_members; subadmins were blocked.
DROP POLICY IF EXISTS "pm_admin" ON project_members;
CREATE POLICY "pm_admin" ON project_members FOR ALL USING (is_admin_or_subadmin());
