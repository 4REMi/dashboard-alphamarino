"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type {
  LabPhase, LabPhaseTask, LabPhaseTaskChecklistItem, LabReviewAction,
  LabProposedTask, LabProposedTaskChecklistItem, LabProposedTaskReview,
  LabProposedChecklistAddition, LabProposedChecklistItem, LabProposedChecklistAdditionReview,
  CanonicalPhaseSet,
} from "@/lib/types"

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

function revalidate() {
  revalidatePath("/my-lab")
}

// ── Queries ───────────────────────────────────────────────────────────────────

const TASK_SELECT = `
  *,
  sop:sops(id, title),
  default_position:positions(id, name),
  checklist_items:lab_phase_task_checklist_items(id, text, is_blocking, item_order, created_at)
`

const PHASE_SELECT = `
  *,
  tasks:lab_phase_tasks(${TASK_SELECT}),
  reviews:lab_phase_reviews(*, reviewer:profiles(id, full_name, avatar_url))
`

function normalizeTasks(tasks: LabPhaseTask[]): LabPhaseTask[] {
  return tasks
    .sort((a, b) => a.task_order - b.task_order)
    .map((t) => ({
      ...t,
      checklist_items: [...(t.checklist_items ?? [])].sort((a, b) => a.item_order - b.item_order),
    }))
}

function normalizePhase(p: Record<string, unknown>): LabPhase {
  const tasks = normalizeTasks((p.tasks ?? []) as LabPhaseTask[])
  const reviews = p.reviews as LabPhase["reviews"]
  return { ...p, tasks, reviews } as LabPhase
}

export async function getMyPhases(): Promise<LabPhase[]> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase
    .from("lab_phases")
    .select(PHASE_SELECT)
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false })
  if (error) return []
  return (data ?? []).map(normalizePhase)
}

export async function getAllSubmittedPhases(): Promise<LabPhase[]> {
  const { supabase } = await assertAuth()
  const { data, error } = await supabase
    .from("lab_phases")
    .select(`${PHASE_SELECT}, author:profiles(id, full_name, avatar_url)`)
    .in("status", ["submitted", "approved", "rejected"])
    .order("updated_at", { ascending: false })
  if (error) return []
  return (data ?? []).map(normalizePhase)
}

// ── Phase CRUD ────────────────────────────────────────────────────────────────

export async function createPhase(formData: FormData): Promise<LabPhase> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase.from("lab_phases").insert({
    author_id:   user.id,
    name:        formData.get("name") as string,
    description: (formData.get("description") as string) || null,
  }).select().single()
  if (error) throw error
  revalidate()
  return { ...data, tasks: [], reviews: [] } as LabPhase
}

