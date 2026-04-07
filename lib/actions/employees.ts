"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Role } from "@/lib/types"

export async function getEmployees() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name")
  if (error) throw error
  return data
}

export async function getEmployee(id: string) {
  const supabase = await createClient()

  const [profileRes, projectsRes, tasksRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).single(),
    supabase
      .from("project_members")
      .select("project:projects(id, name, status, progress, project_type:project_types(name), customer:customers(name))")
      .eq("profile_id", id),
    supabase
      .from("tasks")
      .select("*, project:projects(id, name)")
      .eq("assignee_id", id)
      .neq("status", "Done")
      .order("due_date", { ascending: true }),
  ])

  if (profileRes.error) throw profileRes.error

  const projects = (projectsRes.data ?? [])
    .map((pm: Record<string, unknown>) => {
      const proj = pm.project
      return Array.isArray(proj) ? proj[0] : proj
    })
    .filter(Boolean)

  return {
    profile: profileRes.data,
    projects,
    tasks: tasksRes.data ?? [],
  }
}

export async function createEmployee(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const fullName = formData.get("full_name") as string
  const position = (formData.get("position") as string) || null
  const phone = (formData.get("phone") as string) || null
  const role = (formData.get("role") as Role) ?? "employee"

  // Use Service Role admin client to invite — anon key doesn't have auth.admin privileges
  const adminClient = createAdminClient()
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/callback`,
  })

  if (inviteError) throw inviteError

  // Upsert profile (use regular client so RLS applies normally)
  if (invited?.user?.id) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: invited.user.id,
      full_name: fullName,
      email,
      role,
      position,
      phone,
    }, { onConflict: "id" })

    if (profileError) throw profileError
  }

  revalidatePath("/employees")
}

export async function updateEmployee(id: string, formData: FormData) {
  const supabase = await createClient()
  const role = formData.get("role") as string
  const updates: Record<string, unknown> = {
    full_name: formData.get("full_name") as string,
    position: (formData.get("position") as string) || null,
    phone: (formData.get("phone") as string) || null,
  }
  if (role) updates.role = role
  const { error } = await supabase.from("profiles").update(updates).eq("id", id)
  if (error) throw error
  revalidatePath("/employees")
  revalidatePath(`/employees/${id}`)
}

export async function resendPasswordLink(email: string) {
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
  })
  if (error) throw error
}

export async function deleteEmployee(id: string) {
  // Delete from auth.users via admin client (profiles will cascade)
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.deleteUser(id)
  if (error) throw error
  revalidatePath("/employees")
}
