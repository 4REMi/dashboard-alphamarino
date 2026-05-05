"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { LabPhase, LabPhaseTask, LabPhaseTaskChecklistItem, LabReviewAction } from "@/lib/types"

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
  const { data, error } = await supabase.from("lab_phase_tasks").insert({
    phase_id:             phaseId,
    title:                formData.get("title") as string,
    description:          (formData.get("description") as string) || null,
    task_order:           nextOrder,
    requires_deliverable: formData.get("requires_deliverable") === "true",
    sop_id:               sopIdRaw || null,
  }).select(TASK_SELECT).single()
  if (error) throw error
  revalidate()
  return { ...data, checklist_items: [] } as LabPhaseTask
}

export async function updatePhaseTask(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const sopIdRaw = formData.get("sop_id") as string
  const { error } = await supabase.from("lab_phase_tasks").update({
    title:                formData.get("title") as string,
    description:          (formData.get("description") as string) || null,
    requires_deliverable: formData.get("requires_deliverable") === "true",
    sop_id:               sopIdRaw || null,
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
