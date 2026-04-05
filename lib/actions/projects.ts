"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ProjectStatus } from "@/lib/types"

export async function getProjects() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("projects")
    .select("*, customer:customers(id, name, company)")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function getProject(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      customer:customers(id, name, company),
      tasks(*,assignee:profiles(id, full_name, avatar_url)),
      members:project_members(profile:profiles(id, full_name, avatar_url, position))
    `)
    .eq("id", id)
    .single()

  if (error) throw error
  return data
}

export async function createProject(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.from("projects").insert({
    name: formData.get("name") as string,
    customer_id: (formData.get("customer_id") as string) || null,
    status: (formData.get("status") as ProjectStatus) ?? "Planning",
    start_date: (formData.get("start_date") as string) || null,
    end_date: (formData.get("end_date") as string) || null,
    budget: formData.get("budget") ? Number(formData.get("budget")) : null,
    description: (formData.get("description") as string) || null,
  })

  if (error) throw error
  revalidatePath("/projects")
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("projects")
    .update({
      name: formData.get("name") as string,
      customer_id: (formData.get("customer_id") as string) || null,
      status: formData.get("status") as ProjectStatus,
      start_date: (formData.get("start_date") as string) || null,
      end_date: (formData.get("end_date") as string) || null,
      budget: formData.get("budget") ? Number(formData.get("budget")) : null,
      description: (formData.get("description") as string) || null,
    })
    .eq("id", id)

  if (error) throw error
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
}

export async function deleteProject(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("projects").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/projects")
}

export async function addProjectMember(projectId: string, profileId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, profile_id: profileId })

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function removeProjectMember(projectId: string, profileId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("profile_id", profileId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}
