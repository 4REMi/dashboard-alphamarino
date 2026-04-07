"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

// ============================================================
// PROJECT TYPES
// ============================================================

export async function getProjectTypes() {
  const supabase = await createClient()
  const { data: types, error } = await supabase
    .from("project_types")
    .select("*")
    .order("name")
  if (error) return []

  // Load phase sets separately — avoids dependency on the FK constraint
  // between project_types.default_phase_set_id → phase_sets.id
  const phaseSetsMap: Record<string, { id: string; name: string; phases: { id: string; name: string; description: string | null; phase_order: number }[] }> = {}
  try {
    const { data: phaseSets } = await supabase
      .from("phase_sets")
      .select("*, phases:phase_set_phases(id, name, description, phase_order)")
    if (phaseSets) {
      for (const ps of phaseSets) {
        phaseSetsMap[ps.id] = {
          ...ps,
          phases: ((ps.phases ?? []) as { id: string; name: string; description: string | null; phase_order: number }[])
            .sort((a, b) => a.phase_order - b.phase_order),
        }
      }
    }
  } catch { /* phase_sets may not exist */ }

  return (types ?? []).map((t) => ({
    ...t,
    default_phase_set: t.default_phase_set_id ? (phaseSetsMap[t.default_phase_set_id] ?? null) : null,
  }))
}

export async function createProjectType(formData: FormData) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("project_types").insert({
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
  }).select().single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/projects")
  return data
}

export async function updateProjectType(id: string, formData: FormData) {
  const supabase = await createClient()
  const defaultPhaseSetId = formData.get("default_phase_set_id") as string
  const { data, error } = await supabase
    .from("project_types")
    .update({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      default_phase_set_id: defaultPhaseSetId && defaultPhaseSetId !== "none" ? defaultPhaseSetId : null,
    })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/projects")
  return data
}

export async function deleteProjectType(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("project_types").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
}

// ============================================================
// PHASE SETS
// ============================================================

export async function getPhaseSets() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("phase_sets")
    .select("*, phases:phase_set_phases(*)")
    .order("name")
  if (error) return []
  return (data ?? []).map((ps) => ({
    ...ps,
    phases: (ps.phases ?? []).sort(
      (a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order
    ),
  }))
}

export async function createPhaseSet(formData: FormData) {
  const supabase = await createClient()
  const projectTypeId = formData.get("project_type_id") as string
  const { data, error } = await supabase.from("phase_sets").insert({
    name: formData.get("name") as string,
    project_type_id: projectTypeId && projectTypeId !== "none" ? projectTypeId : null,
  }).select().single()
  if (error) throw error
  revalidatePath("/settings")
  return data
}

export async function updatePhaseSet(id: string, formData: FormData) {
  const supabase = await createClient()
  const projectTypeId = formData.get("project_type_id") as string
  const { error } = await supabase
    .from("phase_sets")
    .update({
      name: formData.get("name") as string,
      project_type_id: projectTypeId && projectTypeId !== "none" ? projectTypeId : null,
    })
    .eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
}

export async function deletePhaseSet(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("phase_sets").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
}

// ============================================================
// PHASE SET PHASES
// ============================================================

export async function addPhaseToSet(phaseSetId: string, formData: FormData) {
  const supabase = await createClient()
  // Get current max order
  const { data: existing } = await supabase
    .from("phase_set_phases")
    .select("phase_order")
    .eq("phase_set_id", phaseSetId)
    .order("phase_order", { ascending: false })
    .limit(1)
  const nextOrder = existing?.[0] ? existing[0].phase_order + 1 : 0

  const { data, error } = await supabase.from("phase_set_phases").insert({
    phase_set_id: phaseSetId,
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
    phase_order: nextOrder,
  }).select().single()
  if (error) throw error
  revalidatePath("/settings")
  return data
}

export async function updatePhaseInSet(phaseId: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("phase_set_phases")
    .update({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
    })
    .eq("id", phaseId)
  if (error) throw error
  revalidatePath("/settings")
}

export async function deletePhaseFromSet(phaseId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("phase_set_phases").delete().eq("id", phaseId)
  if (error) throw error
  revalidatePath("/settings")
}

export async function reorderPhaseInSet(phaseSetId: string, orderedIds: string[]) {
  const supabase = await createClient()
  const updates = orderedIds.map((id, i) =>
    supabase.from("phase_set_phases").update({ phase_order: i }).eq("id", id)
  )
  await Promise.all(updates)
  revalidatePath("/settings")
}

export async function linkPhaseSetToProjectType(projectTypeId: string, phaseSetId: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_types")
    .update({ default_phase_set_id: phaseSetId })
    .eq("id", projectTypeId)
  if (error) throw error
  revalidatePath("/settings")
}
