"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ProjectStatus, PhaseStatus, CycleDeliverableStatus, CampaignStatus } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"

// Helper: copy task set tasks to a project for each phase that has a default_task_set_id.
// Resolves default_position_id → project member with that position (snapshot at creation time).
async function copyTaskSetsToProject(
  supabase: SupabaseClient,
  templatePhases: Array<{ default_task_set_id: string | null }>,
  projectId: string,
  phaseIdByTaskSetId: Record<string, string> = {}
) {
  try {
    const taskSetIds = templatePhases
      .map((p) => p.default_task_set_id)
      .filter((id): id is string => !!id)

    if (taskSetIds.length === 0) return

    const [taskSetsRes, membersRes] = await Promise.all([
      supabase
        .from("task_sets")
        .select("id, tasks:task_set_tasks(*, checklist_items:task_set_checklist_items(id, text, is_blocking, item_order))")
        .in("id", taskSetIds),
      supabase
        .from("project_members")
        .select("profile_id, profile:profiles(position_id)")
        .eq("project_id", projectId),
    ])

    if (!taskSetsRes.data || taskSetsRes.data.length === 0) return

    // Build position_id → [profile_ids] map from project members
    const positionToMembers = new Map<string, string[]>()
    for (const m of membersRes.data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const posId = (m.profile as any)?.position_id as string | null
      if (posId) {
        const list = positionToMembers.get(posId) ?? []
        list.push(m.profile_id)
        positionToMembers.set(posId, list)
      }
    }

    const resolveAssignment = (positionId: string | null): {
      assignee_id: string | null
      position_id: string | null
      assignment_flag: "no_match" | "multi" | null
    } => {
      if (!positionId) return { assignee_id: null, position_id: null, assignment_flag: null }
      const matches = positionToMembers.get(positionId) ?? []
      if (matches.length === 1) return { assignee_id: matches[0], position_id: positionId, assignment_flag: null }
      if (matches.length === 0) return { assignee_id: null, position_id: positionId, assignment_flag: "no_match" }
      return { assignee_id: null, position_id: positionId, assignment_flag: "multi" }
    }

    const tasksToInsert = taskSetsRes.data.flatMap((ts) =>
      ((ts.tasks ?? []) as Array<{
        id: string; title: string; description: string | null; priority: string
        task_order: number; is_urgent: boolean; requires_deliverable: boolean; deliverable_instructions: string | null
        default_position_id: string | null
        checklist_items: Array<{ id: string; text: string; is_blocking: boolean; item_order: number }> | null
      }>)
        .sort((a, b) => a.task_order - b.task_order)
        .map((t, j) => ({
          project_id: projectId,
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: "Todo",
          is_urgent: t.is_urgent ?? false,
          requires_deliverable: t.requires_deliverable ?? false,
          deliverable_instructions: t.deliverable_instructions ?? null,
          task_order: j,
          phase_id: phaseIdByTaskSetId[ts.id] ?? null,
          task_set_task_id: t.id,
          sop_id: null,
          ...resolveAssignment(t.default_position_id ?? null),
          _checklist_items: t.checklist_items ?? [],
        }))
    )

    if (tasksToInsert.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: insertedTasks } = await supabase
        .from("tasks")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(tasksToInsert.map(({ _checklist_items: _c, ...rest }) => rest) as any[])
        .select("id, task_set_task_id")

      if (insertedTasks && insertedTasks.length > 0) {
        const templateMap = new Map(
          tasksToInsert.map((t) => [t.task_set_task_id, t._checklist_items])
        )
        const checklistToInsert = insertedTasks.flatMap((task) => {
          const items = templateMap.get(task.task_set_task_id) ?? []
          return items.map((item) => ({
            task_id: task.id,
            text: item.text,
            is_blocking: item.is_blocking,
            is_checked: false,
            item_order: item.item_order,
          }))
        })
        if (checklistToInsert.length > 0) {
          await supabase.from("task_checklist_items").insert(checklistToInsert)
        }
      }
    }
  } catch { /* task_sets table may not exist in older deployments */ }
}

// ============================================================
// READ
// ============================================================