export async function updatePhase(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_phases").update({
    name:        formData.get("name") as string,
    description: (formData.get("description") as string) || null,
  }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deletePhase(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_phases").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

export async function submitPhase(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_phases")
    .update({ status: "submitted" }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function reorderPhaseTasks(orderedIds: string[]): Promise<void> {
  const { supabase } = await assertAuth()
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from("lab_phase_tasks").update({ task_order: i }).eq("id", id)
  ))
  revalidate()
}

export async function retractPhase(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_phases")
    .update({ status: "draft" }).eq("id", id)
  if (error) throw error
  revalidate()
}

// ── Task CRUD ─────────────────────────────────────────────────────────────────

export async function addPhaseTask(phaseId: string, formData: FormData): Promise<LabPhaseTask> {
  const { supabase } = await assertAuth()
  const { data: existing } = await supabase
    .from("lab_phase_tasks").select("task_order")
    .eq("phase_id", phaseId).order("task_order", { ascending: false }).limit(1)
  const nextOrder = existing?.[0] ? existing[0].task_order + 1 : 0
  const sopIdRaw = formData.get("sop_id") as string
  const positionIdRaw = formData.get("default_position_id") as string
  const { data, error } = await supabase.from("lab_phase_tasks").insert({
    phase_id:             phaseId,
    title:                formData.get("title") as string,
    description:          (formData.get("description") as string) || null,
    task_order:           nextOrder,
    requires_deliverable: formData.get("requires_deliverable") === "true",
    sop_id:               sopIdRaw || null,
    default_position_id:  positionIdRaw || null,
  }).select(TASK_SELECT).single()
  if (error) throw error
  revalidate()
  return { ...data, checklist_items: [] } as LabPhaseTask
}

export async function updatePhaseTask(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const sopIdRaw = formData.get("sop_id") as string
  const positionIdRaw = formData.get("default_position_id") as string
  const { error } = await supabase.from("lab_phase_tasks").update({
    title:                formData.get("title") as string,
    description:          (formData.get("description") as string) || null,
    requires_deliverable: formData.get("requires_deliverable") === "true",
    sop_id:               sopIdRaw || null,
    default_position_id:  positionIdRaw || null,
  }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deletePhaseTask(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_phase_tasks").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

// ── Checklist items ───────────────────────────────────────────────────────────

export async function addTaskChecklistItem(
  taskId: string,
  text: string,
  isBlocking: boolean
): Promise<LabPhaseTaskChecklistItem> {
  const { supabase } = await assertAuth()
  const { data: existing } = await supabase
    .from("lab_phase_task_checklist_items").select("item_order")
    .eq("task_id", taskId).order("item_order", { ascending: false }).limit(1)
  const nextOrder = existing?.[0] ? existing[0].item_order + 1 : 0
  const { data, error } = await supabase.from("lab_phase_task_checklist_items").insert({
    task_id:    taskId,
    text,
    is_blocking: isBlocking,
    item_order: nextOrder,
  }).select().single()
  if (error) throw error
  revalidate()
  return data as LabPhaseTaskChecklistItem
}

export async function updateTaskChecklistItem(
  id: string,
  text: string,
  isBlocking: boolean
): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_phase_task_checklist_items")
    .update({ text, is_blocking: isBlocking }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deleteTaskChecklistItem(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_phase_task_checklist_items").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

export async function reorderLabTaskChecklistItems(
  orderedIds: string[]
): Promise<void> {
  const { supabase } = await assertAuth()
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("lab_phase_task_checklist_items").update({ item_order: index }).eq("id", id)
    )
  )
  revalidate()
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function reviewPhase(
  phaseId: string,
  action: LabReviewAction,
  comment: string
): Promise<void> {
  const { supabase, user } = await assertAuth()

  await supabase.from("lab_phase_reviews").insert({
    phase_id:    phaseId,
    reviewer_id: user.id,
    action,
    comment:     comment || null,
  })

  if (action === "approve" || action === "reject") {
    await supabase.from("lab_phases")
      .update({ status: action === "approve" ? "approved" : "rejected" })
      .eq("id", phaseId)
  }

  revalidate()
}

// ── Promote ───────────────────────────────────────────────────────────────────

export async function promotePhase(
  phaseId: string,
  targetPhaseSetId: string
): Promise<void> {
  const { supabase } = await assertAuth()

  // Fetch phase + tasks + checklist items
  const { data: phase, error: pErr } = await supabase
    .from("lab_phases")
    .select(`*, tasks:lab_phase_tasks(*, checklist_items:lab_phase_task_checklist_items(*))`)
    .eq("id", phaseId)
    .single()
  if (pErr || !phase) throw new Error("Fase no encontrada")

  const tasks = ((phase.tasks ?? []) as LabPhaseTask[]).sort((a, b) => a.task_order - b.task_order)

  // Append at end of target phase set
  const { data: existing } = await supabase
    .from("phase_set_phases").select("phase_order")
    .eq("phase_set_id", targetPhaseSetId).order("phase_order", { ascending: false }).limit(1)
  const nextOrder = existing?.[0] ? existing[0].phase_order + 1 : 0

  const { data: newPhase, error: phErr } = await supabase
    .from("phase_set_phases")
    .insert({
      phase_set_id: targetPhaseSetId,
      name:         phase.name,
      description:  phase.description,
      phase_order:  nextOrder,
    }).select().single()
  if (phErr || !newPhase) throw new Error("Error al crear la fase en Operations Lab")

  if (tasks.length > 0) {
    const { data: newTS } = await supabase
      .from("task_sets")
      .insert({ name: phase.name })
      .select().single()

    if (newTS) {
      const { data: insertedTasks } = await supabase.from("task_set_tasks").insert(
        tasks.map((t, i) => ({
          task_set_id:          newTS.id,
          title:                t.title,
          description:          t.description,
          task_order:           i,
          is_urgent:            false,
          requires_deliverable: t.requires_deliverable,
          sop_id:               t.sop_id ?? null,
          default_position_id:  t.default_position_id ?? null,
        }))
      ).select("id, title")

      // Transfer checklist items per task
      if (insertedTasks) {
        for (let i = 0; i < tasks.length; i++) {
          const srcTask = tasks[i]
          const dstTask = insertedTasks[i]
          const items = (srcTask.checklist_items ?? []) as LabPhaseTaskChecklistItem[]
          if (items.length > 0 && dstTask) {
            await supabase.from("task_set_checklist_items").insert(
              items.map((item) => ({
                task_set_task_id: dstTask.id,
                text:             item.text,
                is_blocking:      item.is_blocking,
                item_order:       item.item_order,
              }))
            )
          }
        }
      }

      await supabase.from("phase_set_phases")
        .update({ default_task_set_id: newTS.id }).eq("id", newPhase.id)
    }
  }

  revalidatePath("/operations")
  revalidate()
}

// ── Canonical tree ────────────────────────────────────────────────────────────

export async function getCanonicalTree(): Promise<CanonicalPhaseSet[]> {
  const supabase = await createClient()

  // Load phase_sets without the FK join (same pattern as getProjectTypes in config.ts)
  const { data: phaseSets, error: psError } = await supabase
    .from("phase_sets")
    .select("id, name, project_type_id")
    .order("name")
  if (psError || !phaseSets?.length) return []

  // Load project type names separately to avoid FK dependency issues
  const { data: projectTypes } = await supabase
    .from("project_types")
    .select("id, name")
  const ptMap: Record<string, string> = {}
  for (const pt of projectTypes ?? []) ptMap[pt.id] = pt.name

  const { data: phases } = await supabase
    .from("phase_set_phases")
    .select("id, phase_set_id, name, description, phase_order, default_task_set_id")
    .order("phase_order")

  const taskSetIds = [...new Set(
    (phases ?? []).map((p) => p.default_task_set_id).filter(Boolean) as string[]
  )]

  let taskSetMap: Record<string, { id: string; tasks: unknown[] }> = {}
  if (taskSetIds.length > 0) {
    const { data: taskSets } = await supabase
      .from("task_sets")
      .select(`
        id,
        tasks:task_set_tasks(
          id, title, description, task_order, requires_deliverable,
          default_position_id, sop_id,
          sop:sops(id, title),
          default_position:positions(id, name),
          checklist_items:task_set_checklist_items(id, text, is_blocking, item_order)
        )
      `)
      .in("id", taskSetIds)
    if (taskSets) {
      for (const ts of taskSets) {
        taskSetMap[ts.id] = {
          ...ts,
          tasks: [...(ts.tasks ?? [])].sort((a: { task_order: number }, b: { task_order: number }) => a.task_order - b.task_order).map((t: {
            checklist_items?: { item_order: number }[]
          }) => ({
            ...t,
            checklist_items: [...(t.checklist_items ?? [])].sort((a, b) => a.item_order - b.item_order),
          })),
        }
      }
    }
  }

  return phaseSets.map((ps) => {
    const psPhases = (phases ?? [])
      .filter((p) => p.phase_set_id === ps.id)
      .sort((a, b) => a.phase_order - b.phase_order)
      .map((p) => {
        const ts = p.default_task_set_id ? taskSetMap[p.default_task_set_id] : null
        const tasks = ((ts?.tasks ?? []) as {
          id: string; title: string; description: string | null; task_order: number
          requires_deliverable: boolean; default_position_id: string | null; sop_id: string | null
          sop?: { title?: string } | null; default_position?: { name?: string } | null
          checklist_items: { id: string; text: string; is_blocking: boolean; item_order: number }[]
        }[]).map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          task_order: t.task_order,
          requires_deliverable: t.requires_deliverable,
          default_position_id: t.default_position_id,
          default_position_name: t.default_position?.name ?? null,
          sop_id: t.sop_id,
          sop_title: t.sop?.title ?? null,
          checklist_items: t.checklist_items,
        }))
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          phase_order: p.phase_order,
          task_set_id: p.default_task_set_id ?? null,
          tasks,
        }
      })
    return {
      id: ps.id,
      name: ps.name,
      project_type_name: ps.project_type_id ? (ptMap[ps.project_type_id] ?? null) : null,
      phases: psPhases,
    }
  })
}

// ── Proposed tasks ────────────────────────────────────────────────────────────

// Avoids author:profiles() and reviewer:profiles() joins — FK to profiles may
// not exist as a DB constraint; we resolve profiles in a separate query instead.
const PROPOSED_TASK_SELECT = `
  *,
  sop:sops(id, title),
  default_position:positions(id, name),
  anchor_phase:phase_set_phases(id, name),
  checklist_items:lab_proposed_task_checklist_items(id, text, is_blocking, item_order),
  reviews:lab_proposed_task_reviews(id, action, comment, created_at, reviewer_id)
`

type WithProfiles = Record<string, unknown> & {
  author_id?: string
  reviews?: (Record<string, unknown> & { reviewer_id?: string })[]
}

async function attachProfiles(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  rows: WithProfiles[]
): Promise<WithProfiles[]> {
  const ids = new Set<string>()
  for (const r of rows) {
    if (r.author_id) ids.add(r.author_id)
    for (const rev of r.reviews ?? []) { if (rev.reviewer_id) ids.add(rev.reviewer_id) }
  }
  if (!ids.size) return rows
  const { data: profiles } = await supabase
    .from("profiles").select("id, full_name").in("id", [...ids])
  const pm: Record<string, { id: string; full_name: string }> = {}
  for (const p of profiles ?? []) pm[p.id] = p
  return rows.map((r) => ({
    ...r,
    author: r.author_id ? (pm[r.author_id] ?? null) : null,
    reviews: (r.reviews ?? []).map((rev) => ({
      ...rev,
      reviewer: rev.reviewer_id ? (pm[rev.reviewer_id] ?? null) : null,
    })),
  }))
}

export async function getMyProposedTasks(): Promise<LabProposedTask[]> {
  const { supabase, user } = await assertAuth()
  const { data } = await supabase
    .from("lab_proposed_tasks")
    .select(PROPOSED_TASK_SELECT)
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false })
  return (data ?? []) as unknown as LabProposedTask[]
}

