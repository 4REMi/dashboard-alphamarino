"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { LabPhase, LabPhaseTask, LabReviewAction } from "@/lib/types"

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

const PHASE_SELECT = `
  *,
  tasks:lab_phase_tasks(*),
  reviews:lab_phase_reviews(*, reviewer:profiles(id, full_name, avatar_url))
`

function normalizePhase(p: Record<string, unknown>): LabPhase {
  const tasks = ((p.tasks ?? []) as LabPhaseTask[]).sort((a, b) => a.task_order - b.task_order)
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
  const { data, error } = await supabase.from("lab_phase_tasks").insert({
    phase_id:    phaseId,
    title:       formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    task_order:  nextOrder,
  }).select().single()
  if (error) throw error
  revalidate()
  return data as LabPhaseTask
}

export async function updatePhaseTask(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_phase_tasks").update({
    title:       formData.get("title") as string,
    description: (formData.get("description") as string) || null,
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

  // Fetch phase + tasks
  const { data: phase, error: pErr } = await supabase
    .from("lab_phases")
    .select("*, tasks:lab_phase_tasks(*)")
    .eq("id", phaseId)
    .single()
  if (pErr || !phase) throw new Error("Fase no encontrada")

  const tasks = ((phase.tasks ?? []) as LabPhaseTask[]).sort((a, b) => a.task_order - b.task_order)

  // Get next phase_order in target phase set
  const { data: existing } = await supabase
    .from("phase_set_phases").select("phase_order")
    .eq("phase_set_id", targetPhaseSetId).order("phase_order", { ascending: false }).limit(1)
  const nextOrder = existing?.[0] ? existing[0].phase_order + 1 : 0

  // Create the phase in the target phase set
  const { data: newPhase, error: phErr } = await supabase
    .from("phase_set_phases")
    .insert({
      phase_set_id: targetPhaseSetId,
      name:         phase.name,
      description:  phase.description,
      phase_order:  nextOrder,
    }).select().single()
  if (phErr || !newPhase) throw new Error("Error al crear la fase en Operations Lab")

  // If tasks exist, create a Task Set and link it
  if (tasks.length > 0) {
    const { data: newTS } = await supabase
      .from("task_sets")
      .insert({ name: phase.name })
      .select().single()

    if (newTS) {
      await supabase.from("task_set_tasks").insert(
        tasks.map((t, i) => ({
          task_set_id:          newTS.id,
          title:                t.title,
          description:          t.description,
          task_order:           i,
          is_urgent:            false,
          requires_deliverable: false,
        }))
      )
      await supabase.from("phase_set_phases")
        .update({ default_task_set_id: newTS.id }).eq("id", newPhase.id)
    }
  }

  revalidatePath("/operations")
  revalidate()
}
