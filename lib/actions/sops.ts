"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import type { Sop, SopRequest } from "@/lib/types"

// ============================================================
// SOP BANK — CRUD
// ============================================================

export async function getSops(): Promise<Sop[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sops")
    .select("*, author:profiles(id, full_name, avatar_url)")
    .order("created_at", { ascending: false })
  if (error) return []
  return (data ?? []) as Sop[]
}

export async function getSop(id: string): Promise<Sop | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sops")
    .select("*, author:profiles(id, full_name, avatar_url)")
    .eq("id", id)
    .single()
  if (error) return null
  return data as Sop
}

export async function createSop(formData: FormData): Promise<Sop> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const tagsRaw = (formData.get("tags") as string) ?? ""
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)

  const { data, error } = await supabase
    .from("sops")
    .insert({
      title:       (formData.get("title") as string).trim(),
      description: (formData.get("description") as string) || null,
      doc_url:     (formData.get("doc_url") as string) || null,
      video_url:   (formData.get("video_url") as string) || null,
      category:    (formData.get("category") as string) || null,
      tags,
      visibility:  (formData.get("visibility") as string) || "public",
      author_id:   user.id,
    })
    .select("*, author:profiles(id, full_name, avatar_url)")
    .single()
  if (error) throw error
  revalidatePath("/sops")
  return data as Sop
}

export async function updateSop(id: string, formData: FormData): Promise<Sop> {
  const supabase = await createClient()
  const tagsRaw = (formData.get("tags") as string) ?? ""
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)

  const { data, error } = await supabase
    .from("sops")
    .update({
      title:       (formData.get("title") as string).trim(),
      description: (formData.get("description") as string) || null,
      doc_url:     (formData.get("doc_url") as string) || null,
      video_url:   (formData.get("video_url") as string) || null,
      category:    (formData.get("category") as string) || null,
      tags,
      visibility:  (formData.get("visibility") as string) || "public",
    })
    .eq("id", id)
    .select("*, author:profiles(id, full_name, avatar_url)")
    .single()
  if (error) throw error
  revalidatePath("/sops")
  return data as Sop
}

export async function deleteSop(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from("sops").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/sops")
}

// Assign a SOP to a task_set_task (template level)
export async function assignSopToTaskSetTask(taskSetTaskId: string, sopId: string | null): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("task_set_tasks")
    .update({ sop_id: sopId })
    .eq("id", taskSetTaskId)
  if (error) throw error
  revalidatePath("/operations")
}

// Assign or override a SOP on a project task
export async function assignSopToTask(taskId: string, sopId: string | null, projectId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("tasks")
    .update({ sop_id: sopId })
    .eq("id", taskId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// SOP REQUESTS
// ============================================================

export async function getSopRequests(): Promise<SopRequest[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sop_requests")
    .select(`
      *,
      requester:profiles!sop_requests_requested_by_fkey(id, full_name, avatar_url),
      assignee:profiles!sop_requests_assigned_to_fkey(id, full_name, avatar_url),
      task:tasks(title),
      task_set_task:task_set_tasks(title)
    `)
    .order("created_at", { ascending: false })
  if (error) return []
  return (data ?? []) as SopRequest[]
}

export async function getMyPendingSopRequests(): Promise<SopRequest[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("sop_requests")
    .select(`
      *,
      requester:profiles!sop_requests_requested_by_fkey(id, full_name, avatar_url),
      task:tasks(title),
      task_set_task:task_set_tasks(title)
    `)
    .eq("assigned_to", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
  if (error) return []
  return (data ?? []) as SopRequest[]
}

export async function createSopRequest(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { error } = await supabase.from("sop_requests").insert({
    task_set_task_id: (formData.get("task_set_task_id") as string) || null,
    task_id:          (formData.get("task_id") as string) || null,
    requested_by:     user.id,
    assigned_to:      (formData.get("assigned_to") as string) || null,
    note:             (formData.get("note") as string) || null,
  })
  if (error) throw error
  revalidatePath("/sops")
}

export async function fulfillSopRequest(requestId: string, sopId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("sop_requests")
    .update({ status: "fulfilled" })
    .eq("id", requestId)
  if (error) throw error

  // If request was tied to a task_set_task, auto-assign the SOP there
  const { data: req } = await supabase
    .from("sop_requests")
    .select("task_set_task_id, task_id")
    .eq("id", requestId)
    .single()

  if (req?.task_set_task_id) {
    await assignSopToTaskSetTask(req.task_set_task_id, sopId)
  }
  revalidatePath("/sops")
}

export async function dismissSopRequest(requestId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("sop_requests")
    .update({ status: "dismissed" })
    .eq("id", requestId)
  if (error) throw error
  revalidatePath("/sops")
}
