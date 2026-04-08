"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import type { TaskStatus } from "@/lib/types"

async function requireTaskPermission(projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single()

  if (!can(profile, "manage_tasks")) throw new Error("Permission denied")

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single()

  if (!project) throw new Error("Project not found or access denied")

  return user
}

export async function getTasks(projectId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from("tasks")
    .select("*, project:projects(id, name), assignee:profiles(id, full_name, avatar_url)")
    .order("created_at", { ascending: false })

  if (projectId) {
    query = query.eq("project_id", projectId)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createTask(formData: FormData) {
  const projectId = formData.get("project_id") as string
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { error } = await admin.from("tasks").insert({
    project_id: projectId,
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    status: (formData.get("status") as TaskStatus) ?? "Todo",
    is_urgent: formData.get("is_urgent") === "true",
    requires_deliverable: formData.get("requires_deliverable") === "true",
    due_date: (formData.get("due_date") as string) || null,
    assignee_id: (formData.get("assignee_id") as string) || null,
  } as Record<string, unknown>)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function updateTask(id: string, formData: FormData) {
  const projectId = formData.get("project_id") as string
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { error } = await admin
    .from("tasks")
    .update({
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      status: formData.get("status") as TaskStatus,
      is_urgent: formData.get("is_urgent") === "true",
      requires_deliverable: formData.get("requires_deliverable") === "true",
      due_date: (formData.get("due_date") as string) || null,
      assignee_id: (formData.get("assignee_id") as string) || null,
    } as Record<string, unknown>)
    .eq("id", id)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function updateTaskUrgent(id: string, isUrgent: boolean, projectId: string) {
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { error } = await admin
    .from("tasks")
    .update({ is_urgent: isUrgent })
    .eq("id", id)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function updateTaskAssignee(id: string, assigneeId: string | null, projectId: string) {
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { error } = await admin
    .from("tasks")
    .update({ assignee_id: assigneeId })
    .eq("id", id)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function updateTaskStatus(id: string, status: TaskStatus, projectId: string) {
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { error } = await admin
    .from("tasks")
    .update({ status })
    .eq("id", id)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function deleteTask(id: string, projectId: string) {
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { error } = await admin.from("tasks").delete().eq("id", id)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}
