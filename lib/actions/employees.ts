"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

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
      .select("project:projects(id, name, status, progress, customer:customers(name))")
      .eq("profile_id", id),
    supabase
      .from("tasks")
      .select("*, project:projects(id, name)")
      .eq("assignee_id", id)
      .order("due_date", { ascending: true }),
  ])

  if (profileRes.error) throw profileRes.error

  // Supabase returns the joined project as an array type even for many-to-one;
  // flatten it by extracting the first element if it's an array.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = (projectsRes.data ?? []).map((pm: any) => {
    const proj = pm.project
    return Array.isArray(proj) ? proj[0] : proj
  }).filter(Boolean)

  return {
    profile: profileRes.data,
    projects,
    tasks: tasksRes.data ?? [],
  }
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
