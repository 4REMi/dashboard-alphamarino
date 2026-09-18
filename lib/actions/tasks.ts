"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import { notify } from "@/lib/notifications/notify"
import type { TaskStatus, TaskChecklistItem, PhaseStatus } from "@/lib/types"

// projectId is null for standalone tasks (not tied to any project) — the
// project-existence check only applies when a project is actually claimed.
//
// actingProfileId is set only by the MCP server (app/api/mcp/route.ts) —
// an MCP request carries no browser session/cookies, so there's no
// supabase.auth.getUser() to call. The MCP layer resolves which profile
// the caller's personal API key belongs to and passes that id straight
// through, and this function checks the SAME `manage_tasks` permission
// against that profile (via the admin client, since there's no session to
// run it through) instead of skipping the check entirely — unlike the
// Telegram bot's own path, which bypasses permissions because it wasn't
// built with an per-person identity like this one.
async function requireTaskPermission(projectId: string | null, actingProfileId?: string) {
  if (actingProfileId) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, permissions")
      .eq("id", actingProfileId)
      .single()
    if (!profile) throw new Error("Not authenticated")
    if (!can(profile, "manage_tasks")) throw new Error("Permission denied")
    if (projectId) {
      const { data: project } = await admin.from("projects").select("id").eq("id", projectId).single()
      if (!project) throw new Error("Project not found or access denied")
    }
    return { id: profile.id }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions")
    .eq("id", user.id)
    .single()

  if (!can(profile, "manage_tasks")) throw new Error("Permission denied")

  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single()

    if (!project) throw new Error("Project not found or access denied")
  }

  return user
}

function revalidateTaskPaths(projectId: string | null) {
  if (projectId) revalidatePath(`/projects/${projectId}`)
  revalidatePath("/tasks")
}

export async function getTasks(projectId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from("tasks")
    .select("*, project:projects(id, name, status), assignee:profiles(id, full_name, avatar_url), phase:project_phases(id, name, phase_order), checklist_items:task_checklist_items(id, text, is_blocking, is_checked, item_order)")
    .order("created_at", { ascending: false })

  if (projectId) {
    query = query.eq("project_id", projectId)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

// Lightweight count for the sidebar notification badge — mirrors the
// "my pending tasks" logic on /tasks (excludes Done and tasks whose project
// is no longer Active) without pulling every task's joins.
export async function getMyPendingTaskCount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { data, error } = await supabase
    .from("tasks")
    .select("id, project:projects(status)")
    .eq("assignee_id", user.id)
    .neq("status", "Done")

  if (error) return 0
  return (data as unknown as { project: { status: string } | null }[]).filter(
    (t) => !t.project || t.project.status === "Active"
  ).length
}

// "" or absent -> null (broadcast to everyone, today's default). A JSON
// array (possibly empty, same as absent) -> that exact list of profile ids.
function parsePingRecipientIds(formData: FormData): string[] | null {
  const raw = (formData.get("ping_recipient_ids_json") as string) || ""
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed.map(String)
  } catch {
    return null
  }
}

export async function createTask(formData: FormData, actingProfileId?: string) {
  const projectId = (formData.get("project_id") as string) || null
  await requireTaskPermission(projectId, actingProfileId)

  const title = formData.get("title") as string
  const assigneeId = (formData.get("assignee_id") as string) || null
  const sopId = (formData.get("sop_id") as string) || null

  const admin = createAdminClient()
  const { data: task, error } = await admin.from("tasks").insert({
    project_id: projectId,
    title,
    description: (formData.get("description") as string) || null,
    status: (formData.get("status") as TaskStatus) ?? "Todo",
    is_pinged: formData.get("is_pinged") === "true",
    ping_recipient_ids: parsePingRecipientIds(formData),
    requires_deliverable: formData.get("requires_deliverable") === "true",
    deliverable_instructions: (formData.get("deliverable_instructions") as string) || null,
    is_personal: formData.get("is_personal") === "true",
    due_date: (formData.get("due_date") as string) || null,
    assignee_id: assigneeId,
    sop_id: sopId,
  } as Record<string, unknown>)
    .select("id")
    .single()

  if (error) throw error

  // Optional checklist, same shape the "Nueva tarea"/task-detail editors
  // already serialize — a plain JSON array of {text, is_blocking}.
  const checklistRaw = (formData.get("checklist_items_json") as string) || "[]"
  const checklistItems = JSON.parse(checklistRaw) as { text: string; is_blocking: boolean }[]
  if (checklistItems.length > 0) {
    await admin.from("task_checklist_items").insert(
      checklistItems.map((item, i) => ({
        task_id: task.id,
        text: item.text,
        is_blocking: item.is_blocking,
        is_checked: false,
        item_order: i,
      }))
    )
  }

  revalidateTaskPaths(projectId)

  if (assigneeId) await notifyTaskAssigned(admin, assigneeId, title, projectId)
}

