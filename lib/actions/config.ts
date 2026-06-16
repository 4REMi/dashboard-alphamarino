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
    color: (formData.get("color") as string) || null,
    icon: (formData.get("icon") as string) || null,
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
      color: (formData.get("color") as string) || null,
      icon: (formData.get("icon") as string) || null,
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
// POSITIONS
// ============================================================

export async function getPositions() {
  const supabase = await createClient()
  const { data, error } = await supabase.from("positions").select("*").order("name")
  if (error) return []
  return data ?? []
}

export async function createPosition(name: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("positions").insert({ name }).select().single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  revalidatePath("/employees")
  return data
}

export async function updatePosition(id: string, name: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("positions").update({ name }).eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  revalidatePath("/employees")
}

export async function deletePosition(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("positions").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  revalidatePath("/employees")
}

// ============================================================
// TASK SETS
// ============================================================

export async function getTaskSets() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("task_sets")
    .select("*, tasks:task_set_tasks(*, sop:sops(id, title), default_position:positions(id, name), checklist_items:task_set_checklist_items(id, text, is_blocking, item_order))")
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
  const { data, error } = await supabase.from("task_sets").insert({
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
  }).select().single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  return data
}

export async function updateTaskSet(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("task_sets").update({
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
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

  const positionIdRaw = formData.get("default_position_id") as string
  const { data, error } = await supabase.from("task_set_tasks").insert({
    task_set_id: taskSetId,
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    is_urgent: formData.get("is_urgent") === "true",
    requires_deliverable: formData.get("requires_deliverable") === "true",
    default_position_id: positionIdRaw && positionIdRaw !== "none" ? positionIdRaw : null,
    task_order: nextOrder,
  }).select("*, default_position:positions(id, name)").single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  return data
}

export async function updateTaskInSet(taskId: string, formData: FormData) {
  const supabase = await createClient()
  const sopIdRaw = formData.get("sop_id") as string
  const positionIdRaw = formData.get("default_position_id") as string
  const { data, error } = await supabase
    .from("task_set_tasks")
    .update({
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      is_urgent: formData.get("is_urgent") === "true",
      requires_deliverable: formData.get("requires_deliverable") === "true",
      sop_id: sopIdRaw || null,
      default_position_id: positionIdRaw && positionIdRaw !== "none" ? positionIdRaw : null,
    })
    .eq("id", taskId)
    .select("*, sop:sops(id, title), default_position:positions(id, name)")
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

export async function reorderTasksInSet(taskSetId: string, orderedIds: string[]) {
  const supabase = await createClient()
  const updates = orderedIds.map((id, i) =>
    supabase.from("task_set_tasks").update({ task_order: i }).eq("id", id)
  )
  await Promise.all(updates)
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
// TASK SET CHECKLIST ITEMS (templates)
// ============================================================

export async function addChecklistItemToSetTask(
  taskSetTaskId: string,
  text: string,
  isBlocking: boolean
) {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("task_set_checklist_items")
    .select("item_order")
    .eq("task_set_task_id", taskSetTaskId)
    .order("item_order", { ascending: false })
    .limit(1)
  const nextOrder = (existing?.[0]?.item_order ?? -1) + 1

  const { data, error } = await supabase
    .from("task_set_checklist_items")
    .insert({ task_set_task_id: taskSetTaskId, text, is_blocking: isBlocking, item_order: nextOrder })
    .select()
    .single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  return data
}

export async function updateSetTaskChecklistItem(
  itemId: string,
  fields: { text?: string; is_blocking?: boolean }
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("task_set_checklist_items")
    .update(fields)
    .eq("id", itemId)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function deleteSetTaskChecklistItem(itemId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("task_set_checklist_items")
    .delete()
    .eq("id", itemId)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function reorderSetTaskChecklistItems(
  taskSetTaskId: string,
  orderedIds: string[]
) {
  const supabase = await createClient()
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("task_set_checklist_items").update({ item_order: index }).eq("id", id)
    )
  )
  revalidatePath("/settings")
  revalidatePath("/operations")
}

// ============================================================
// IMPORT / EXPORT
// ============================================================

type ImportChecklistItem = { text: string; is_blocking?: boolean }
type ImportTask = { title: string; description?: string | null; is_urgent?: boolean; requires_deliverable?: boolean; checklist?: ImportChecklistItem[] }
type ImportTaskSet = { name: string; tasks?: ImportTask[] }
type ImportPhase = { name: string; description?: string | null; taskSet?: ImportTaskSet | null }
type ImportTemplate = {
  projectType: { name: string; description?: string | null }
  phaseSet?: { name: string; phases?: ImportPhase[] } | null
}

export async function importOperationsTemplate(jsonStr: string, mode: "default" | "rename" | "overwrite" = "default") {
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

  const baseName = template.projectType.name.trim()

  // ── Conflict detection ────────────────────────────────────────────────────
  const { data: existingPT } = await supabase
    .from("project_types")
    .select("id, default_phase_set_id")
    .eq("name", baseName)
    .maybeSingle()

  if (existingPT) {
    if (mode === "default") {
      // Compute next available name: "Shopify (2)", "Shopify (3)", …
      const { data: allNames } = await supabase
        .from("project_types").select("name").ilike("name", `${baseName} (%)`)
      const takenNumbers = new Set((allNames ?? []).map((r: { name: string }) => {
        const m = r.name.match(/\((\d+)\)$/)
        return m ? Number(m[1]) : 0
      }))
      let n = 2
      while (takenNumbers.has(n)) n++
      return { conflict: true as const, suggestedName: `${baseName} (${n})` }
    }

    if (mode === "overwrite") {
      // Collect task set IDs linked to this phase set's phases
      let taskSetIds: string[] = []
      if (existingPT.default_phase_set_id) {
        const { data: phases } = await supabase
          .from("phase_set_phases")
          .select("default_task_set_id")
          .eq("phase_set_id", existingPT.default_phase_set_id)
        taskSetIds = (phases ?? [])
          .map((p: { default_task_set_id: string | null }) => p.default_task_set_id)
          .filter(Boolean) as string[]
      }
      // Delete: project type → phase set (cascades phases) → task sets (manually cascade tasks+checklist)
      await supabase.from("project_types").delete().eq("id", existingPT.id)
      if (existingPT.default_phase_set_id) {
        await supabase.from("phase_set_phases").delete().eq("phase_set_id", existingPT.default_phase_set_id)
        await supabase.from("phase_sets").delete().eq("id", existingPT.default_phase_set_id)
      }
      if (taskSetIds.length > 0) {
        const { data: taskRows } = await supabase.from("task_set_tasks").select("id").in("task_set_id", taskSetIds)
        const taskIds = (taskRows ?? []).map((t: { id: string }) => t.id)
        if (taskIds.length > 0) {
          await supabase.from("task_set_checklist_items").delete().in("task_set_task_id", taskIds)
          await supabase.from("task_set_tasks").delete().in("id", taskIds)
        }
        await supabase.from("task_sets").delete().in("id", taskSetIds)
      }
    }

    if (mode === "rename") {
      // Auto-suffix the name
      const { data: allNames } = await supabase
        .from("project_types").select("name").ilike("name", `${baseName} (%)`)
      const takenNumbers = new Set((allNames ?? []).map((r: { name: string }) => {
        const m = r.name.match(/\((\d+)\)$/)
        return m ? Number(m[1]) : 0
      }))
      let n = 2
      while (takenNumbers.has(n)) n++
      template.projectType.name = `${baseName} (${n})`
    }
  }

  // ── Create task sets ──────────────────────────────────────────────────────
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
      const { data: taskRow, error: taskErr } = await supabase
        .from("task_set_tasks")
        .insert({
          task_set_id: tsRow.id,
          title: task.title,
          description: task.description ?? null,
          is_urgent: task.is_urgent ?? false,
          requires_deliverable: task.requires_deliverable ?? false,
          task_order: j,
        })
        .select("id")
        .single()
      if (taskErr) throw new Error(`Error creando tarea "${task.title}": ${taskErr.message}`)

      const checklistItems = task.checklist ?? []
      if (checklistItems.length > 0 && taskRow) {
        await supabase.from("task_set_checklist_items").insert(
          checklistItems.map((item, k) => ({
            task_set_task_id: taskRow.id,
            text: item.text,
            is_blocking: item.is_blocking ?? false,
            item_order: k,
          }))
        )
      }
    }

    tsIdByPhase[i] = tsRow.id
    createdTaskSets.push({ id: tsRow.id, name: ts.name.trim(), tasks })
  }

  // ── Create phase set + phases ─────────────────────────────────────────────
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

  // ── Create project type ───────────────────────────────────────────────────
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

  return {
    replacedName: mode === "overwrite" ? baseName : null,
    projectType: { ...ptRow, default_phase_set_id: phaseSetId },
    phaseSet: phaseSetId
      ? { id: phaseSetId, name: template.phaseSet!.name.trim(), phases: createdPhases }
      : null,
    taskSets: createdTaskSets,
  }
}

// ============================================================
// CLONE HELPERS
// ============================================================

async function deepCloneTaskSet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceTaskSetId: string,
  newName: string,
): Promise<string> {
  const { data: newTS } = await supabase.from("task_sets").insert({ name: newName }).select().single()
  if (!newTS) throw new Error("Error al clonar task set")

  const { data: tasks } = await supabase
    .from("task_set_tasks")
    .select("*, checklist_items:task_set_checklist_items(*)")
    .eq("task_set_id", sourceTaskSetId)
    .order("task_order")

  for (const task of tasks ?? []) {
    const { data: newTask } = await supabase.from("task_set_tasks").insert({
      task_set_id:          newTS.id,
      title:                task.title,
      description:          task.description,
      task_order:           task.task_order,
      is_urgent:            task.is_urgent ?? false,
      requires_deliverable: task.requires_deliverable ?? false,
      sop_id:               task.sop_id ?? null,
      default_position_id:  task.default_position_id ?? null,
    }).select().single()

    if (newTask && task.checklist_items?.length) {
      await supabase.from("task_set_checklist_items").insert(
        (task.checklist_items as { text: string; is_blocking: boolean; item_order: number }[]).map((ci) => ({
          task_set_task_id: newTask.id,
          text:             ci.text,
          is_blocking:      ci.is_blocking,
          item_order:       ci.item_order,
        }))
      )
    }
  }

  return newTS.id
}

/** Deep-copies a PhaseSet (all phases + task sets + tasks + checklist items).
 *  The copy is not linked to any ProjectType — link it manually afterward. */
export async function clonePhaseSet(phaseSetId: string) {
  const supabase = await createClient()

  const { data: source } = await supabase
    .from("phase_sets")
    .select("*, phases:phase_set_phases(*)")
    .eq("id", phaseSetId)
    .single()
  if (!source) throw new Error("Phase set no encontrado")

  const { data: newPS } = await supabase
    .from("phase_sets")
    .insert({ name: `${source.name} (copia)` })
    .select().single()
  if (!newPS) throw new Error("Error al crear phase set")

  const sortedPhases = ((source.phases ?? []) as { id: string; name: string; description: string | null; phase_order: number; default_task_set_id: string | null }[])
    .sort((a, b) => a.phase_order - b.phase_order)

  const newPhases = []
  for (const phase of sortedPhases) {
    const newTaskSetId = phase.default_task_set_id
      ? await deepCloneTaskSet(supabase, phase.default_task_set_id, phase.name)
      : null

    const { data: newPhase } = await supabase.from("phase_set_phases").insert({
      phase_set_id:        newPS.id,
      name:                phase.name,
      description:         phase.description,
      phase_order:         phase.phase_order,
      default_task_set_id: newTaskSetId,
    }).select().single()

    if (newPhase) newPhases.push({ ...newPhase, default_task_set_id: newTaskSetId })
  }

  revalidatePath("/operations")
  return { ...newPS, phases: newPhases }
}

/** Deep-copies a single phase (+ its task set) into a target PhaseSet. */
export async function clonePhaseIntoPhaseSet(phaseId: string, targetPhaseSetId: string) {
  const supabase = await createClient()

  const { data: source } = await supabase
    .from("phase_set_phases").select("*").eq("id", phaseId).single()
  if (!source) throw new Error("Fase no encontrada")

  const { data: existing } = await supabase
    .from("phase_set_phases").select("phase_order")
    .eq("phase_set_id", targetPhaseSetId)
    .order("phase_order", { ascending: false }).limit(1)
  const nextOrder = existing?.[0] ? (existing[0] as { phase_order: number }).phase_order + 1 : 0

  const newTaskSetId = source.default_task_set_id
    ? await deepCloneTaskSet(supabase, source.default_task_set_id, source.name)
    : null

  const { data: newPhase } = await supabase.from("phase_set_phases").insert({
    phase_set_id:        targetPhaseSetId,
    name:                source.name,
    description:         source.description,
    phase_order:         nextOrder,
    default_task_set_id: newTaskSetId,
  }).select().single()
  if (!newPhase) throw new Error("Error al clonar fase")

  revalidatePath("/operations")
  return { ...newPhase, default_task_set_id: newTaskSetId }
}
