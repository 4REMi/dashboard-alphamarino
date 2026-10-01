"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Cliente para escribir plantillas de Operations. Desde la UI: la sesión
// normal (las reglas de la base de datos ya limitan a admin). Desde MCP
// (actingProfileId, sin sesión de navegador): cliente admin, pero SOLO si
// esa persona es admin — chequeo explícito para no heredar un bypass.
async function opsClient(actingProfileId?: string) {
  if (!actingProfileId) return createClient()
  const admin = createAdminClient()
  const { data: profile } = await admin.from("profiles").select("role").eq("id", actingProfileId).single()
  if (profile?.role !== "admin") throw new Error("Solo un admin puede modificar las plantillas de Operations")
  return admin
}

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

// Lightweight — just what's needed to render a category tile/badge (icon +
// color), no phase_sets join. Safe to fetch eagerly where getProjectTypes()
// (which does 2 queries + a nested join) would be overkill.
export async function getProjectTypeBadges(): Promise<{ id: string; name: string; icon: string | null; color: string | null }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("project_types")
    .select("id, name, icon, color")
    .order("name")
  if (error) return []
  return data ?? []
}

export async function createProjectType(formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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

export async function updateProjectType(id: string, formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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

export async function deleteProjectType(id: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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
    .select("*, phases:phase_set_phases(id, name, description, phase_order, default_task_set_id)")
    .order("name")
  if (error) return []
  return (data ?? []).map((ps) => ({
    ...ps,
    phases: (ps.phases ?? []).sort(
      (a: { phase_order: number }, b: { phase_order: number }) => a.phase_order - b.phase_order
    ),
  }))
}

export async function createPhaseSet(formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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

export async function updatePhaseSet(id: string, formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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

export async function deletePhaseSet(id: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const { error } = await supabase.from("phase_sets").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

// ============================================================
// PHASE SET PHASES
// ============================================================

export async function addPhaseToSet(phaseSetId: string, formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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

export async function updatePhaseInSet(phaseId: string, formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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

export async function deletePhaseFromSet(phaseId: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const { error } = await supabase.from("phase_set_phases").delete().eq("id", phaseId)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function reorderPhaseInSet(phaseSetId: string, orderedIds: string[], actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const updates = orderedIds.map((id, i) =>
    supabase.from("phase_set_phases").update({ phase_order: i }).eq("id", id)
  )
  await Promise.all(updates)
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function linkPhaseSetToProjectType(projectTypeId: string, phaseSetId: string | null, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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

export async function createPosition(name: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const { data, error } = await supabase.from("positions").insert({ name }).select().single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  revalidatePath("/employees")
  return data
}

export async function updatePosition(id: string, name: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const { error } = await supabase.from("positions").update({ name }).eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  revalidatePath("/employees")
}

export async function deletePosition(id: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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

export async function createTaskSet(formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const { data, error } = await supabase.from("task_sets").insert({
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
  }).select().single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  return data
}

export async function updateTaskSet(id: string, formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const { error } = await supabase.from("task_sets").update({
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
  }).eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function deleteTaskSet(id: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const { error } = await supabase.from("task_sets").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function addTaskToSet(taskSetId: string, formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const { data: existing } = await supabase
    .from("task_set_tasks")
    .select("task_order")
    .eq("task_set_id", taskSetId)
    .order("task_order", { ascending: false })
    .limit(1)
  const nextOrder = existing?.[0] ? existing[0].task_order + 1 : 0

  const positionIdRaw = formData.get("default_position_id") as string
  const pingPositionIds = formData.getAll("ping_position_ids") as string[]
  const { data, error } = await supabase.from("task_set_tasks").insert({
    task_set_id: taskSetId,
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    is_urgent: formData.get("is_urgent") === "true",
    is_pinged: formData.get("is_pinged") === "true",
    ping_position_ids: pingPositionIds.length > 0 ? pingPositionIds : null,
    requires_deliverable: formData.get("requires_deliverable") === "true",
    deliverable_instructions: (formData.get("deliverable_instructions") as string) || null,
    default_position_id: positionIdRaw && positionIdRaw !== "none" ? positionIdRaw : null,
    task_order: nextOrder,
  }).select("*, default_position:positions(id, name)").single()
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
  return data
}

export async function updateTaskInSet(taskId: string, formData: FormData, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const sopIdRaw = formData.get("sop_id") as string
  const positionIdRaw = formData.get("default_position_id") as string
  const pingPositionIds = formData.getAll("ping_position_ids") as string[]
  const { data, error } = await supabase
    .from("task_set_tasks")
    .update({
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      is_urgent: formData.get("is_urgent") === "true",
      is_pinged: formData.get("is_pinged") === "true",
      ping_position_ids: pingPositionIds.length > 0 ? pingPositionIds : null,
      requires_deliverable: formData.get("requires_deliverable") === "true",
      deliverable_instructions: (formData.get("deliverable_instructions") as string) || null,
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

export async function deleteTaskFromSet(taskId: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const { error } = await supabase.from("task_set_tasks").delete().eq("id", taskId)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function reorderTasksInSet(taskSetId: string, orderedIds: string[], actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
  const updates = orderedIds.map((id, i) =>
    supabase.from("task_set_tasks").update({ task_order: i }).eq("id", id)
  )
  await Promise.all(updates)
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function linkTaskSetToPhase(phaseId: string, taskSetId: string | null, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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
  isBlocking: boolean,
  actingProfileId?: string
) {
  const supabase = await opsClient(actingProfileId)
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
  fields: { text?: string; is_blocking?: boolean },
  actingProfileId?: string
) {
  const supabase = await opsClient(actingProfileId)
  const { error } = await supabase
    .from("task_set_checklist_items")
    .update(fields)
    .eq("id", itemId)
  if (error) throw error
  revalidatePath("/settings")
  revalidatePath("/operations")
}

export async function deleteSetTaskChecklistItem(itemId: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)
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
  orderedIds: string[],
  actingProfileId?: string
) {
  const supabase = await opsClient(actingProfileId)
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

// Formato de plantilla (el mismo para exportar e importar, desde la UI o
// desde MCP). Puestos y SOPs viajan por NOMBRE/TÍTULO, no por id.
type ImportChecklistItem = { text: string; is_blocking?: boolean }
type ImportTask = {
  title: string
  description?: string | null
  is_urgent?: boolean
  requires_deliverable?: boolean
  deliverable_instructions?: string | null
  default_position?: string | null   // puesto responsable (nombre)
  ping_positions?: string[]          // puestos a notificar (nombres)
  sop?: string | null                // título del SOP
  checklist?: ImportChecklistItem[]
}
type ImportTaskSet = { name: string; tasks?: ImportTask[] }
type ImportPhase = { name: string; description?: string | null; taskSet?: ImportTaskSet | null }
export type OperationsTemplate = {
  projectType: { name: string; description?: string | null; color?: string | null; icon?: string | null }
  phaseSet?: { name: string; phases?: ImportPhase[] } | null
}
type ImportTemplate = OperationsTemplate

export interface TemplatePreview {
  projectType: string
  phaseSet: string | null
  phases: number
  taskSets: number
  tasks: number
  checklistItems: number
  errors: string[]
}

type Client = Awaited<ReturnType<typeof createClient>>

// Valida antes de escribir nada: estructura, nombres repetidos, y que los
// puestos y SOPs referidos existan. Regresa además los mapas nombre → id.
async function validateTemplate(template: ImportTemplate, supabase: Client) {
  const errors: string[] = []
  if (!template?.projectType?.name?.trim()) errors.push("Se requiere projectType.name")
  const phases = template?.phaseSet?.phases ?? []
  if (phases.length && !template.phaseSet?.name?.trim()) errors.push("phaseSet.name es obligatorio si hay fases")
  const [{ data: positions }, { data: sops }] = await Promise.all([
    supabase.from("positions").select("id, name"),
    supabase.from("sops").select("id, title"),
  ])
  const posByName = new Map((positions ?? []).map((p) => [String(p.name).trim().toLowerCase(), p.id as string]))
  const sopByTitle = new Map((sops ?? []).map((x) => [String(x.title).trim().toLowerCase(), x.id as string]))
  const seenPhase = new Set<string>()
  let tasks = 0, items = 0, taskSets = 0
  phases.forEach((ph, i) => {
    const where = `Fase ${i + 1}${ph?.name ? ` ("${ph.name}")` : ""}`
    if (!ph?.name?.trim()) errors.push(`${where}: falta name`)
    else if (seenPhase.has(ph.name.trim().toLowerCase())) errors.push(`${where}: nombre de fase repetido`)
    else seenPhase.add(ph.name.trim().toLowerCase())
    const ts = ph?.taskSet
    if (!ts) return
    if (!ts.name?.trim()) { errors.push(`${where}: taskSet sin name`); return }
    taskSets++
    ;(ts.tasks ?? []).forEach((t, j) => {
      const tw = `${where} › tarea ${j + 1}${t?.title ? ` ("${t.title}")` : ""}`
      if (!t?.title?.trim()) errors.push(`${tw}: falta title`)
      tasks++
      if (t?.default_position && !posByName.has(t.default_position.trim().toLowerCase())) errors.push(`${tw}: no existe el puesto "${t.default_position}"`)
      for (const pp of t?.ping_positions ?? []) if (!posByName.has(pp.trim().toLowerCase())) errors.push(`${tw}: no existe el puesto a notificar "${pp}"`)
      if (t?.sop && !sopByTitle.has(t.sop.trim().toLowerCase())) errors.push(`${tw}: no existe el SOP "${t.sop}"`)
      ;(t?.checklist ?? []).forEach((c, k) => { if (!c?.text?.trim()) errors.push(`${tw} › checklist ${k + 1}: falta text`); items++ })
    })
  })
  const preview: TemplatePreview = {
    projectType: template?.projectType?.name?.trim() ?? "",
    phaseSet: template?.phaseSet?.name?.trim() || null,
    phases: phases.length, taskSets, tasks, checklistItems: items, errors,
  }
  return { preview, posByName, sopByTitle }
}

// dryRun: solo valida y describe lo que se crearía (no escribe nada).
// Si una escritura falla a la mitad, se borra lo que ya se había creado.
export async function importOperationsTemplate(
  jsonStr: string,
  mode: "default" | "rename" | "overwrite" = "default",
  actingProfileId?: string,
  dryRun = false,
) {
  const supabase = await opsClient(actingProfileId)

  let template: ImportTemplate
  try {
    template = JSON.parse(jsonStr) as ImportTemplate
  } catch {
    throw new Error("JSON inválido — verifica la sintaxis")
  }

  const { preview, posByName, sopByTitle } = await validateTemplate(template, supabase)
  if (dryRun) {
    const { data: same } = await supabase.from("project_types").select("id").eq("name", preview.projectType).maybeSingle()
    return { preview, nameTaken: !!same }
  }
  if (preview.errors.length) throw new Error(`La plantilla tiene errores:\n- ${preview.errors.join("\n- ")}`)

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

  // ── Crear (con deshacer si algo falla a medias) ────────────────────────────
  const created = { taskSets: [] as string[], phaseSet: null as string | null, projectType: null as string | null }
  try {
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
    created.taskSets.push(tsRow.id)

    const tasks = ts.tasks ?? []
    for (let j = 0; j < tasks.length; j++) {
      const task = tasks[j]
      const pingIds = (task.ping_positions ?? []).map((n) => posByName.get(n.trim().toLowerCase())!).filter(Boolean)
      const { data: taskRow, error: taskErr } = await supabase
        .from("task_set_tasks")
        .insert({
          task_set_id: tsRow.id,
          title: task.title,
          description: task.description ?? null,
          is_urgent: task.is_urgent ?? false,
          requires_deliverable: task.requires_deliverable ?? false,
          deliverable_instructions: task.deliverable_instructions ?? null,
          default_position_id: task.default_position ? posByName.get(task.default_position.trim().toLowerCase()) ?? null : null,
          is_pinged: pingIds.length > 0,
          ping_position_ids: pingIds.length ? pingIds : null,
          sop_id: task.sop ? sopByTitle.get(task.sop.trim().toLowerCase()) ?? null : null,
          task_order: j,
        })
        .select("id")
        .single()
      if (taskErr) throw new Error(`Error creando tarea "${task.title}": ${taskErr.message}`)

      const checklistItems = task.checklist ?? []
      if (checklistItems.length > 0 && taskRow) {
        const { error: ciErr } = await supabase.from("task_set_checklist_items").insert(
          checklistItems.map((item, k) => ({
            task_set_task_id: taskRow.id,
            text: item.text,
            is_blocking: item.is_blocking ?? false,
            item_order: k,
          }))
        )
        if (ciErr) throw new Error(`Error creando checklist de "${task.title}": ${ciErr.message}`)
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
    created.phaseSet = psRow.id

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
      color: template.projectType.color ?? null,
      icon: template.projectType.icon ?? null,
      default_phase_set_id: phaseSetId,
    })
    .select()
    .single()
  if (ptErr) throw new Error(`Error creando tipo de proyecto: ${ptErr.message}`)
  created.projectType = ptRow.id

  revalidatePath("/operations")
  revalidatePath("/projects")

  return {
    preview,
    replacedName: mode === "overwrite" ? baseName : null,
    projectType: { ...ptRow, default_phase_set_id: phaseSetId },
    phaseSet: phaseSetId
      ? { id: phaseSetId, name: template.phaseSet!.name.trim(), phases: createdPhases }
      : null,
    taskSets: createdTaskSets,
  }
  } catch (err) {
    // Deshacer: no dejar una plantilla a medias.
    if (created.projectType) await supabase.from("project_types").delete().eq("id", created.projectType)
    if (created.phaseSet) {
      await supabase.from("phase_set_phases").delete().eq("phase_set_id", created.phaseSet)
      await supabase.from("phase_sets").delete().eq("id", created.phaseSet)
    }
    if (created.taskSets.length) {
      const { data: rows } = await supabase.from("task_set_tasks").select("id").in("task_set_id", created.taskSets)
      const ids = (rows ?? []).map((r: { id: string }) => r.id)
      if (ids.length) {
        await supabase.from("task_set_checklist_items").delete().in("task_set_task_id", ids)
        await supabase.from("task_set_tasks").delete().in("id", ids)
      }
      await supabase.from("task_sets").delete().in("id", created.taskSets)
    }
    throw err
  }
}

// Exporta un tipo de proyecto completo en el mismo formato que importa.
export async function exportOperationsTemplate(projectTypeId: string, actingProfileId?: string): Promise<OperationsTemplate> {
  const supabase = await opsClient(actingProfileId)
  const { data: pt } = await supabase.from("project_types").select("*").eq("id", projectTypeId).single()
  if (!pt) throw new Error("Tipo de proyecto no encontrado")
  const [{ data: positions }, { data: sops }] = await Promise.all([
    supabase.from("positions").select("id, name"),
    supabase.from("sops").select("id, title"),
  ])
  const posName = new Map((positions ?? []).map((p) => [p.id as string, p.name as string]))
  const sopTitle = new Map((sops ?? []).map((x) => [x.id as string, x.title as string]))
  const template: OperationsTemplate = { projectType: { name: pt.name, description: pt.description ?? null, color: pt.color ?? null, icon: pt.icon ?? null }, phaseSet: null }
  if (!pt.default_phase_set_id) return template
  const { data: ps } = await supabase.from("phase_sets").select("name, phases:phase_set_phases(name, description, phase_order, default_task_set_id)").eq("id", pt.default_phase_set_id).single()
  if (!ps) return template
  const phases = ((ps.phases ?? []) as { name: string; description: string | null; phase_order: number; default_task_set_id: string | null }[]).sort((a, b) => a.phase_order - b.phase_order)
  const tsIds = phases.map((p) => p.default_task_set_id).filter(Boolean) as string[]
  const { data: taskSets } = tsIds.length
    ? await supabase.from("task_sets").select("id, name, tasks:task_set_tasks(*, checklist:task_set_checklist_items(text, is_blocking, item_order))").in("id", tsIds)
    : { data: [] }
  const tsById = new Map((taskSets ?? []).map((t) => [t.id as string, t]))
  template.phaseSet = {
    name: ps.name,
    phases: phases.map((ph) => {
      const ts = ph.default_task_set_id ? tsById.get(ph.default_task_set_id) : null
      return {
        name: ph.name,
        description: ph.description ?? null,
        taskSet: ts ? {
          name: ts.name as string,
          tasks: ((ts.tasks ?? []) as Record<string, unknown>[]).sort((a, b) => Number(a.task_order) - Number(b.task_order)).map((t) => {
            const out: ImportTask = {
              title: t.title as string,
              description: (t.description as string | null) ?? null,
              is_urgent: !!t.is_urgent,
              requires_deliverable: !!t.requires_deliverable,
            }
            if (t.deliverable_instructions) out.deliverable_instructions = t.deliverable_instructions as string
            if (t.default_position_id) out.default_position = posName.get(t.default_position_id as string) ?? null
            const ping = ((t.ping_position_ids as string[] | null) ?? []).map((id) => posName.get(id)).filter(Boolean) as string[]
            if (ping.length) out.ping_positions = ping
            if (t.sop_id) out.sop = sopTitle.get(t.sop_id as string) ?? null
            const cl = ((t.checklist ?? []) as { text: string; is_blocking: boolean; item_order: number }[]).sort((a, b) => a.item_order - b.item_order)
            if (cl.length) out.checklist = cl.map((c) => ({ text: c.text, is_blocking: c.is_blocking }))
            return out
          }),
        } : null,
      }
    }),
  }
  return template
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
      is_pinged:            task.is_pinged ?? false,
      ping_position_ids:    task.ping_position_ids ?? null,
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
export async function clonePhaseSet(phaseSetId: string, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)

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
export async function clonePhaseIntoPhaseSet(phaseId: string, targetPhaseSetId: string, afterPhaseId?: string | null, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)

  const { data: source } = await supabase
    .from("phase_set_phases").select("*").eq("id", phaseId).single()
  if (!source) throw new Error("Fase no encontrada")

  let insertOrder: number
  if (afterPhaseId) {
    const { data: anchor } = await supabase
      .from("phase_set_phases").select("phase_order").eq("id", afterPhaseId).single()
    if (anchor) {
      // Shift phases that come after the anchor point
      const { data: toShift } = await supabase
        .from("phase_set_phases").select("id, phase_order")
        .eq("phase_set_id", targetPhaseSetId)
        .gt("phase_order", (anchor as { phase_order: number }).phase_order)
      if (toShift?.length) {
        await Promise.all(toShift.map((p: { id: string; phase_order: number }) =>
          supabase.from("phase_set_phases").update({ phase_order: p.phase_order + 1 }).eq("id", p.id)
        ))
      }
      insertOrder = (anchor as { phase_order: number }).phase_order + 1
    } else {
      const { data: last } = await supabase
        .from("phase_set_phases").select("phase_order")
        .eq("phase_set_id", targetPhaseSetId)
        .order("phase_order", { ascending: false }).limit(1)
      insertOrder = last?.[0] ? (last[0] as { phase_order: number }).phase_order + 1 : 0
    }
  } else {
    const { data: last } = await supabase
      .from("phase_set_phases").select("phase_order")
      .eq("phase_set_id", targetPhaseSetId)
      .order("phase_order", { ascending: false }).limit(1)
    insertOrder = last?.[0] ? (last[0] as { phase_order: number }).phase_order + 1 : 0
  }

  const newTaskSetId = source.default_task_set_id
    ? await deepCloneTaskSet(supabase, source.default_task_set_id, source.name)
    : null

  const { data: newPhase } = await supabase.from("phase_set_phases").insert({
    phase_set_id:        targetPhaseSetId,
    name:                source.name,
    description:         source.description,
    phase_order:         insertOrder,
    default_task_set_id: newTaskSetId,
  }).select().single()
  if (!newPhase) throw new Error("Error al clonar fase")

  // Fetch the full task set (with tasks + checklist) so the caller can update UI state directly
  let taskSet = null
  if (newTaskSetId) {
    const { data: ts } = await supabase
      .from("task_sets")
      .select("*, tasks:task_set_tasks(*, checklist_items:task_set_checklist_items(*), sop:sops(*), default_position:positions(*))")
      .eq("id", newTaskSetId).single()
    if (ts) taskSet = ts
  }

  revalidatePath("/operations")
  return { phase: { ...newPhase, default_task_set_id: newTaskSetId }, taskSet }
}

/** Deep-copies a single task (+ its checklist) into a target TaskSet, optionally after a given task. */
export async function cloneTaskInTaskSet(taskId: string, targetTaskSetId: string, afterTaskId?: string | null, actingProfileId?: string) {
  const supabase = await opsClient(actingProfileId)

  const { data: source } = await supabase
    .from("task_set_tasks")
    .select("*, checklist_items:task_set_checklist_items(*)")
    .eq("id", taskId).single()
  if (!source) throw new Error("Tarea no encontrada")

  let insertOrder: number
  if (afterTaskId) {
    const { data: anchor } = await supabase
      .from("task_set_tasks").select("task_order").eq("id", afterTaskId).single()
    if (anchor) {
      const { data: toShift } = await supabase
        .from("task_set_tasks").select("id, task_order")
        .eq("task_set_id", targetTaskSetId)
        .gt("task_order", (anchor as { task_order: number }).task_order)
      if (toShift?.length) {
        await Promise.all(toShift.map((t: { id: string; task_order: number }) =>
          supabase.from("task_set_tasks").update({ task_order: t.task_order + 1 }).eq("id", t.id)
        ))
      }
      insertOrder = (anchor as { task_order: number }).task_order + 1
    } else {
      const { data: last } = await supabase
        .from("task_set_tasks").select("task_order").eq("task_set_id", targetTaskSetId)
        .order("task_order", { ascending: false }).limit(1)
      insertOrder = last?.[0] ? (last[0] as { task_order: number }).task_order + 1 : 0
    }
  } else {
    const { data: last } = await supabase
      .from("task_set_tasks").select("task_order").eq("task_set_id", targetTaskSetId)
      .order("task_order", { ascending: false }).limit(1)
    insertOrder = last?.[0] ? (last[0] as { task_order: number }).task_order + 1 : 0
  }

  const { data: newTask } = await supabase.from("task_set_tasks").insert({
    task_set_id:          targetTaskSetId,
    title:                source.title,
    description:          source.description,
    task_order:           insertOrder,
    is_urgent:            source.is_urgent ?? false,
    is_pinged:            source.is_pinged ?? false,
    ping_position_ids:    source.ping_position_ids ?? null,
    requires_deliverable: source.requires_deliverable ?? false,
    sop_id:               source.sop_id ?? null,
    default_position_id:  source.default_position_id ?? null,
  }).select("*, sop:sops(*), default_position:positions(*)").single()
  if (!newTask) throw new Error("Error al clonar tarea")

  const checklistItems: unknown[] = []
  if ((source.checklist_items as unknown[])?.length) {
    const { data: inserted } = await supabase.from("task_set_checklist_items").insert(
      (source.checklist_items as { text: string; is_blocking: boolean; item_order: number }[]).map((ci) => ({
        task_set_task_id: newTask.id,
        text:             ci.text,
        is_blocking:      ci.is_blocking,
        item_order:       ci.item_order,
      }))
    ).select()
    if (inserted) checklistItems.push(...inserted)
  }

  revalidatePath("/operations")
  return { ...newTask, checklist_items: checklistItems }
}