export async function updateTask(id: string, formData: FormData) {
  const projectId = (formData.get("project_id") as string) || null
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { error } = await admin
    .from("tasks")
    .update({
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      status: formData.get("status") as TaskStatus,
      is_pinged: formData.get("is_pinged") === "true",
      ping_recipient_ids: parsePingRecipientIds(formData),
      requires_deliverable: formData.get("requires_deliverable") === "true",
      is_personal: formData.get("is_personal") === "true",
      due_date: (formData.get("due_date") as string) || null,
      assignee_id: (formData.get("assignee_id") as string) || null,
    } as Record<string, unknown>)
    .eq("id", id)

  if (error) throw error
  revalidateTaskPaths(projectId)
}

export async function updateTaskPinged(id: string, isPinged: boolean, projectId: string | null) {
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { error } = await admin
    .from("tasks")
    .update({ is_pinged: isPinged })
    .eq("id", id)

  if (error) throw error
  revalidateTaskPaths(projectId)
}

export async function updateTaskAssignee(id: string, assigneeId: string | null, projectId: string | null) {
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("tasks")
    .update({ assignee_id: assigneeId })
    .eq("id", id)
    .select("title")
    .single()

  if (error) throw error
  revalidateTaskPaths(projectId)

  if (assigneeId) await notifyTaskAssigned(admin, assigneeId, data.title, projectId)
}

// lib/notifications/README.md — task_assigned event. Kept local to this
// file (not called from the general-purpose updateTask edit form) so
// editing an existing task doesn't re-notify the assignee on every save.
async function notifyTaskAssigned(
  admin: ReturnType<typeof createAdminClient>,
  assigneeId: string,
  taskTitle: string,
  projectId: string | null,
) {
  let projectName: string | undefined
  if (projectId) {
    const { data: project } = await admin.from("projects").select("name").eq("id", projectId).single()
    projectName = project?.name
  }
  await notify(assigneeId, "task_assigned", { taskTitle, projectName })
}

async function notifyPingedTaskCompleted(
  admin: ReturnType<typeof createAdminClient>,
  completedByUserId: string,
  projectId: string,
  taskTitle: string,
  pingRecipientIds: string[] | null,
) {
  const targeted = !!pingRecipientIds && pingRecipientIds.length > 0

  const [{ data: project }, { data: completedBy }, { data: members }] = await Promise.all([
    admin.from("projects").select("name").eq("id", projectId).single(),
    admin.from("profiles").select("full_name").eq("id", completedByUserId).single(),
    targeted
      ? Promise.resolve({ data: pingRecipientIds!.map((id) => ({ profile_id: id })) })
      : admin.from("project_members").select("profile_id").eq("project_id", projectId),
  ])
  if (!project || !members || members.length === 0) return

  const projectName = project.name
  const completedByName = completedBy?.full_name ?? "Alguien"

  // Always include whoever completed it, even if targeting narrowed the
  // recipient list down to other people — they get the "self" variant
  // instead of the broadcast/targeted one either way.
  const recipientIds = new Set(members.map((m) => m.profile_id))
  recipientIds.add(completedByUserId)

  await Promise.all(
    Array.from(recipientIds).map((profileId) => {
      if (profileId === completedByUserId) {
        return notify(profileId, "task_pinged_completed_self", { taskTitle, projectName })
      }
      return notify(profileId, targeted ? "task_pinged_completed_targeted" : "task_pinged_completed", {
        taskTitle, projectName, completedByName,
      })
    })
  )
}

// Shared "this task just became Done" finalization — status update, phase
// sync, and the Ping notification. There are THREE independent paths that
// can complete a task (explicit status change below, checklist
// auto-complete in syncTaskStatusFromChecklist, and the Telegram
// "tarea completada" voice command in lib/telegram-bot/handlers/tareas.ts)
// — all three route through this so Ping fires no matter which one did
// it. wasAlreadyDone guards against re-notifying when nothing actually
// changed (e.g. the checklist recomputes to Done again after being Done
// already, or the same status gets resubmitted).
async function finalizeTaskDone(
  admin: ReturnType<typeof createAdminClient>,
  taskId: string,
  completedByUserId: string,
  wasAlreadyDone: boolean,
) {
  const { data, error } = await admin
    .from("tasks")
    .update({ status: "Done" })
    .eq("id", taskId)
    .select("phase_id, title, is_pinged, project_id, ping_recipient_ids")
    .single()
  if (error) throw error

  if (data.phase_id) {
    await syncPhaseStatusFromTasks(admin, data.phase_id)
  }

  // "Ping" — replaces the old decorative "Urgente" flag: a task marked
  // pinged that gets completed notifies the whole project team, or just
  // specific people if it was targeted (including whoever just completed
  // it either way, as an explicit confirmation), instead of sitting as a
  // flag nobody actually acted on.
  if (!wasAlreadyDone && data.is_pinged && data.project_id) {
    await notifyPingedTaskCompleted(admin, completedByUserId, data.project_id, data.title, data.ping_recipient_ids)
  }
}

