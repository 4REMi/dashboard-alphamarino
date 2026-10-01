import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  createProjectType, updateProjectType, deleteProjectType, linkPhaseSetToProjectType,
  createPhaseSet, updatePhaseSet, deletePhaseSet, clonePhaseSet,
  addPhaseToSet, updatePhaseInSet, deletePhaseFromSet, reorderPhaseInSet, linkTaskSetToPhase, clonePhaseIntoPhaseSet,
  createTaskSet, updateTaskSet, deleteTaskSet,
  addTaskToSet, updateTaskInSet, deleteTaskFromSet, reorderTasksInSet, cloneTaskInTaskSet,
  addChecklistItemToSetTask, updateSetTaskChecklistItem, deleteSetTaskChecklistItem, reorderSetTaskChecklistItems,
  createPosition, updatePosition, deletePosition,
} from "@/lib/actions/config"

// Herramientas MCP de Operations (solo PLANTILLAS): tipos de proyecto, sets
// de fases, fases, sets de tareas, tareas plantilla (con su checklist,
// puesto responsable, puestos a notificar y SOP) y puestos.
//
// Reglas (ver docs/agent-guides/mcp-server.md):
// - Solo admin, igual que /operations. Las acciones de escritura lo vuelven
//   a checar (opsClient en lib/actions/config.ts); las de lectura aquí.
// - Todo se resuelve por NOMBRE; 0 o 2+ coincidencias → error con opciones.
// - Borrar nunca es directo: sin `confirmar: true` solo describe el impacto.
// - Editar respeta lo que no se manda (las acciones reescriben el registro
//   completo, así que aquí se completa con los valores actuales).

interface ToolCtx { http?: { authInfo?: AuthInfo } }

async function requireAdmin(ctx: ToolCtx): Promise<string> {
  const profileId = ctx.http?.authInfo?.extra?.profileId
  if (typeof profileId !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await createAdminClient().from("profiles").select("role").eq("id", profileId).single()
  if (data?.role !== "admin") throw new Error("Solo un admin puede usar las herramientas de Operations")
  return profileId
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })

type Row = { id: string; [k: string]: unknown }

// Coincidencia exacta (sin mayúsculas) primero; si no, parcial. Nunca adivina.
function pick<T extends Row>(rows: T[], query: string, label: string, field = "name"): T {
  const q = query.trim().toLowerCase()
  const val = (r: T) => String(r[field] ?? "").toLowerCase()
  const exact = rows.filter((r) => val(r) === q)
  if (exact.length === 1) return exact[0]
  const partial = rows.filter((r) => val(r).includes(q))
  if (partial.length === 1) return partial[0]
  if (partial.length === 0) {
    const opts = rows.slice(0, 15).map((r) => String(r[field])).join(", ")
    throw new Error(`No encontré ${label} "${query}".${opts ? ` Opciones: ${opts}` : ""}`)
  }
  throw new Error(`"${query}" coincide con varios (${label}): ${partial.map((r) => String(r[field])).join(", ")}. Sé más específico.`)
}

const db = () => createAdminClient()
async function all<T extends Row>(table: string, cols = "*", filter?: [string, string]): Promise<T[]> {
  let q = db().from(table).select(cols)
  if (filter) q = q.eq(filter[0], filter[1])
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as T[]
}

const findProjectType = async (n: string) => pick(await all("project_types"), n, "tipo de proyecto")
const findPhaseSet = async (n: string) => pick(await all("phase_sets"), n, "set de fases")
const findTaskSet = async (n: string) => pick(await all("task_sets"), n, "set de tareas")
const findPosition = async (n: string) => pick(await all("positions"), n, "puesto")
const findSop = async (n: string) => pick(await all("sops", "id, title"), n, "SOP", "title")
async function findPhase(setId: string, n: string) {
  const rows = (await all<Row & { phase_order: number }>("phase_set_phases", "*", ["phase_set_id", setId])).sort((a, b) => a.phase_order - b.phase_order)
  if (/^\d+$/.test(n.trim())) { const r = rows[Number(n) - 1]; if (!r) throw new Error(`No hay fase #${n}`); return r }
  return pick(rows, n, "fase")
}
async function findTask(setId: string, n: string) {
  const rows = (await all<Row & { task_order: number }>("task_set_tasks", "*", ["task_set_id", setId])).sort((a, b) => a.task_order - b.task_order)
  if (/^\d+$/.test(n.trim())) { const r = rows[Number(n) - 1]; if (!r) throw new Error(`No hay tarea #${n}`); return r }
  return pick(rows, n, "tarea", "title")
}
async function findItem(taskId: string, n: string) {
  const rows = (await all<Row & { item_order: number }>("task_set_checklist_items", "*", ["task_set_task_id", taskId])).sort((a, b) => a.item_order - b.item_order)
  if (/^\d+$/.test(n.trim())) { const r = rows[Number(n) - 1]; if (!r) throw new Error(`No hay elemento #${n} en el checklist`); return r }
  return pick(rows, n, "elemento del checklist", "text")
}

