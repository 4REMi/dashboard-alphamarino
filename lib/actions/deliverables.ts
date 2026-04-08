"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import type { DeliverableType } from "@/lib/types"

export async function getProjectDeliverables(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("deliverables")
    .select("*, task:tasks(title), uploader:profiles(id, full_name, avatar_url)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function submitDeliverable(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const projectId    = formData.get("project_id") as string
  const taskId       = formData.get("task_id") as string
  const deliverableId = (formData.get("deliverable_id") as string) || null
  const type         = formData.get("type") as DeliverableType
  const title        = formData.get("title") as string
  const content      = (formData.get("content") as string) || null
  const fileUrl      = (formData.get("file_url") as string) || null
  const fileName     = (formData.get("file_name") as string) || null

  const admin = createAdminClient()

  if (deliverableId) {
    const { error } = await admin
      .from("deliverables")
      .update({ type, title, content, file_url: fileUrl, file_name: fileName })
      .eq("id", deliverableId)
    if (error) throw error
  } else {
    const { error } = await admin.from("deliverables").insert({
      task_id: taskId,
      project_id: projectId,
      type,
      title,
      content,
      file_url: fileUrl,
      file_name: fileName,
      uploaded_by: user.id,
    })
    if (error) throw error
  }

  revalidatePath(`/projects/${projectId}`)
}

export async function deleteDeliverable(id: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single()

  if (!can(profile, "edit_projects")) throw new Error("Permission denied")

  const admin = createAdminClient()
  const { error } = await admin.from("deliverables").delete().eq("id", id)
  if (error) throw error

  revalidatePath(`/projects/${projectId}`)
}

export async function toggleRequiresDeliverable(
  taskId: string,
  requires: boolean,
  projectId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single()

  if (!can(profile, "manage_tasks")) throw new Error("Permission denied")

  const admin = createAdminClient()
  const { error } = await admin
    .from("tasks")
    .update({ requires_deliverable: requires } as Record<string, unknown>)
    .eq("id", taskId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}
