"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { LabProposal, LabProposalPhase, LabProposalTask, LabReviewAction } from "@/lib/types"

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

function revalidate() {
  revalidatePath("/my-lab")
}

// ── Proposals ─────────────────────────────────────────────────────────────────

export async function getMyProposals(): Promise<LabProposal[]> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase
    .from("lab_proposals")
    .select(`
      *,
      phases:lab_proposal_phases(
        *, tasks:lab_proposal_tasks(*)
      ),
      loose_tasks:lab_proposal_tasks!lab_proposal_tasks_proposal_id_fkey(*),
      reviews:lab_proposal_reviews(*, reviewer:profiles(id, full_name, avatar_url))
    `)
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false })
  if (error) return []
  return (data ?? []).map(normalizeProposal) as LabProposal[]
}

export async function getAllSubmittedProposals(): Promise<LabProposal[]> {
  const { supabase } = await assertAuth()
  const { data, error } = await supabase
    .from("lab_proposals")
    .select(`
      *,
      author:profiles(id, full_name, avatar_url),
      phases:lab_proposal_phases(
        *, tasks:lab_proposal_tasks(*)
      ),
      loose_tasks:lab_proposal_tasks!lab_proposal_tasks_proposal_id_fkey(*),
      reviews:lab_proposal_reviews(*, reviewer:profiles(id, full_name, avatar_url))
    `)
    .in("status", ["submitted", "approved", "rejected"])
    .order("updated_at", { ascending: false })
  if (error) return []
  return (data ?? []).map(normalizeProposal) as LabProposal[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProposal(p: any): LabProposal {
  const phases = ((p.phases ?? []) as LabProposalPhase[])
    .sort((a, b) => a.phase_order - b.phase_order)
    .map((ph) => ({
      ...ph,
      tasks: ((ph.tasks ?? []) as LabProposalTask[]).sort((a, b) => a.task_order - b.task_order),
    }))
  const phasedTaskIds = new Set(phases.flatMap((ph) => (ph.tasks ?? []).map((t) => t.id)))
  const loose_tasks = ((p.loose_tasks ?? []) as LabProposalTask[])
    .filter((t) => !phasedTaskIds.has(t.id))
    .sort((a, b) => a.task_order - b.task_order)
  return { ...p, phases, loose_tasks }
}

export async function createProposal(formData: FormData): Promise<LabProposal> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase.from("lab_proposals").insert({
    author_id:   user.id,
    title:       formData.get("title") as string,
    description: (formData.get("description") as string) || null,
  }).select().single()
  if (error) throw error
  revalidate()
  return { ...data, phases: [], loose_tasks: [], reviews: [] } as LabProposal
}

export async function updateProposal(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposals").update({
    title:       formData.get("title") as string,
    description: (formData.get("description") as string) || null,
  }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deleteProposal(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposals").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

export async function submitProposal(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposals")
    .update({ status: "submitted" }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function retractProposal(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposals")
    .update({ status: "draft" }).eq("id", id)
  if (error) throw error
  revalidate()
}

// ── Phases ────────────────────────────────────────────────────────────────────

export async function addProposalPhase(proposalId: string, formData: FormData): Promise<LabProposalPhase> {
  const { supabase } = await assertAuth()
  const { data: existing } = await supabase
    .from("lab_proposal_phases").select("phase_order")
    .eq("proposal_id", proposalId).order("phase_order", { ascending: false }).limit(1)
  const nextOrder = existing?.[0] ? existing[0].phase_order + 1 : 0
  const { data, error } = await supabase.from("lab_proposal_phases").insert({
    proposal_id:  proposalId,
    name:         formData.get("name") as string,
    description:  (formData.get("description") as string) || null,
    phase_order:  nextOrder,
  }).select().single()
  if (error) throw error
  revalidate()
  return { ...data, tasks: [] } as LabProposalPhase
}

export async function updateProposalPhase(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposal_phases").update({
    name:        formData.get("name") as string,
    description: (formData.get("description") as string) || null,
  }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deleteProposalPhase(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposal_phases").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

export async function reorderProposalPhases(proposalId: string, orderedIds: string[]): Promise<void> {
  const { supabase } = await assertAuth()
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from("lab_proposal_phases").update({ phase_order: i }).eq("id", id)
  ))
  revalidate()
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function addProposalTask(
  proposalId: string,
  phaseId: string | null,
  formData: FormData
): Promise<LabProposalTask> {
  const { supabase } = await assertAuth()
  const query = supabase.from("lab_proposal_tasks").select("task_order")
    .eq("proposal_id", proposalId).order("task_order", { ascending: false }).limit(1)
  const { data: existing } = await query
  const nextOrder = existing?.[0] ? existing[0].task_order + 1 : 0
  const { data, error } = await supabase.from("lab_proposal_tasks").insert({
    proposal_id: proposalId,
    phase_id:    phaseId,
    title:       formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    task_order:  nextOrder,
  }).select().single()
  if (error) throw error
  revalidate()
  return data as LabProposalTask
}

export async function updateProposalTask(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposal_tasks").update({
    title:       formData.get("title") as string,
    description: (formData.get("description") as string) || null,
  }).eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deleteProposalTask(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("lab_proposal_tasks").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function reviewProposal(
  proposalId: string,
  action: LabReviewAction,
  comment: string
): Promise<void> {
  const { supabase, user } = await assertAuth()

  await supabase.from("lab_proposal_reviews").insert({
    proposal_id: proposalId,
    reviewer_id: user.id,
    action,
    comment:     comment || null,
  })

  if (action === "approve" || action === "reject") {
    await supabase.from("lab_proposals")
      .update({ status: action === "approve" ? "approved" : "rejected" })
      .eq("id", proposalId)
  }

  revalidate()
}

// ── Promote ───────────────────────────────────────────────────────────────────

export async function promoteProposal(
  proposalId: string,
  mode: "new" | "replace",
  targetPhaseSetId?: string
): Promise<void> {
  const { supabase } = await assertAuth()

  // Fetch full proposal
  const { data: proposal, error: pErr } = await supabase
    .from("lab_proposals")
    .select(`
      title, description,
      phases:lab_proposal_phases(*, tasks:lab_proposal_tasks(*)),
      loose_tasks:lab_proposal_tasks!lab_proposal_tasks_proposal_id_fkey(*)
    `)
    .eq("id", proposalId)
    .single()
  if (pErr || !proposal) throw new Error("Propuesta no encontrada")

  const phases = ((proposal.phases ?? []) as LabProposalPhase[])
    .sort((a, b) => a.phase_order - b.phase_order)
  const phasedTaskIds = new Set(phases.flatMap((ph) => (ph.tasks ?? []).map((t) => t.id)))
  const looseTasks = ((proposal.loose_tasks ?? []) as LabProposalTask[])
    .filter((t) => !phasedTaskIds.has(t.id))

  // If replace mode, delete target phase set first
  if (mode === "replace" && targetPhaseSetId) {
    await supabase.from("phase_set_phases").delete().eq("phase_set_id", targetPhaseSetId)
    await supabase.from("phase_sets").delete().eq("id", targetPhaseSetId)
  }

  // Create new phase set
  const { data: newPS, error: psErr } = await supabase
    .from("phase_sets")
    .insert({ name: proposal.title })
    .select().single()
  if (psErr || !newPS) throw new Error("Error al crear phase set")

  // Create phases
  for (const ph of phases) {
    const { data: newPhase } = await supabase
      .from("phase_set_phases")
      .insert({
        phase_set_id: newPS.id,
        name:         ph.name,
        description:  ph.description,
        phase_order:  ph.phase_order,
      }).select().single()

    if (!newPhase) continue

    // Create task set for this phase if it has tasks
    const phaseTasks = ((ph.tasks ?? []) as LabProposalTask[]).sort((a, b) => a.task_order - b.task_order)
    if (phaseTasks.length > 0) {
      const { data: newTS } = await supabase
        .from("task_sets")
        .insert({ name: `${ph.name} — ${proposal.title}` })
        .select().single()
      if (!newTS) continue

      await supabase.from("task_set_tasks").insert(
        phaseTasks.map((t, i) => ({
          task_set_id:  newTS.id,
          title:        t.title,
          description:  t.description,
          task_order:   i,
          is_urgent:    false,
          requires_deliverable: false,
        }))
      )
      await supabase.from("phase_set_phases")
        .update({ default_task_set_id: newTS.id }).eq("id", newPhase.id)
    }
  }

  // Loose tasks → single task set linked to no phase
  if (looseTasks.length > 0) {
    const { data: looseTS } = await supabase
      .from("task_sets")
      .insert({ name: `${proposal.title} — Tareas generales` })
      .select().single()
    if (looseTS) {
      await supabase.from("task_set_tasks").insert(
        looseTasks.map((t, i) => ({
          task_set_id:  looseTS.id,
          title:        t.title,
          description:  t.description,
          task_order:   i,
          is_urgent:    false,
          requires_deliverable: false,
        }))
      )
    }
  }

  revalidatePath("/operations")
  revalidate()
}
