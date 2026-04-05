"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { TaskStatus, TaskPriority } from "@/lib/types"

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
  const supabase = await createClient()

  const { error } = await supabase.from("tasks").insert({
    project_id: formData.get("project_id") as string,
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    status: (formData.get("status") as TaskStatus) ?? "Todo",
    priority: (formData.get("priority") as TaskPriority) ?? "Medium",
    due_date: (formData.get("due_date") as string) || null,
    assignee_id: (formData.get("assignee_id") as string) || null,
  })

  if (error) throw error
  const projectId = formData.get("project_id") as string
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function updateTask(id: string, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("tasks")
    .update({
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      status: formData.get("status") as TaskStatus,
      priority: formData.get("priority") as TaskPriority,
      due_date: (formData.get("due_date") as string) || null,
      assignee_id: (formData.get("assignee_id") as string) || null,
    })
    .eq("id", id)

  if (error) throw error
  revalidatePath("/tasks")
  revalidatePath("/projects")
}

export async function updateTaskStatus(id: string, status: TaskStatus, projectId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", id)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function deleteTask(id: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("tasks").delete().eq("id", id)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}
