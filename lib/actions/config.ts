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
  revalidatePath("/operations")
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
  revalidatePath("/operations")
  revalidatePath("/projects")
  return data
}

export async function deleteProjectType(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("project_types").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
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
  revalidatePath("/operations")
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
  revalidatePath("/operations")
}

export async function deletePhaseSet(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("phase_sets").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
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
  revalidatePath("/operations")
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
  revalidatePath("/operations")
}

export async function deletePhaseFromSet(phaseId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("phase_set_phases").delete().eq("id", phaseId)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function reorderPhaseInSet(phaseSetId: string, orderedIds: string[]) {
  const supabase = await createClient()
  const updates = orderedIds.map((id, i) =>
    supabase.from("phase_set_phases").update({ phase_order: i }).eq("id", id)
  )
  await Promise.all(updates)
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function linkPhaseSetToProjectType(projectTypeId: string, phaseSetId: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_types")
    .update({ default_phase_set_id: phaseSetId })
    .eq("id", projectTypeId)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

// ============================================================
// TASK SETS
// ============================================================

export async function getTaskSets() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("task_sets")
    .select("*, tasks:task_set_tasks(*), default_assignee:profiles(id, full_name, avatar_url)")
    .order("name")
  if (error) return []
  return (data ?? []).map((ts) => ({
    ...ts,
    tasks: (ts.tasks ?? []).sort(
      (a: { task_order: number }, b: { task_order: number }) => a.task_order - b.task_order
    ),
  }))
}

export async function createTaskSet(formData: FormData) {
  const supabase = await createClient()
  const assigneeId = formData.get("default_assignee_id") as string
  const { data, error } = await supabase.from("task_sets").insert({
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
    default_assignee_id: assigneeId && assigneeId !== "none" ? assigneeId : null,
  }).select().single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  return data
}

export async function updateTaskSet(id: string, formData: FormData) {
  const supabase = await createClient()
  const assigneeId = formData.get("default_assignee_id") as string
  const { error } = await supabase.from("task_sets").update({
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
    default_assignee_id: assigneeId && assigneeId !== "none" ? assigneeId : null,
  }).eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function deleteTaskSet(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("task_sets").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function addTaskToSet(taskSetId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("task_set_tasks")
    .select("task_order")
    .eq("task_set_id", taskSetId)
    .order("task_order", { ascending: false })
    .limit(1)
  const nextOrder = existing?.[0] ? existing[0].task_order + 1 : 0

  const { data, error } = await supabase.from("task_set_tasks").insert({
    task_set_id: taskSetId,
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    is_urgent: formData.get("is_urgent") === "true",
    requires_deliverable: formData.get("requires_deliverable") === "true",
    task_order: nextOrder,
  }).select().single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  return data
}

export async function updateTaskInSet(taskId: string, formData: FormData) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("task_set_tasks")
    .update({
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      is_urgent: formData.get("is_urgent") === "true",
      requires_deliverable: formData.get("requires_deliverable") === "true",
    })
    .eq("id", taskId)
    .select()
    .single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  return data
}

export async function deleteTaskFromSet(taskId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("task_set_tasks").delete().eq("id", taskId)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function linkTaskSetToPhase(phaseId: string, taskSetId: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("phase_set_phases")
    .update({ default_task_set_id: taskSetId })
    .eq("id", phaseId)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

// ============================================================
// IMPORT / EXPORT
// ============================================================

type ImportTask = { title: string; description?: string | null; is_urgent?: boolean; requires_deliverable?: boolean }
type ImportTaskSet = { name: string; tasks?: ImportTask[] }
type ImportPhase = { name: string; description?: string | null; taskSet?: ImportTaskSet | null }
type ImportTemplate = {
  projectType: { name: string; description?: string | null }
  phaseSet?: { name: string; phases?: ImportPhase[] } | null
}

export async function importOperationsTemplate(jsonStr: string) {
  const supabase = await createClient()

  let template: ImportTemplate
  try {
    template = JSON.parse(jsonStr) as ImportTemplate
  } catch {
    throw new Error("JSON inválido — verifica la sintaxis")
  }

  if (!template?.projectType?.name?.trim()) {
    throw new Error("Se requiere projectType.name")
  }

  // 1. Create task sets and collect { phaseIndex → taskSetId }
  const tsIdByPhase: Record<number, string> = {}
  const createdTaskSets: Array<{ id: string; name: string; tasks: ImportTask[] }> = []

  const phases = template.phaseSet?.phases ?? []
  for (let i = 0; i < phases.length; i++) {
    const ts = phases[i].taskSet
    if (!ts?.name?.trim()) continue

    const { data: tsRow, error: tsErr } = await supabase
      .from("task_sets")
      .insert({ name: ts.name.trim() })
      .select()
      .single()
    if (tsErr) throw new Error(`Error creando task set "${ts.name}": ${tsErr.message}`)

    const tasks = ts.tasks ?? []
    for (let j = 0; j < tasks.length; j++) {
      const task = tasks[j]
      await supabase.from("task_set_tasks").insert({
        task_set_id: tsRow.id,
        title: task.title,
        description: task.description ?? null,
        is_urgent: task.is_urgent ?? false,
        requires_deliverable: task.requires_deliverable ?? false,
        task_order: j,
      })
    }

    tsIdByPhase[i] = tsRow.id
    createdTaskSets.push({ id: tsRow.id, name: ts.name.trim(), tasks })
  }

  // 2. Create phase set + phases
  let phaseSetId: string | null = null
  const createdPhases: Array<{ id: string; name: string; description: string | null; phase_order: number; default_task_set_id: string | null }> = []

  if (template.phaseSet?.name?.trim()) {
    const { data: psRow, error: psErr } = await supabase
      .from("phase_sets")
      .insert({ name: template.phaseSet.name.trim() })
      .select()
      .single()
    if (psErr) throw new Error(`Error creando phase set: ${psErr.message}`)
    phaseSetId = psRow.id

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i]
      if (!phase.name?.trim()) continue

      const { data: phRow, error: phErr } = await supabase
        .from("phase_set_phases")
        .insert({
          phase_set_id: phaseSetId,
          name: phase.name.trim(),
          description: phase.description ?? null,
          phase_order: i,
          default_task_set_id: tsIdByPhase[i] ?? null,
        })
        .select()
        .single()
      if (phErr) throw new Error(`Error creando fase "${phase.name}": ${phErr.message}`)
      createdPhases.push(phRow)
    }
  }

  // 3. Create project type
  const { data: ptRow, error: ptErr } = await supabase
    .from("project_types")
    .insert({
      name: template.projectType.name.trim(),
      description: template.projectType.description ?? null,
      default_phase_set_id: phaseSetId,
    })
    .select()
    .single()
  if (ptErr) throw new Error(`Error creando tipo de proyecto: ${ptErr.message}`)

  revalidatePath("/operations")
  revalidatePath("/projects")

  // Return full created tree so the client can update state without reload
  return {
    projectType: { ...ptRow, default_phase_set_id: phaseSetId },
    phaseSet: phaseSetId
      ? { id: phaseSetId, name: template.phaseSet!.name.trim(), phases: createdPhases }
      : null,
    taskSets: createdTaskSets,
  }
}