export async function getProjects(includeArchived = false) {
  const supabase = await createClient()
  const now = new Date().toISOString().split("T")[0]

  // Try full query first; fall back to minimal if any join table is missing
  let rawData: Record<string, unknown>[] | null = null

  let fullQuery = supabase
    .from("projects")
    .select(`
      *,
      customer:customers(id, name, company),
      project_type:project_types(id, name, color, icon),
      members:project_members(profile:profiles(id, full_name, avatar_url)),
      tasks(id, title, status, due_date, phase_id, task_order),
      phases:project_phases(id, name, status, phase_order),
      income(amount)
    `)
    .order("created_at", { ascending: false })

  if (!includeArchived) {
    fullQuery = fullQuery.neq("status", "Archived")
  }

  const { data: fullData, error: fullError } = await fullQuery

  if (!fullError) {
    rawData = fullData ?? []
  } else {
    // Fallback: minimal query without optional joins
    let minQuery = supabase
      .from("projects")
      .select(`
        *,
        customer:customers(id, name, company),
        members:project_members(profile:profiles(id, full_name, avatar_url)),
        tasks(id, status, due_date)
      `)
      .order("created_at", { ascending: false })
    if (!includeArchived) {
      minQuery = minQuery.neq("status", "Archived")
    }
    const { data: minimal, error: minError } = await minQuery
    if (minError) throw minError
    rawData = (minimal ?? []).map((p) => ({ ...p, project_type: null, phases: [] }))
  }

  // Fetch latest activity dates from logs, tasks, and phases (each wrapped in try/catch)
  let logMap: Record<string, string> = {}
  try {
    const { data: logs } = await supabase
      .from("project_log_entries")
      .select("project_id, created_at")
      .order("created_at", { ascending: false })
    if (logs) {
      for (const l of logs) {
        if (!logMap[l.project_id as string]) logMap[l.project_id as string] = l.created_at as string
      }
    }
  } catch { /* table may not exist yet */ }

  let taskActivityMap: Record<string, string> = {}
  try {
    const { data: taskDates } = await supabase
      .from("tasks")
      .select("project_id, updated_at")
      .order("updated_at", { ascending: false })
    if (taskDates) {
      for (const t of taskDates) {
        const pid = t.project_id as string
        const d = t.updated_at as string
        if (d && (!taskActivityMap[pid] || d > taskActivityMap[pid])) taskActivityMap[pid] = d
      }
    }
  } catch { /* column may not exist */ }

  let phaseActivityMap: Record<string, string> = {}
  try {
    const { data: phaseDates } = await supabase
      .from("project_phases")
      .select("project_id, updated_at")
      .order("updated_at", { ascending: false })
    if (phaseDates) {
      for (const ph of phaseDates) {
        const pid = ph.project_id as string
        const d = ph.updated_at as string
        if (d && (!phaseActivityMap[pid] || d > phaseActivityMap[pid])) phaseActivityMap[pid] = d
      }
    }
  } catch { /* column may not exist */ }

  return rawData.map((p) => {
    const tasks = (p.tasks ?? []) as Array<{ status: string; due_date: string | null }>
    const phases = (p.phases ?? []) as Array<{ status: string }>

    const hasOverdueTasks = tasks.some(
      (t) => t.status !== "Done" && t.due_date && (t.due_date as string) < now
    )
    const hasBlockedPhase = phases.some((ph) => ph.status === "blocked")

    const pid = p.id as string
    const activityDates: string[] = [p.created_at as string]
    if (logMap[pid]) activityDates.push(logMap[pid])
    if (taskActivityMap[pid]) activityDates.push(taskActivityMap[pid])
    if (phaseActivityMap[pid]) activityDates.push(phaseActivityMap[pid])
    const lastActivity = activityDates.reduce((a, b) => (a > b ? a : b))
    const inactiveForDays = Math.floor(
      (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      ...p,
      members: ((p.members ?? []) as Array<{ profile: { id: string; full_name: string; avatar_url: string | null } | null }>)
        .map((m) => m.profile)
        .filter(Boolean),
      attention: {
        hasOverdueTasks,
        hasBlockedPhase,
        hasPendingCycleReport: false,
        inactiveForDays,
      },
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any[]
}

export async function getProject(id: string) {
  const supabase = await createClient()

  // Try full query; fall back without optional join tables
  let data: Record<string, unknown>

  const { data: fullData, error: fullError } = await supabase
    .from("projects")
    .select(`
      *,
      customer:customers(id, name, company, email, phone),
      project_type:project_types(id, name, description, default_phase_set_id, color, icon),
      tasks(*, assignee:profiles(id, full_name, avatar_url, position), phase:project_phases(id, name, phase_order), sop:sops(id, title, doc_url, video_url), task_set_task:task_set_tasks(sop_id, sop:sops(id, title, doc_url, video_url)), checklist_items:task_checklist_items(id, text, is_blocking, is_checked, item_order)),
      members:project_members(profile:profiles(id, full_name, avatar_url, position, role)),
      phases:project_phases(*)
    `)
    .eq("id", id)
    .single()

  if (fullError) {
    console.error("[getProject] full query error:", fullError.message, fullError.details, fullError.hint)
  }

  if (!fullError) {
    data = fullData as Record<string, unknown>
  } else {
    // Fallback without project_type and project_phases joins
    const { data: minData, error: minError } = await supabase
      .from("projects")
      .select(`
        *,
        customer:customers(id, name, company, email, phone),
        tasks(*, assignee:profiles(id, full_name, avatar_url, position), phase:project_phases(id, name, phase_order)),
        members:project_members(profile:profiles(id, full_name, avatar_url, position, role))
      `)
      .eq("id", id)
      .single()
    if (minError) {
      console.error("[getProject] fallback query error:", minError.message, minError.details, minError.hint)
      throw minError
    }
    data = { ...minData, project_type: null, phases: [] } as Record<string, unknown>
  }

  // Optional hub tables — fetch separately so a missing table doesn't crash the page
  let paidMediaContext = null
  let webProjectContext = null

  try {
    const { data: pmc } = await supabase
      .from("paid_media_context")
      .select("*")
      .eq("project_id", id)
      .maybeSingle()
    paidMediaContext = pmc
  } catch { /* table may not exist */ }

  try {
    const { data: wpc } = await supabase
      .from("web_project_context")
      .select("*")
      .eq("project_id", id)
      .maybeSingle()
    webProjectContext = wpc
  } catch { /* table may not exist */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    ...data,
    paid_media_context: paidMediaContext ? [paidMediaContext] : [],
    web_project_context: webProjectContext ? [webProjectContext] : [],
    phases: ((data.phases ?? []) as Array<{ phase_order: number }>)
      .sort((a, b) => a.phase_order - b.phase_order),
    tasks: ((data.tasks ?? []) as Array<{ task_order: number }>)
      .sort((a, b) => (a.task_order ?? 0) - (b.task_order ?? 0)),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

// ============================================================
// PROJECT CRUD
// ============================================================

export async function createProject(
  formData: FormData,
  selectedPhaseSetPhaseIds?: string[]
) {
  // Get authenticated user before switching to admin client
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  const supabase = createAdminClient()
  const projectTypeId = formData.get("project_type_id") as string

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name: formData.get("name") as string,
      customer_id: (formData.get("customer_id") as string) || null,
      project_type_id: projectTypeId && projectTypeId !== "none" ? projectTypeId : null,
      status: "Active" as ProjectStatus,
      project_value: formData.get("project_value") ? Number(formData.get("project_value")) : null,
      monthly_fee: formData.get("monthly_fee") ? Number(formData.get("monthly_fee")) : null,
      start_date: (formData.get("start_date") as string) || null,
      end_date: (formData.get("end_date") as string) || null,
      description: (formData.get("description") as string) || null,
      brand_brain_id: (formData.get("brand_brain_id") as string) || null,
    })
    .select()
    .single()

  if (error) throw error

  // Copy selected phase set phases to project_phases (and their task sets to tasks)
  if (selectedPhaseSetPhaseIds && selectedPhaseSetPhaseIds.length > 0) {
    const { data: templatePhases } = await supabase
      .from("phase_set_phases")
      .select("*")
      .in("id", selectedPhaseSetPhaseIds)
      .order("phase_order")

    if (templatePhases && templatePhases.length > 0) {
      const projectPhases = templatePhases.map((tp, i) => ({
        project_id: project.id,
        name: tp.name,
        description: tp.description,
        phase_order: i,
      }))
      const { data: createdPhases } = await supabase.from("project_phases").insert(projectPhases).select()
      const phaseIdByTaskSetId: Record<string, string> = {}
      templatePhases.forEach((tp, i) => {
        if (tp.default_task_set_id && createdPhases?.[i]) {
          phaseIdByTaskSetId[tp.default_task_set_id] = createdPhases[i].id
        }
      })
      await copyTaskSetsToProject(supabase, templatePhases, project.id, phaseIdByTaskSetId)
    }
  }

  // Auto-add creator as project team member
  if (user) {
    await supabase
      .from("project_members")
      .upsert({ project_id: project.id, profile_id: user.id }, { onConflict: "project_id,profile_id", ignoreDuplicates: true })
  }

  revalidatePath("/projects")
  return project
}

export async function importPhasesToProject(
  projectId: string,
  phaseSetPhaseIds: string[],
  afterPhaseId: string | null   // null = prepend, "end" = append, else insert after that phase
) {
  const supabase = createAdminClient()

  // Fetch selected template phases
  const { data: templatePhases, error } = await supabase
    .from("phase_set_phases")
    .select("*")
    .in("id", phaseSetPhaseIds)
    .order("phase_order")
  if (error) throw error
  if (!templatePhases || templatePhases.length === 0) throw new Error("No se encontraron las fases seleccionadas")

  // Fetch current project phases to determine insertion point & reorder
  const { data: existing } = await supabase
    .from("project_phases")
    .select("id, phase_order")
    .eq("project_id", projectId)
    .order("phase_order")
  const existingPhases = existing ?? []

  // Determine insertion index in the existing list
  let insertAfterIndex = existingPhases.length - 1 // default: end
  if (afterPhaseId === null) {
    insertAfterIndex = -1 // prepend
  } else if (afterPhaseId !== "end") {
    const idx = existingPhases.findIndex((p) => p.id === afterPhaseId)
    if (idx !== -1) insertAfterIndex = idx
  }

  // Build new ordered list of IDs: existing ids with new ones spliced in
  const existingIds = existingPhases.map((p) => p.id)
  const newPhaseInserts = templatePhases.map((tp) => ({
    project_id: projectId,
    name: tp.name,
    description: tp.description,
    phase_order: 0, // will be set after
    default_task_set_id: tp.default_task_set_id, // temp for task copy
  }))

  // Insert new project_phases
  const { data: createdPhases, error: insertErr } = await supabase
    .from("project_phases")
    .insert(newPhaseInserts.map(({ default_task_set_id: _dt, ...rest }) => rest))
    .select()
  if (insertErr) throw insertErr

  // Splice new phase IDs into the ordered list and reassign phase_order
  const newIds = (createdPhases ?? []).map((p: { id: string }) => p.id)
  const merged = [
    ...existingIds.slice(0, insertAfterIndex + 1),
    ...newIds,
    ...existingIds.slice(insertAfterIndex + 1),
  ]
  await Promise.all(
    merged.map((id, i) => supabase.from("project_phases").update({ phase_order: i }).eq("id", id))
  )

  // Copy task sets for inserted phases
  const phaseIdByTaskSetId: Record<string, string> = {}
  templatePhases.forEach((tp, i) => {
    const created = createdPhases?.[i]
    if (tp.default_task_set_id && created) {
      phaseIdByTaskSetId[tp.default_task_set_id] = created.id
    }
  })
  await copyTaskSetsToProject(supabase, templatePhases, projectId, phaseIdByTaskSetId)

  revalidatePath(`/projects/${projectId}`)
}

export async function applyPhaseSetToProject(projectId: string, phaseSetId: string) {
  const supabase = createAdminClient()

  // Get phases from the phase set
  const { data: templatePhases, error } = await supabase
    .from("phase_set_phases")
    .select("*")
    .eq("phase_set_id", phaseSetId)
    .order("phase_order")

  if (error) throw error
  if (!templatePhases || templatePhases.length === 0) throw new Error("El phase set no tiene fases")

  // Delete existing tasks and phases (clean slate before re-applying)
  await supabase.from("tasks").delete().eq("project_id", projectId)
  await supabase.from("project_phases").delete().eq("project_id", projectId)

  // Insert new phases
  const projectPhases = templatePhases.map((tp, i) => ({
    project_id: projectId,
    name: tp.name,
    description: tp.description,
    phase_order: i,
  }))
  const { data: createdPhases, error: insertError } = await supabase.from("project_phases").insert(projectPhases).select()
  if (insertError) throw insertError

  // Build task_set_id → project_phase.id mapping so tasks get linked to their phase
  const phaseIdByTaskSetId: Record<string, string> = {}
  templatePhases.forEach((tp, i) => {
    if (tp.default_task_set_id && createdPhases?.[i]) {
      phaseIdByTaskSetId[tp.default_task_set_id] = createdPhases[i].id
    }
  })

  // Copy tasks from each phase's default task set
  await copyTaskSetsToProject(supabase, templatePhases, projectId, phaseIdByTaskSetId)

  revalidatePath(`/projects/${projectId}`)
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = createAdminClient()
  const projectTypeId = formData.get("project_type_id") as string

  const statusValue = formData.get("status") as string | null

  const { error } = await supabase
    .from("projects")
    .update({
      name: formData.get("name") as string,
      customer_id: (formData.get("customer_id") as string) || null,
      project_type_id: projectTypeId && projectTypeId !== "none" ? projectTypeId : null,
      ...(statusValue ? { status: statusValue as ProjectStatus } : {}),
      project_value: formData.get("project_value") ? Number(formData.get("project_value")) : null,
      monthly_fee: formData.get("monthly_fee") ? Number(formData.get("monthly_fee")) : null,
      start_date: (formData.get("start_date") as string) || null,
      end_date: (formData.get("end_date") as string) || null,
      description: (formData.get("description") as string) || null,
      brand_brain_id: (formData.get("brand_brain_id") as string) || null,
    })
    .eq("id", id)

  if (error) throw error
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
}

export async function deleteProject(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from("projects").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/projects")
}

export async function archiveProject(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("projects")
    .update({ status: "Archived" })
    .eq("id", id)
  if (error) throw error
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
}

export async function unarchiveProject(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("projects")
    .update({ status: "Active" })
    .eq("id", id)
  if (error) throw error
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
}

export async function completeProject(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("projects")
    .update({ status: "Completed" })
    .eq("id", id)
  if (error) throw error
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
}

export async function reactivateProject(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("projects")
    .update({ status: "Active" })
    .eq("id", id)
  if (error) throw error
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
}

// ============================================================
// TEAM
// ============================================================

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

// ============================================================
// PROJECT PHASES
// ============================================================

export async function updateProjectPhaseStatus(
  phaseId: string,
  status: PhaseStatus,
  projectId: string
) {
  const supabase = await createClient()
  const updates: Record<string, unknown> = { status }
  if (status === "in_progress") updates.started_at = new Date().toISOString()
  if (status === "completed") updates.completed_at = new Date().toISOString()

  const { error } = await supabase
    .from("project_phases")
    .update(updates)
    .eq("id", phaseId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteProjectPhase(phaseId: string, projectId: string) {
  const supabase = await createClient()
  // Tasks in this phase are deleted via ON DELETE CASCADE on phase_id,
  // or we can reassign them. Since project_phases FK on tasks is nullable
  // let's delete the tasks explicitly first, then the phase.
  await supabase.from("tasks").delete().eq("phase_id", phaseId)
  const { error } = await supabase.from("project_phases").delete().eq("id", phaseId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function updateProjectPhaseNotes(phaseId: string, notes: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_phases")
    .update({ notes })
    .eq("id", phaseId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// PAID MEDIA CONTEXT
// ============================================================

export async function upsertPaidMediaContext(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const platforms = formData.getAll("platforms") as string[]
  const mainObjective = formData.get("main_objective") as string

  const { error } = await supabase.from("paid_media_context").upsert(
    {
      project_id: projectId,
      platforms,
      monthly_ad_budget: formData.get("monthly_ad_budget") ? Number(formData.get("monthly_ad_budget")) : null,
      main_objective: mainObjective && mainObjective !== "none" ? mainObjective : null,
      target_roas: formData.get("target_roas") ? Number(formData.get("target_roas")) : null,
      target_cpa: formData.get("target_cpa") ? Number(formData.get("target_cpa")) : null,
      target_cpl: formData.get("target_cpl") ? Number(formData.get("target_cpl")) : null,
      target_leads_per_month: formData.get("target_leads_per_month") ? Number(formData.get("target_leads_per_month")) : null,
      account_notes: (formData.get("account_notes") as string) || null,
    },
    { onConflict: "project_id" }
  )
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// PAID MEDIA CYCLES
// ============================================================

export async function getProjectCycles(projectId: string) {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from("paid_media_cycles")
      .select("*")
      .eq("project_id", projectId)
      .order("cycle_month", { ascending: false })
    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

export async function openNewCycle(projectId: string, cycleMonth: string) {
  const supabase = await createClient()

  // Normalize cycleMonth to "YYYY-MM-01" regardless of what the client sent
  const match = cycleMonth.match(/^(\d{4})-(\d{1,2})/)
  if (!match) throw new Error(`Formato de mes inválido: "${cycleMonth}"`)
  const dateStr = `${match[1]}-${match[2].padStart(2, "0")}-01`

  // Close current active cycle
  await supabase
    .from("paid_media_cycles")
    .update({ is_active: false })
    .eq("project_id", projectId)
    .eq("is_active", true)

  // Open new cycle
  const { error } = await supabase.from("paid_media_cycles").insert({
    project_id: projectId,
    cycle_month: dateStr,
    is_active: true,
  })
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function updateCycle(cycleId: string, projectId: string, formData: FormData) {
  const supabase = await createClient()
  const campaignStatus = formData.get("campaign_status") as string

  const { error } = await supabase
    .from("paid_media_cycles")
    .update({
      campaign_status: campaignStatus && campaignStatus !== "none" ? (campaignStatus as CampaignStatus) : null,
      report_cutoff_date: (formData.get("report_cutoff_date") as string) || null,
      report_delivery_date: (formData.get("report_delivery_date") as string) || null,
      report_status: (formData.get("report_status") as CycleDeliverableStatus) ?? "pending",
      creative_status: (formData.get("creative_status") as CycleDeliverableStatus) ?? "pending",
      roas_real: formData.get("roas_real") ? Number(formData.get("roas_real")) : null,
      cpa_real: formData.get("cpa_real") ? Number(formData.get("cpa_real")) : null,
      cpl_real: formData.get("cpl_real") ? Number(formData.get("cpl_real")) : null,
      real_spend: formData.get("real_spend") ? Number(formData.get("real_spend")) : null,
      real_results: formData.get("real_results") ? Number(formData.get("real_results")) : null,
    })
    .eq("id", cycleId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function closeCycle(cycleId: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("paid_media_cycles")
    .update({ is_active: false })
    .eq("id", cycleId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// WEB PROJECT CONTEXT
// ============================================================

export async function upsertWebContext(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("web_project_context").upsert(
    {
      project_id: projectId,
      platform: (formData.get("platform") as string) || null,
      staging_url: (formData.get("staging_url") as string) || null,
      production_url: (formData.get("production_url") as string) || null,
      technical_notes: (formData.get("technical_notes") as string) || null,
      revisions_included: formData.get("revisions_included") ? Number(formData.get("revisions_included")) : 0,
      revisions_used: formData.get("revisions_used") ? Number(formData.get("revisions_used")) : 0,
    },
    { onConflict: "project_id" }
  )
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function incrementRevision(projectId: string) {
  const supabase = await createClient()
  const { data: ctx } = await supabase
    .from("web_project_context")
    .select("revisions_used")
    .eq("project_id", projectId)
    .single()

  const { error } = await supabase
    .from("web_project_context")
    .update({ revisions_used: (ctx?.revisions_used ?? 0) + 1 })
    .eq("project_id", projectId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// PROJECT LOG
// ============================================================

// Returns all members of a project with their full profile data.
// Uses the admin client for the profile join so RLS on profiles
// doesn't hide teammates from employees.
export async function getProjectMembers(projectId: string) {
  const supabase = await createClient()

  // Verify the caller has access to this project via RLS
  const { data: check } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single()
  if (!check) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_members")
    .select("profile:profiles(id, full_name, avatar_url, position, role)")
    .eq("project_id", projectId)

  if (error) return []
  return ((data ?? []) as unknown as { profile: Record<string, unknown> | null }[])
    .map((m) => m.profile)
    .filter((p): p is Record<string, unknown> => p !== null && p?.full_name != null)
}

export async function getProjectLog(projectId: string) {
  const supabase = await createClient()

  // Verify access via RLS first
  const { data: check } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single()
  if (!check) return []

  // Use admin client so author profiles are visible regardless of profile RLS
  const admin = createAdminClient()
  try {
    const { data, error } = await admin
      .from("project_log_entries")
      .select("*, author:profiles(id, full_name, avatar_url)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

export async function addLogEntry(projectId: string, body: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("project_log_entries")
    .insert({ project_id: projectId, author_id: user.id, body })

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteLogEntry(entryId: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_log_entries")
    .delete()
    .eq("id", entryId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}