export async function updateTaskStatus(id: string, status: TaskStatus, projectId: string | null, actingProfileId?: string) {
  const user = await requireTaskPermission(projectId, actingProfileId)

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

    const { data: before } = await admin.from("tasks").select("status").eq("id", id).single()
    await finalizeTaskDone(admin, id, user.id, before?.status === "Done")
  } else {
    const { data, error } = await admin
      .from("tasks")
      .update({ status })
      .eq("id", id)
      .select("phase_id")
      .single()
    if (error) throw error
    if (data.phase_id) await syncPhaseStatusFromTasks(admin, data.phase_id)
  }

  revalidateTaskPaths(projectId)
}

// Used by the Telegram "tarea completada" voice command
// (lib/telegram-bot/handlers/tareas.ts) — no dashboard session there, so
// requireTaskPermission's cookie-based auth doesn't apply; the bot already
// resolved which profile is completing it from the chat_id before calling
// this.
export async function markTaskDoneFromBot(taskId: string, completedByProfileId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: before } = await admin.from("tasks").select("status, project_id").eq("id", taskId).single()
  await finalizeTaskDone(admin, taskId, completedByProfileId, before?.status === "Done")
  if (before?.project_id) revalidatePath(`/projects/${before.project_id}`)
  revalidatePath("/tasks")
}

export async function deleteTask(id: string, projectId: string | null) {
  await requireTaskPermission(projectId)

  const admin = createAdminClient()
  const { data: task } = await admin.from("tasks").select("phase_id").eq("id", id).single()

  const { error } = await admin.from("tasks").delete().eq("id", id)
  if (error) throw error

  if (task?.phase_id) {
    await syncPhaseStatusFromTasks(admin, task.phase_id)
  }

  revalidateTaskPaths(projectId)
}

// Keep task status in sync with checklist completion: fully checked -> Done,
// some checked -> In Progress, none checked -> Todo. No-op for tasks without a checklist.
//
// This is a SECOND path to "Done" besides the explicit status change in
// updateTaskStatus — completing the last checklist item auto-completes the
// task here instead. Routes the Done case through the same finalizeTaskDone
// as every other completion path, so Ping fires here too.
async function syncTaskStatusFromChecklist(admin: ReturnType<typeof createAdminClient>, taskId: string, completedByUserId: string) {
  const { data: items } = await admin
    .from("task_checklist_items")
    .select("is_checked")
    .eq("task_id", taskId)
  if (!items || items.length === 0) return

  const checked = items.filter((i) => i.is_checked).length
  const status: TaskStatus = checked === items.length ? "Done" : checked > 0 ? "In Progress" : "Todo"

  if (status === "Done") {
    const { data: before } = await admin.from("tasks").select("status").eq("id", taskId).single()
    await finalizeTaskDone(admin, taskId, completedByUserId, before?.status === "Done")
    return
  }

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
  projectId: string | null
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
  revalidateTaskPaths(projectId)
  return data as TaskChecklistItem
}

export async function toggleChecklistItem(
  itemId: string,
  isChecked: boolean,
  projectId: string | null
) {
  const user = await requireTaskPermission(projectId)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("task_checklist_items")
    .update({ is_checked: isChecked })
    .eq("id", itemId)
    .select("task_id")
    .single()
  if (error) throw error

  await syncTaskStatusFromChecklist(admin, data.task_id, user.id)

  revalidateTaskPaths(projectId)
}

export async function updateChecklistItem(
  itemId: string,
  fields: { text?: string; is_blocking?: boolean },
  projectId: string | null
) {
  await requireTaskPermission(projectId)
  const admin = createAdminClient()
  const { error } = await admin
    .from("task_checklist_items")
    .update(fields)
    .eq("id", itemId)
  if (error) throw error
  revalidateTaskPaths(projectId)
}

export async function deleteChecklistItem(itemId: string, projectId: string | null) {
  await requireTaskPermission(projectId)
  const admin = createAdminClient()
  const { error } = await admin
    .from("task_checklist_items")
    .delete()
    .eq("id", itemId)
  if (error) throw error
  revalidateTaskPaths(projectId)
}

export async function reorderChecklistItems(
  orderedIds: string[],
  projectId: string | null
) {
  await requireTaskPermission(projectId)
  const admin = createAdminClient()
  await Promise.all(
    orderedIds.map((id, index) =>
      admin.from("task_checklist_items").update({ item_order: index }).eq("id", id)
    )
  )
  revalidateTaskPaths(projectId)
}
