"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import type { TaskStatus, TaskChecklistItem, PhaseStatus } from "@/lib/types"

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
    .select("*, project:projects(id, name), assignee:profiles(id, full_name, avatar_url), phase:project_phases(id, name, phase_order), checklist_items:task_checklist_items(id, text, is_blocking, is_checked, item_order)")
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

  if (status === "Done") {
    const { count } = await admin
      .from("task_checklist_items")
      .select("*", { count: "exact", head: true })
      .eq("task_id", id)
      .eq("is_blocking", true)
      .eq("is_checked", false)
    if (count && count > 0) {
      throw new Error(`Hay ${count} item${count > 1 ? "s" : ""} obligatorio${count > 1 ? "s" : ""} sin completar`)
    }
  }

  const { data, error } = await admin
    .from("tasks")
    .update({ status })
    .eq("id", id)
    .select("phase_id")
    .single()

  if (error) throw error

  if (data.phase_id) {
    await syncPhaseStatusFromTasks(admin, data.phase_id)
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function deleteTask(id: string, projectId: string) {
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { data: task } = await admin.from("tasks").select("phase_id").eq("id", id).single()

  const { error } = await admin.from("tasks").delete().eq("id", id)
  if (error) throw error

  if (task?.phase_id) {
    await syncPhaseStatusFromTasks(admin, task.phase_id)
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

// Keep task status in sync with checklist completion: fully checked -> Done,
// some checked -> In Progress, none checked -> Todo. No-op for tasks without a checklist.
async function syncTaskStatusFromChecklist(admin: ReturnType<typeof createAdminClient>, taskId: string) {
  const { data: items } = await admin
    .from("task_checklist_items")
    .select("is_checked")
    .eq("task_id", taskId)
  if (!items || items.length === 0) return

  const checked = items.filter((i) => i.is_checked).length
  const status: TaskStatus = checked === items.length ? "Done" : checked > 0 ? "In Progress" : "Todo"

  const { data } = await admin
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .select("phase_id")
    .single()

  if (data?.phase_id) {
    await syncPhaseStatusFromTasks(admin, data.phase_id)
  }
}

// Keep a phase's status in sync with the completion of its tasks: all done ->
// completed, some started -> in_progress, none started -> pending. Phases
// manually marked "blocked" are left untouched unless `ignoreBlocked` is set
// (used by the manual "unblock" action to recompute the natural status).
async function syncPhaseStatusFromTasks(
  admin: ReturnType<typeof createAdminClient>,
  phaseId: string,
  ignoreBlocked = false
): Promise<PhaseStatus | null> {
  const { data: phase } = await admin
    .from("project_phases")
    .select("status, started_at, completed_at")
    .eq("id", phaseId)
    .single()
  if (!phase) return null
  if (phase.status === "blocked" && !ignoreBlocked) return null

  const { data: tasks } = await admin
    .from("tasks")
    .select("status")
    .eq("phase_id", phaseId)

  const total = tasks?.length ?? 0
  const done = tasks?.filter((t) => t.status === "Done").length ?? 0
  const started = tasks?.filter((t) => t.status !== "Todo").length ?? 0

  const status: PhaseStatus =
    total === 0 ? "pending" : done === total ? "completed" : started > 0 ? "in_progress" : "pending"

  if (status === phase.status) return status

  const updates: Record<string, unknown> = { status }
  if (status === "in_progress" && !phase.started_at) updates.started_at = new Date().toISOString()
  if (status === "completed" && !phase.completed_at) updates.completed_at = new Date().toISOString()
  if (status !== "completed") updates.completed_at = null
  if (status === "pending") updates.started_at = null

  await admin.from("project_phases").update(updates).eq("id", phaseId)
  return status
}

// Recompute a phase's status from its current tasks even if it's marked
// "blocked" — used by the manual "unblock" action.
export async function recalculatePhaseStatus(phaseId: string, projectId: string) {
  await requireTaskPermission(projectId)
  const admin = createAdminClient()
  const status = await syncPhaseStatusFromTasks(admin, phaseId, true)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
  return status
}

// ─── Checklist actions ────────────────────────────────────────────────────────

export async function createChecklistItem(
  taskId: string,
  text: string,
  isBlocking: boolean,
  projectId: string
): Promise<TaskChecklistItem> {
  await requireTaskPermission(projectId)
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from("task_checklist_items")
    .select("item_order")
    .eq("task_id", taskId)
    .order("item_order", { ascending: false })
    .limit(1)
  const nextOrder = (existing?.[0]?.item_order ?? -1) + 1

  const { data, error } = await admin
    .from("task_checklist_items")
    .insert({ task_id: taskId, text, is_blocking: isBlocking, item_order: nextOrder })
    .select()
    .single()
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
  return data as TaskChecklistItem
}

export async function toggleChecklistItem(
  itemId: string,
  isChecked: boolean,
  projectId: string
) {
  await requireTaskPermission(projectId)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("task_checklist_items")
    .update({ is_checked: isChecked })
    .eq("id", itemId)
    .select("task_id")
    .single()
  if (error) throw error

  await syncTaskStatusFromChecklist(admin, data.task_id)

  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function updateChecklistItem(
  itemId: string,
  fields: { text?: string; is_blocking?: boolean },
  projectId: string
) {
  await requireTaskPermission(projectId)
  const admin = createAdminClient()
  const { error } = await admin
    .from("task_checklist_items")
    .update(fields)
    .eq("id", itemId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function deleteChecklistItem(itemId: string, projectId: string) {
  await requireTaskPermission(projectId)
  const admin = createAdminClient()
  const { error } = await admin
    .from("task_checklist_items")
    .delete()
    .eq("id", itemId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function reorderChecklistItems(
  orderedIds: string[],
  projectId: string
) {
  await requireTaskPermission(projectId)
  const admin = createAdminClient()
  await Promise.all(
    orderedIds.map((id, index) =>
      admin.from("task_checklist_items").update({ item_order: index }).eq("id", id)
    )
  )
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}