export async function getAllSubmittedProposedTasks(): Promise<LabProposedTask[]> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("lab_proposed_tasks")
    .select(PROPOSED_TASK_SELECT)
    .in("status", ["submitted", "approved", "rejected"])
    .order("updated_at", { ascending: false })
  const rows = (data ?? []) as unknown as WithProfiles[]
  return attachProfiles(supabase, rows) as unknown as Promise<LabProposedTask[]>
}

export async function createProposedTask(
  anchorPhaseSetPhaseId: string,
  anchorTaskSetId: string | null,
  formData: FormData
): Promise<LabProposedTask> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase.from("lab_proposed_tasks").insert({
    author_id:                 user.id,
    anchor_phase_set_phase_id: anchorPhaseSetPhaseId,
    anchor_task_set_id:         anchorTaskSetId,
    anchor_task_set_task_id:    (formData.get("anchor_task_set_task_id") as string) || null,
    position_after_task_id:     (formData.get("position_after_task_id") as string) || null,
    title:                      formData.get("title") as string,
    description:                (formData.get("description") as string) || null,
    requires_deliverable:       formData.get("requires_deliverable") === "true",
    sop_id:                     (formData.get("sop_id") as string) || null,
    default_position_id:        (formData.get("default_position_id") as string) || null,
  }).select(PROPOSED_TASK_SELECT).single()
  if (error) throw error
  revalidate()
  return data as unknown as LabProposedTask
}

