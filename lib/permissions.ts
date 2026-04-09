import type { Profile } from "@/lib/types"

export type UserPermissions = {
  view_project_financials?: boolean  // project value, income, expenses
  view_global_finances?: boolean     // /finances section
  edit_projects?: boolean            // create, edit, archive projects
  manage_team?: boolean              // add/remove project members
  view_all_projects?: boolean        // see all projects vs only assigned ones
  manage_tasks?: boolean             // add, edit, delete tasks in projects
  request_sops?: boolean             // request SOPs for tasks
  assign_sops?: boolean              // assign SOPs to tasks/templates
}

// Defaults per role (admin always returns true without checking)
const SUBADMIN_DEFAULTS: Required<UserPermissions> = {
  view_project_financials: true,
  view_global_finances: true,
  edit_projects: true,
  manage_team: true,
  view_all_projects: true,
  manage_tasks: true,
  request_sops: true,
  assign_sops: true,
}

const EMPLOYEE_DEFAULTS: Required<UserPermissions> = {
  view_project_financials: false,
  view_global_finances: false,
  edit_projects: false,
  manage_team: false,
  view_all_projects: false,
  manage_tasks: true,
  request_sops: false,
  assign_sops: false,
}

export function can(
  profile: Pick<Profile, "role" | "permissions"> | null | undefined,
  permission: keyof UserPermissions
): boolean {
  if (!profile) return false
  if (profile.role === "admin") return true

  const perms = (profile.permissions ?? {}) as UserPermissions

  // Explicit override takes priority
  if (perms[permission] !== undefined) return !!perms[permission]

  // Fall back to role defaults
  const defaults = profile.role === "subadmin" ? SUBADMIN_DEFAULTS : EMPLOYEE_DEFAULTS
  return defaults[permission]
}