const NONE = /^(ninguno|ninguna|none|sin|quitar)$/i
const fd = (o: Record<string, string | string[] | null | undefined>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x))
    else if (v !== null && v !== undefined) f.set(k, v)
  }
  return f
}
// Mueve un id a la posición (1-based) dentro de una lista ordenada.
function moveTo(ids: string[], id: string, pos: number): string[] {
  const rest = ids.filter((x) => x !== id)
  rest.splice(Math.max(0, Math.min(rest.length, pos - 1)), 0, id)
  return rest
}
const needConfirm = (what: string) => text(`⚠️ Esto va a borrar ${what}. No se puede deshacer. Si el usuario lo confirma, vuelve a llamar con confirmar: true.`)

export function registerOperationsTools(server: McpServer) {
  // ── Lectura ────────────────────────────────────────────────────────
  server.registerTool(
    "ops_ver_plantillas",
    {
      title: "Ver plantillas de Operations",
      description: "Sin parámetros: lista tipos de proyecto, sets de fases, sets de tareas y puestos. Con tipo_proyecto o set_fases: árbol completo (fases → set de tareas). Con set_tareas: cada tarea plantilla con puesto, notificaciones, SOP, entregable y checklist numerado. Solo admin.",
      inputSchema: z.object({
        tipo_proyecto: z.string().optional(),
        set_fases: z.string().optional(),
        set_tareas: z.string().optional(),
      }),
    },
    async ({ tipo_proyecto, set_fases, set_tareas }, ctx: ToolCtx) => {
      await requireAdmin(ctx)
      const positions = await all<Row & { name: string }>("positions")
      const posName = new Map(positions.map((p) => [p.id, p.name]))

      if (set_tareas) {
        const ts = await findTaskSet(set_tareas)
        const { data: tasks } = await db().from("task_set_tasks")
          .select("*, sop:sops(title), checklist:task_set_checklist_items(text, is_blocking, item_order)")
          .eq("task_set_id", ts.id).order("task_order")
        const lines = [`Set de tareas "${ts.name}"${ts.description ? ` — ${ts.description}` : ""}`]
        ;(tasks ?? []).forEach((t, i) => {
          const flags = [t.is_urgent && "urgente", t.requires_deliverable && `entregable${t.deliverable_instructions ? `: ${t.deliverable_instructions}` : ""}`].filter(Boolean)
          lines.push(`\n${i + 1}. ${t.title}${flags.length ? ` [${flags.join(" · ")}]` : ""}`)
          if (t.description) lines.push(`   ${t.description}`)
          lines.push(`   Puesto responsable: ${t.default_position_id ? posName.get(t.default_position_id) : "—"}`
            + `${(t.ping_position_ids ?? []).length ? ` · Notifica a: ${(t.ping_position_ids as string[]).map((id) => posName.get(id)).join(", ")}` : ""}`
            + `${t.sop ? ` · SOP: ${(t.sop as { title: string }).title}` : ""}`)
          const items = ((t.checklist ?? []) as { text: string; is_blocking: boolean; item_order: number }[]).sort((a, b) => a.item_order - b.item_order)
          items.forEach((c, j) => lines.push(`   ${i + 1}.${j + 1} ${c.is_blocking ? "🔒 " : ""}${c.text}`))
        })
        return text(lines.join("\n"))
      }

      if (tipo_proyecto || set_fases) {
        let ps: Row
        let header = ""
        if (tipo_proyecto) {
          const pt = await findProjectType(tipo_proyecto)
          header = `Tipo de proyecto "${pt.name}"${pt.description ? ` — ${pt.description}` : ""}\n`
          if (!pt.default_phase_set_id) return text(header + "Sin set de fases vinculado.")
          ps = (await all("phase_sets", "*", ["id", pt.default_phase_set_id as string]))[0]
        } else ps = await findPhaseSet(set_fases!)
        const [phases, taskSets] = await Promise.all([
          all<Row & { phase_order: number; name: string; description: string | null; default_task_set_id: string | null }>("phase_set_phases", "*", ["phase_set_id", ps.id]),
          all<Row & { name: string }>("task_sets"),
        ])
        const tsName = new Map(taskSets.map((t) => [t.id, t.name]))
        const lines = [header + `Set de fases "${ps.name}"`]
        phases.sort((a, b) => a.phase_order - b.phase_order).forEach((ph, i) =>
          lines.push(`${i + 1}. ${ph.name}${ph.description ? ` — ${ph.description}` : ""}\n   Set de tareas: ${ph.default_task_set_id ? tsName.get(ph.default_task_set_id) : "—"}`))
        return text(lines.join("\n"))
      }

      const [types, phaseSets, taskSets] = await Promise.all([all<Row & { name: string; default_phase_set_id: string | null }>("project_types"), all<Row & { name: string }>("phase_sets"), all<Row & { name: string }>("task_sets")])
      const psName = new Map(phaseSets.map((p) => [p.id, p.name]))
      return text([
        `Tipos de proyecto:\n${types.map((t) => `- ${t.name} → ${t.default_phase_set_id ? psName.get(t.default_phase_set_id) : "sin set de fases"}`).join("\n") || "—"}`,
        `Sets de fases:\n${phaseSets.map((p) => `- ${p.name}`).join("\n") || "—"}`,
        `Sets de tareas:\n${taskSets.map((t) => `- ${t.name}`).join("\n") || "—"}`,
        `Puestos:\n${positions.map((p) => `- ${p.name}`).join("\n") || "—"}`,
      ].join("\n\n"))
    },
  )

  // ── Tipos de proyecto ──────────────────────────────────────────────
  server.registerTool(
    "ops_tipo_proyecto",
    {
      title: "Crear/editar/borrar un tipo de proyecto",
      description: "accion: crear | editar | borrar. En editar solo cambia lo que mandes. set_fases vincula el set de fases por default ('ninguno' para desvincular). Solo admin.",
      inputSchema: z.object({
        accion: z.enum(["crear", "editar", "borrar"]),
        nombre: z.string().min(1).describe("Nombre del tipo (el actual, si es editar/borrar)"),
        nuevo_nombre: z.string().optional(),
        descripcion: z.string().optional(),
        color: z.string().optional().describe("Hex, ej. #2563eb"),
        icono: z.string().optional(),
        set_fases: z.string().optional(),
        confirmar: z.boolean().optional(),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const me = await requireAdmin(ctx)
      if (a.accion === "crear") {
        const created = await createProjectType(fd({ name: a.nombre, description: a.descripcion, color: a.color, icon: a.icono }), me)
        if (a.set_fases && !NONE.test(a.set_fases)) await linkPhaseSetToProjectType(created.id, (await findPhaseSet(a.set_fases)).id, me)
        return text(`Tipo de proyecto "${a.nombre}" creado.`)
      }
      const pt = await findProjectType(a.nombre)
      if (a.accion === "borrar") {
        if (!a.confirmar) return needConfirm(`el tipo de proyecto "${pt.name}"`)
        await deleteProjectType(pt.id, me)
        return text(`Tipo de proyecto "${pt.name}" borrado.`)
      }
      const phaseSetId = a.set_fases === undefined ? (pt.default_phase_set_id as string | null) : NONE.test(a.set_fases) ? null : (await findPhaseSet(a.set_fases)).id
      await updateProjectType(pt.id, fd({
        name: a.nuevo_nombre ?? (pt.name as string), description: a.descripcion ?? (pt.description as string | null),
        default_phase_set_id: phaseSetId ?? "none", color: a.color ?? (pt.color as string | null), icon: a.icono ?? (pt.icon as string | null),
      }), me)
      return text(`Tipo de proyecto "${a.nuevo_nombre ?? pt.name}" actualizado.`)
    },
  )

  // ── Sets de fases ──────────────────────────────────────────────────
  server.registerTool(
    "ops_set_fases",
    {
      title: "Crear/renombrar/clonar/borrar un set de fases",
      description: "accion: crear | renombrar | clonar | borrar. tipo_proyecto (opcional) lo asocia a un tipo. Solo admin.",
      inputSchema: z.object({
        accion: z.enum(["crear", "renombrar", "clonar", "borrar"]),
        nombre: z.string().min(1),
        nuevo_nombre: z.string().optional(),
        tipo_proyecto: z.string().optional(),
        confirmar: z.boolean().optional(),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const me = await requireAdmin(ctx)
      const ptId = a.tipo_proyecto ? (NONE.test(a.tipo_proyecto) ? "none" : (await findProjectType(a.tipo_proyecto)).id) : undefined
      if (a.accion === "crear") {
        await createPhaseSet(fd({ name: a.nombre, project_type_id: ptId }), me)
        return text(`Set de fases "${a.nombre}" creado. Agrega fases con ops_fase.`)
      }
      const ps = await findPhaseSet(a.nombre)
      if (a.accion === "clonar") { await clonePhaseSet(ps.id, me); return text(`Set de fases "${ps.name}" clonado como "${ps.name} (copia)".`) }
      if (a.accion === "borrar") {
        const phases = await all("phase_set_phases", "id", ["phase_set_id", ps.id])
        if (!a.confirmar) return needConfirm(`el set de fases "${ps.name}" y sus ${phases.length} fases (los sets de tareas vinculados no se borran)`)
        await deletePhaseSet(ps.id, me)
        return text(`Set de fases "${ps.name}" borrado.`)
      }
      await updatePhaseSet(ps.id, fd({ name: a.nuevo_nombre ?? (ps.name as string), project_type_id: ptId ?? (ps.project_type_id as string | null) ?? "none" }), me)
      return text(`Set de fases actualizado: "${a.nuevo_nombre ?? ps.name}".`)
    },
  )

  // ── Fases dentro de un set ─────────────────────────────────────────
  server.registerTool(
    "ops_fase",
    {
      title: "Agregar/editar/mover/clonar/borrar una fase de un set",
      description: "accion: agregar | editar | mover | clonar | borrar. fase = nombre o número (1 = primera). set_tareas vincula el set de tareas que se aplica al crear la fase en un proyecto ('ninguno' para quitar). mover usa posicion (1-based). clonar copia la fase a destino_set_fases. Solo admin.",
      inputSchema: z.object({
        accion: z.enum(["agregar", "editar", "mover", "clonar", "borrar"]),
        set_fases: z.string().min(1),
        fase: z.string().optional().describe("Nombre o número de la fase (no aplica en agregar)"),
        nombre: z.string().optional().describe("Nombre de la fase nueva, o nuevo nombre al editar"),
        descripcion: z.string().optional(),
        set_tareas: z.string().optional(),
        posicion: z.number().int().min(1).optional(),
        destino_set_fases: z.string().optional(),
        confirmar: z.boolean().optional(),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const me = await requireAdmin(ctx)
      const ps = await findPhaseSet(a.set_fases)
      const tsId = a.set_tareas === undefined ? undefined : NONE.test(a.set_tareas) ? null : (await findTaskSet(a.set_tareas)).id
      const ordered = async () => (await all<Row & { phase_order: number }>("phase_set_phases", "id, phase_order", ["phase_set_id", ps.id])).sort((x, y) => x.phase_order - y.phase_order).map((r) => r.id)

      if (a.accion === "agregar") {
        if (!a.nombre) throw new Error("Falta el nombre de la fase")
        const created = await addPhaseToSet(ps.id, fd({ name: a.nombre, description: a.descripcion }), me)
        if (tsId) await linkTaskSetToPhase(created.id, tsId, me)
        if (a.posicion) await reorderPhaseInSet(ps.id, moveTo(await ordered(), created.id, a.posicion), me)
        return text(`Fase "${a.nombre}" agregada a "${ps.name}".`)
      }
      if (!a.fase) throw new Error("Indica la fase (nombre o número)")
      const ph = await findPhase(ps.id, a.fase)
      if (a.accion === "borrar") {
        if (!a.confirmar) return needConfirm(`la fase "${ph.name}" del set "${ps.name}" (su set de tareas no se borra)`)
        await deletePhaseFromSet(ph.id, me)
        return text(`Fase "${ph.name}" borrada.`)
      }
      if (a.accion === "mover") {
        if (!a.posicion) throw new Error("Indica la posición (1 = primera)")
        await reorderPhaseInSet(ps.id, moveTo(await ordered(), ph.id, a.posicion), me)
        return text(`Fase "${ph.name}" movida a la posición ${a.posicion}.`)
      }
      if (a.accion === "clonar") {
        const dest = a.destino_set_fases ? await findPhaseSet(a.destino_set_fases) : ps
        await clonePhaseIntoPhaseSet(ph.id, dest.id, null, me)
        return text(`Fase "${ph.name}" clonada en "${dest.name}".`)
      }
      if (a.nombre !== undefined || a.descripcion !== undefined) {
        await updatePhaseInSet(ph.id, fd({ name: a.nombre ?? (ph.name as string), description: a.descripcion ?? (ph.description as string | null) }), me)
      }
      if (tsId !== undefined) await linkTaskSetToPhase(ph.id, tsId, me)
      return text(`Fase "${a.nombre ?? ph.name}" actualizada.`)
    },
  )

  // ── Sets de tareas ─────────────────────────────────────────────────
  server.registerTool(
    "ops_set_tareas",
    {
      title: "Crear/editar/borrar un set de tareas",
      description: "accion: crear | editar | borrar. Las tareas se manejan con ops_tarea_plantilla. Solo admin.",
      inputSchema: z.object({
        accion: z.enum(["crear", "editar", "borrar"]),
        nombre: z.string().min(1),
        nuevo_nombre: z.string().optional(),
        descripcion: z.string().optional(),
        confirmar: z.boolean().optional(),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const me = await requireAdmin(ctx)
      if (a.accion === "crear") {
        await createTaskSet(fd({ name: a.nombre, description: a.descripcion }), me)
        return text(`Set de tareas "${a.nombre}" creado.`)
      }
      const ts = await findTaskSet(a.nombre)
      if (a.accion === "borrar") {
        const tasks = await all("task_set_tasks", "id", ["task_set_id", ts.id])
        if (!a.confirmar) return needConfirm(`el set de tareas "${ts.name}" con sus ${tasks.length} tareas plantilla y sus checklists`)
        await deleteTaskSet(ts.id, me)
        return text(`Set de tareas "${ts.name}" borrado.`)
      }
      await updateTaskSet(ts.id, fd({ name: a.nuevo_nombre ?? (ts.name as string), description: a.descripcion ?? (ts.description as string | null) }), me)
      return text(`Set de tareas "${a.nuevo_nombre ?? ts.name}" actualizado.`)
    },
  )

  // ── Tareas plantilla ───────────────────────────────────────────────
  server.registerTool(
    "ops_tarea_plantilla",
    {
      title: "Agregar/editar/mover/clonar/borrar una tarea plantilla",
      description: "accion: agregar | editar | mover | clonar | borrar. tarea = título o número. En editar solo cambia lo que mandes. puesto = puesto responsable (actor) por default ('ninguno' para quitar). notificar_puestos = puestos a los que se avisa (lista; [] para ninguno). sop = título del SOP ('ninguno' para quitar). clonar copia la tarea (con su checklist) a destino_set_tareas. Solo admin.",
      inputSchema: z.object({
        accion: z.enum(["agregar", "editar", "mover", "clonar", "borrar"]),
        set_tareas: z.string().min(1),
        tarea: z.string().optional(),
        titulo: z.string().optional(),
        descripcion: z.string().optional(),
        urgente: z.boolean().optional(),
        requiere_entregable: z.boolean().optional(),
        instrucciones_entregable: z.string().optional(),
        puesto: z.string().optional(),
        notificar_puestos: z.array(z.string()).optional(),
        sop: z.string().optional(),
        posicion: z.number().int().min(1).optional(),
        destino_set_tareas: z.string().optional(),
        confirmar: z.boolean().optional(),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const me = await requireAdmin(ctx)
      const ts = await findTaskSet(a.set_tareas)
      const ordered = async () => (await all<Row & { task_order: number }>("task_set_tasks", "id, task_order", ["task_set_id", ts.id])).sort((x, y) => x.task_order - y.task_order).map((r) => r.id)
      const positionId = a.puesto === undefined ? undefined : NONE.test(a.puesto) ? "none" : (await findPosition(a.puesto)).id
      const pingIds = a.notificar_puestos === undefined ? undefined : await Promise.all(a.notificar_puestos.map(async (n) => (await findPosition(n)).id))
      const sopId = a.sop === undefined ? undefined : NONE.test(a.sop) ? "" : (await findSop(a.sop)).id

      if (a.accion === "agregar") {
        if (!a.titulo) throw new Error("Falta el título de la tarea")
        const created = await addTaskToSet(ts.id, fd({
          title: a.titulo, description: a.descripcion, is_urgent: String(!!a.urgente), is_pinged: String(!!pingIds?.length),
          ping_position_ids: pingIds ?? [], requires_deliverable: String(!!a.requiere_entregable),
          deliverable_instructions: a.instrucciones_entregable, default_position_id: positionId ?? "none",
        }), me)
        if (sopId) await updateTaskInSet(created.id, fd({
          title: a.titulo, description: a.descripcion, is_urgent: String(!!a.urgente), is_pinged: String(!!pingIds?.length),
          ping_position_ids: pingIds ?? [], requires_deliverable: String(!!a.requiere_entregable),
          deliverable_instructions: a.instrucciones_entregable, default_position_id: positionId ?? "none", sop_id: sopId,
        }), me)
        if (a.posicion) await reorderTasksInSet(ts.id, moveTo(await ordered(), created.id, a.posicion), me)
        return text(`Tarea "${a.titulo}" agregada a "${ts.name}". Agrega su checklist con ops_checklist.`)
      }
      if (!a.tarea) throw new Error("Indica la tarea (título o número)")
      const t = await findTask(ts.id, a.tarea)
      if (a.accion === "borrar") {
        const items = await all("task_set_checklist_items", "id", ["task_set_task_id", t.id])
        if (!a.confirmar) return needConfirm(`la tarea plantilla "${t.title}" de "${ts.name}" y su checklist (${items.length} elementos). Los proyectos ya creados no cambian`)
        await deleteTaskFromSet(t.id, me)
        return text(`Tarea "${t.title}" borrada.`)
      }
      if (a.accion === "mover") {
        if (!a.posicion) throw new Error("Indica la posición (1 = primera)")
        await reorderTasksInSet(ts.id, moveTo(await ordered(), t.id, a.posicion), me)
        return text(`Tarea "${t.title}" movida a la posición ${a.posicion}.`)
      }
      if (a.accion === "clonar") {
        const dest = a.destino_set_tareas ? await findTaskSet(a.destino_set_tareas) : ts
        await cloneTaskInTaskSet(t.id, dest.id, null, me)
        return text(`Tarea "${t.title}" clonada (con su checklist) en "${dest.name}".`)
      }
      // editar: se completa con los valores actuales lo que no se mandó.
      const curPing = (t.ping_position_ids as string[] | null) ?? []
      const nextPing = pingIds ?? curPing
      await updateTaskInSet(t.id, fd({
        title: a.titulo ?? (t.title as string),
        description: a.descripcion ?? (t.description as string | null),
        is_urgent: String(a.urgente ?? !!t.is_urgent),
        is_pinged: String(pingIds !== undefined ? pingIds.length > 0 : !!t.is_pinged),
        ping_position_ids: nextPing,
        requires_deliverable: String(a.requiere_entregable ?? !!t.requires_deliverable),
        deliverable_instructions: a.instrucciones_entregable ?? (t.deliverable_instructions as string | null),
        sop_id: sopId !== undefined ? sopId : ((t.sop_id as string | null) ?? ""),
        default_position_id: positionId ?? ((t.default_position_id as string | null) ?? "none"),
      }), me)
      if (a.posicion) await reorderTasksInSet(ts.id, moveTo(await ordered(), t.id, a.posicion), me)
      return text(`Tarea "${a.titulo ?? t.title}" actualizada.`)
    },
  )

  // ── Checklist de una tarea plantilla ───────────────────────────────
  server.registerTool(
    "ops_checklist",
    {
      title: "Agregar/editar/mover/borrar elementos del checklist de una tarea plantilla",
      description: "accion: agregar | editar | mover | borrar. tarea = título o número dentro del set. item = texto (parcial) o número del elemento. Para agregar varios a la vez usa elementos (lista de textos). bloqueante = la tarea no se puede cerrar sin él. Solo admin.",
      inputSchema: z.object({
        accion: z.enum(["agregar", "editar", "mover", "borrar"]),
        set_tareas: z.string().min(1),
        tarea: z.string().min(1),
        item: z.string().optional(),
        texto: z.string().optional(),
        elementos: z.array(z.string()).optional(),
        bloqueante: z.boolean().optional(),
        posicion: z.number().int().min(1).optional(),
        confirmar: z.boolean().optional(),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const me = await requireAdmin(ctx)
      const ts = await findTaskSet(a.set_tareas)
      const t = await findTask(ts.id, a.tarea)
      const ordered = async () => (await all<Row & { item_order: number }>("task_set_checklist_items", "id, item_order", ["task_set_task_id", t.id])).sort((x, y) => x.item_order - y.item_order).map((r) => r.id)

      if (a.accion === "agregar") {
        const texts = a.elementos?.length ? a.elementos : a.texto ? [a.texto] : []
        if (!texts.length) throw new Error("Falta el texto (texto o elementos)")
        let lastId = ""
        for (const tx of texts) lastId = (await addChecklistItemToSetTask(t.id, tx, !!a.bloqueante, me)).id
        if (a.posicion && texts.length === 1) await reorderSetTaskChecklistItems(t.id, moveTo(await ordered(), lastId, a.posicion), me)
        return text(`${texts.length} elemento${texts.length === 1 ? "" : "s"} agregado${texts.length === 1 ? "" : "s"} al checklist de "${t.title}".`)
      }
      if (!a.item) throw new Error("Indica el elemento (texto o número)")
      const it = await findItem(t.id, a.item)
      if (a.accion === "borrar") {
        if (!a.confirmar) return needConfirm(`"${it.text}" del checklist de "${t.title}"`)
        await deleteSetTaskChecklistItem(it.id, me)
        return text(`Elemento borrado del checklist de "${t.title}".`)
      }
      if (a.accion === "mover") {
        if (!a.posicion) throw new Error("Indica la posición (1 = primero)")
        await reorderSetTaskChecklistItems(t.id, moveTo(await ordered(), it.id, a.posicion), me)
        return text(`"${it.text}" movido a la posición ${a.posicion}.`)
      }
      const fields: { text?: string; is_blocking?: boolean } = {}
      if (a.texto !== undefined) fields.text = a.texto
      if (a.bloqueante !== undefined) fields.is_blocking = a.bloqueante
      if (!Object.keys(fields).length) throw new Error("Nada que cambiar (manda texto y/o bloqueante)")
      await updateSetTaskChecklistItem(it.id, fields, me)
      return text(`Elemento del checklist actualizado.`)
    },
  )

  // ── Puestos (actores) ──────────────────────────────────────────────
  server.registerTool(
    "ops_puesto",
    {
      title: "Crear/renombrar/borrar un puesto",
      description: "accion: crear | renombrar | borrar. Los puestos son los actores responsables por default de las tareas plantilla. Solo admin.",
      inputSchema: z.object({
        accion: z.enum(["crear", "renombrar", "borrar"]),
        nombre: z.string().min(1),
        nuevo_nombre: z.string().optional(),
        confirmar: z.boolean().optional(),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const me = await requireAdmin(ctx)
      if (a.accion === "crear") { await createPosition(a.nombre, me); return text(`Puesto "${a.nombre}" creado.`) }
      const p = await findPosition(a.nombre)
      if (a.accion === "borrar") {
        const used = await all("task_set_tasks", "id", ["default_position_id", p.id])
        if (!a.confirmar) return needConfirm(`el puesto "${p.name}"${used.length ? ` (es responsable de ${used.length} tareas plantilla, que quedarán sin puesto)` : ""}`)
        await deletePosition(p.id, me)
        return text(`Puesto "${p.name}" borrado.`)
      }
      if (!a.nuevo_nombre) throw new Error("Falta nuevo_nombre")
      await updatePosition(p.id, a.nuevo_nombre, me)
      return text(`Puesto renombrado a "${a.nuevo_nombre}".`)
    },
  )
}