export async function updateProposedTask(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposed_tasks").update({
    position_after_task_id: (formData.get("position_after_task_id") as string) || null,
    title:                  formData.get("title") as string,
    description:            (formData.get("description") as string) || null,
    requires_deliverable:   formData.get("requires_deliverable") === "true",
    sop_id:                 (formData.get("sop_id") as string) || null,
    default_position_id:    (formData.get("default_position_id") as string) || null,
    updated_at:             new Date().toISOString(),
  }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deleteProposedTask(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposed_tasks").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

export async function submitProposedTask(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposed_tasks")
    .update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function retractProposedTask(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposed_tasks")
    .update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function addProposedTaskChecklistItem(
  proposedTaskId: string, text: string, isBlocking: boolean
): Promise<LabProposedTaskChecklistItem> {
  const { supabase } = await assertAuth()
  const { data: existing } = await supabase
    .from("lab_proposed_task_checklist_items").select("item_order")
    .eq("proposed_task_id", proposedTaskId).order("item_order", { ascending: false }).limit(1)
  const nextOrder = existing?.[0] ? existing[0].item_order + 1 : 0
  const { data, error } = await supabase.from("lab_proposed_task_checklist_items").insert({
    proposed_task_id: proposedTaskId, text, is_blocking: isBlocking, item_order: nextOrder,
  }).select().single()
  if (error) throw error
  revalidate()
  return data as LabProposedTaskChecklistItem
}

export async function reviewProposedTask(
  id: string, action: LabReviewAction, comment: string
): Promise<void> {
  const { supabase, user } = await assertAuth()
  await supabase.from("lab_proposed_task_reviews").insert({
    proposed_task_id: id, reviewer_id: user.id, action, comment: comment || null,
  })
  if (action === "approve" || action === "reject") {
    await supabase.from("lab_proposed_tasks")
      .update({ status: action === "approve" ? "approved" : "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
  }
  revalidate()
}

export async function injectProposedTask(id: string): Promise<void> {
  const { supabase } = await assertAuth()

  const { data: proposal, error } = await supabase
    .from("lab_proposed_tasks")
    .select(`*, checklist_items:lab_proposed_task_checklist_items(*)`)
    .eq("id", id).single()
  if (error || !proposal) throw new Error("Propuesta no encontrada")

  let taskSetId = proposal.anchor_task_set_id as string | null

  // If the target phase has no task set, create one
  if (!taskSetId) {
    const { data: phase } = await supabase
      .from("phase_set_phases").select("name").eq("id", proposal.anchor_phase_set_phase_id).single()
    const { data: newTS } = await supabase
      .from("task_sets").insert({ name: phase?.name ?? "Tareas" }).select().single()
    if (newTS) {
      taskSetId = newTS.id
      await supabase.from("phase_set_phases")
        .update({ default_task_set_id: taskSetId }).eq("id", proposal.anchor_phase_set_phase_id)
    }
  }

  if (!taskSetId) throw new Error("No se pudo determinar el Task Set destino")

  // Determine task_order: after position_after_task_id, or at end
  let insertOrder = 0
  if (proposal.position_after_task_id) {
    const { data: anchor } = await supabase
      .from("task_set_tasks").select("task_order").eq("id", proposal.position_after_task_id).single()
    if (anchor) {
      // Shift all tasks with order > anchor down
      const { data: toShift } = await supabase
        .from("task_set_tasks")
        .select("id, task_order")
        .eq("task_set_id", taskSetId)
        .gt("task_order", anchor.task_order)
      if (toShift?.length) {
        await Promise.all(toShift.map((t) =>
          supabase.from("task_set_tasks").update({ task_order: t.task_order + 1 }).eq("id", t.id)
        ))
      }
      insertOrder = anchor.task_order + 1
    }
  } else {
    const { data: last } = await supabase
      .from("task_set_tasks").select("task_order")
      .eq("task_set_id", taskSetId).order("task_order", { ascending: false }).limit(1)
    insertOrder = last?.[0] ? last[0].task_order + 1 : 0
  }

  const { data: newTask } = await supabase.from("task_set_tasks").insert({
    task_set_id:          taskSetId,
    title:                proposal.title,
    description:          proposal.description,
    task_order:           insertOrder,
    is_urgent:            false,
    requires_deliverable: proposal.requires_deliverable,
    sop_id:               proposal.sop_id,
    default_position_id:  proposal.default_position_id,
  }).select("id").single()

  if (newTask && proposal.checklist_items?.length) {
    await supabase.from("task_set_checklist_items").insert(
      (proposal.checklist_items as LabProposedTaskChecklistItem[]).map((item) => ({
        task_set_task_id: newTask.id,
        text:             item.text,
        is_blocking:      item.is_blocking,
        item_order:       item.item_order,
      }))
    )
  }

  revalidatePath("/operations")
  revalidate()
}

// ── Proposed phases ───────────────────────────────────────────────────────────

const PROPOSED_PHASE_SELECT = `*`

export async function getMyProposedPhases() {
  const { supabase, user } = await assertAuth()
  const { data } = await supabase
    .from("lab_proposed_phases")
    .select(PROPOSED_PHASE_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
  return (data ?? []) as unknown as import("@/lib/types").LabProposedPhase[]
}

export async function createProposedPhase(phaseSetId: string, formData: FormData) {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase.from("lab_proposed_phases").insert({
    user_id:                  user.id,
    phase_set_id:             phaseSetId,
    name:                     formData.get("name") as string,
    description:              (formData.get("description") as string) || null,
    position_after_phase_id:  (formData.get("position_after_phase_id") as string) || null,
  }).select(PROPOSED_PHASE_SELECT).single()
  if (error) throw error
  revalidate()
  return data as unknown as import("@/lib/types").LabProposedPhase
}

export async function submitProposedPhase(id: string) {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("lab_proposed_phases")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
  revalidate()
}

export async function retractProposedPhase(id: string) {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("lab_proposed_phases")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
  revalidate()
}

// ── Proposed checklist additions ──────────────────────────────────────────────

const PROPOSED_CHECKLIST_SELECT = `
  *,
  anchor_task:task_set_tasks(id, title),
  items:lab_proposed_checklist_items(id, text, is_blocking, item_order),
  reviews:lab_proposed_checklist_addition_reviews(id, action, comment, created_at, reviewer_id)
`

export async function getMyProposedChecklistAdditions(): Promise<LabProposedChecklistAddition[]> {
  const { supabase, user } = await assertAuth()
  const { data } = await supabase
    .from("lab_proposed_checklist_additions")
    .select(PROPOSED_CHECKLIST_SELECT)
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false })
  return (data ?? []) as unknown as LabProposedChecklistAddition[]
}

export async function getAllSubmittedProposedChecklistAdditions(): Promise<LabProposedChecklistAddition[]> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("lab_proposed_checklist_additions")
    .select(PROPOSED_CHECKLIST_SELECT)
    .in("status", ["submitted", "approved", "rejected"])
    .order("updated_at", { ascending: false })
  const rows = (data ?? []) as unknown as WithProfiles[]
  return attachProfiles(supabase, rows) as unknown as Promise<LabProposedChecklistAddition[]>
}

export async function createProposedChecklistAddition(
  anchorTaskSetTaskId: string
): Promise<LabProposedChecklistAddition> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase.from("lab_proposed_checklist_additions").insert({
    author_id: user.id, anchor_task_set_task_id: anchorTaskSetTaskId,
  }).select(PROPOSED_CHECKLIST_SELECT).single()
  if (error) throw error
  revalidate()
  return data as unknown as LabProposedChecklistAddition
}

export async function deleteProposedChecklistAddition(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposed_checklist_additions").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

export async function addProposedChecklistItem(
  additionId: string, text: string, isBlocking: boolean
): Promise<LabProposedChecklistItem> {
  const { supabase } = await assertAuth()
  const { data: existing } = await supabase
    .from("lab_proposed_checklist_items").select("item_order")
    .eq("addition_id", additionId).order("item_order", { ascending: false }).limit(1)
  const nextOrder = existing?.[0] ? existing[0].item_order + 1 : 0
  const { data, error } = await supabase.from("lab_proposed_checklist_items").insert({
    addition_id: additionId, text, is_blocking: isBlocking, item_order: nextOrder,
  }).select().single()
  if (error) throw error
  revalidate()
  return data as LabProposedChecklistItem
}

export async function updateProposedChecklistItem(
  id: string, text: string, isBlocking: boolean
): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposed_checklist_items")
    .update({ text, is_blocking: isBlocking }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deleteProposedChecklistItem(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposed_checklist_items").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

export async function submitProposedChecklistAddition(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposed_checklist_additions")
    .update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function retractProposedChecklistAddition(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposed_checklist_additions")
    .update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function reviewProposedChecklistAddition(
  id: string, action: LabReviewAction, comment: string
): Promise<void> {
  const { supabase, user } = await assertAuth()
  await supabase.from("lab_proposed_checklist_addition_reviews").insert({
    addition_id: id, reviewer_id: user.id, action, comment: comment || null,
  })
  if (action === "approve" || action === "reject") {
    await supabase.from("lab_proposed_checklist_additions")
      .update({ status: action === "approve" ? "approved" : "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
  }
  revalidate()
}

export async function injectProposedChecklistAddition(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { data: addition, error } = await supabase
    .from("lab_proposed_checklist_additions")
    .select(`*, items:lab_proposed_checklist_items(*)`)
    .eq("id", id).single()
  if (error || !addition) throw new Error("Propuesta no encontrada")

  const items = (addition.items ?? []) as LabProposedChecklistItem[]
  if (!items.length) return

  const { data: existing } = await supabase
    .from("task_set_checklist_items").select("item_order")
    .eq("task_set_task_id", addition.anchor_task_set_task_id)
    .order("item_order", { ascending: false }).limit(1)
  const baseOrder = existing?.[0] ? existing[0].item_order + 1 : 0

  await supabase.from("task_set_checklist_items").insert(
    items.map((item, i) => ({
      task_set_task_id: addition.anchor_task_set_task_id,
      text:             item.text,
      is_blocking:      item.is_blocking,
      item_order:       baseOrder + i,
    }))
  )
  revalidatePath("/operations")
  revalidate()
}
