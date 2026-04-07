"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
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

  // Use Supabase Admin to invite user by email
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      role,
    },
  })

  if (inviteError) throw inviteError

  // Upsert profile in case trigger already created it
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
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: formData.get("full_name") as string,
      position: (formData.get("position") as string) || null,
      phone: (formData.get("phone") as string) || null,
    })
    .eq("id", id)
  if (error) throw error
  revalidatePath("/employees")
  revalidatePath(`/employees/${id}`)
}
