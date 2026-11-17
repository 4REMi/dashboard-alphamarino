import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveProject } from "@/lib/mcp/resolve-project"
import { can } from "@/lib/permissions"
import { updateTask, updateTaskAssignee, updateTaskStatus, deleteTask, createChecklistItem, updateChecklistItem, deleteChecklistItem, toggleChecklistItem } from "@/lib/actions/tasks"
import { planChecklist, statusFromChecklist, type ChecklistItemRow, type ChecklistOp } from "@/lib/tasks/checklist-plan"

// Tareas desde el MCP:
// - detalle_tarea: una tarea con TODO su detalle (solo lectura).
// - editar_tarea: cambia campos y checklist de una tarea ya creada.
// - eliminar_tarea: borra una tarea (solo admin, como en el dashboard).
// Visibilidad igual que el dashboard (RLS de tasks, 001_initial_schema.sql):
// admin/subadmin ven todo; un empleado solo tareas de proyectos donde es
// miembro o asignadas a él; las tareas personales solo las ve su dueño.
// Las escrituras pasan por las server actions reales (con actingProfileId, que
// revisan manage_tasks) y van en dos pasos (confirmar).

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()

const STATUS: Record<string, string> = { Todo: "Por hacer", "In Progress": "En progreso", Done: "Completada" }
const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" }) : "—"
const todayMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })

type TaskRow = {
  id: string; title: string; description: string | null; status: string; due_date: string | null
  created_at: string; updated_at?: string | null; completed_at?: string | null
  is_personal: boolean; is_pinged: boolean; ping_recipient_ids: string[] | null
  requires_deliverable: boolean; deliverable_instructions: string | null
  assignee_id: string | null; project_id: string | null; assignment_flag?: string | null
  project: { name: string } | null; phase: { name: string } | null
  assignee: { full_name: string } | null; position: { name: string } | null
  sop: { title: string; doc_url: string | null; video_url: string | null } | null
  task_set_task: { sop: { title: string; doc_url: string | null; video_url: string | null } | null } | null
}

const TASK_SELECT = `
  id, title, description, status, due_date, created_at, updated_at, completed_at,
  is_personal, is_pinged, ping_recipient_ids, requires_deliverable, deliverable_instructions,
  assignee_id, project_id, assignment_flag,
  project:projects(name), phase:project_phases(name),
  assignee:profiles!tasks_assignee_id_fkey(full_name), position:positions(name),
  sop:sops(title, doc_url, video_url),
  task_set_task:task_set_tasks(sop:sops(title, doc_url, video_url))
`

interface Caller { id: string; role: string | null; isManager: boolean; canManageTasks: boolean }
async function getCaller(ctx: ToolCtx): Promise<Caller> {
  const id = ctx.http?.authInfo?.extra?.profileId
  if (typeof id !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("role, permissions").eq("id", id).single()
  return {
    id,
    role: data?.role ?? null,
    isManager: data?.role === "admin" || data?.role === "subadmin",
    // Mismo permiso que revisan las acciones (requireTaskPermission).
    canManageTasks: !!data && can(data as never, "manage_tasks"),
  }
}

// Tareas que coinciden Y que el que llama puede ver (como la RLS del
// dashboard). La coincidencia exacta del título gana a las parciales.
async function findVisibleTasks(a: { titulo: string; proyecto?: string; tarea_id?: string }, caller: Caller): Promise<TaskRow[]> {
  let q = db().from("tasks").select(TASK_SELECT)
  if (a.tarea_id) q = q.eq("id", a.tarea_id)
  else q = q.ilike("title", `%${a.titulo.trim()}%`)
  if (a.proyecto?.trim()) q = q.eq("project_id", (await resolveProject(a.proyecto)).id)
  const { data, error } = await q.order("created_at", { ascending: false }).limit(40)
  if (error) throw new Error(error.message)

  let memberOf = new Set<string>()
  if (!caller.isManager) {
    const { data: m } = await db().from("project_members").select("project_id").eq("profile_id", caller.id)
    memberOf = new Set((m ?? []).map((r) => r.project_id as string))
  }
  const rows = ((data ?? []) as unknown as TaskRow[]).filter((t) => {
    if (t.is_personal && t.assignee_id !== caller.id) return false
    if (caller.isManager) return true
    return t.assignee_id === caller.id || (!!t.project_id && memberOf.has(t.project_id))
  })
  if (!rows.length) throw new Error(`No encontré una tarea que coincida con "${a.titulo}"${a.proyecto ? ` en ${a.proyecto}` : ""} (o no la puedes ver).`)
  const exact = rows.filter((t) => t.title.trim().toLowerCase() === a.titulo.trim().toLowerCase())
  return exact.length && !a.tarea_id ? exact : rows
}

const ambiguousList = (titulo: string, hits: TaskRow[]) =>
  `"${titulo}" coincide con ${hits.length} tareas; dime cuál (o usa proyecto / tarea_id):\n` +
  hits.slice(0, 15).map((t) => `- ${t.title} · ${t.project?.name ?? "personal"} · ${STATUS[t.status] ?? t.status} · vence ${fmt(t.due_date)} · tarea_id ${t.id}`).join("\n") +
  (hits.length > 15 ? `\n… y ${hits.length - 15} más` : "")

// Para escribir: una sola tarea, o error con la lista (nunca se edita "la primera").
async function resolveOneTask(a: { titulo: string; proyecto?: string; tarea_id?: string }, caller: Caller): Promise<TaskRow> {
  const hits = await findVisibleTasks(a, caller)
  if (hits.length > 1) throw new Error(ambiguousList(a.titulo, hits))
  return hits[0]
}

// Persona por nombre (exacto antes que parcial); "yo" = quien llama.
async function resolvePerson(name: string, callerId: string): Promise<{ id: string; full_name: string }> {
  const q = name.trim()
  if (/^(yo|m[ií]|a m[ií])$/i.test(q)) {
    const { data } = await db().from("profiles").select("id, full_name").eq("id", callerId).single()
    return data as { id: string; full_name: string }
  }
  const { data } = await db().from("profiles").select("id, full_name").ilike("full_name", `%${q}%`).limit(10)
  const rows = data ?? []
  const exact = rows.filter((r) => r.full_name.trim().toLowerCase() === q.toLowerCase())
  const hits = exact.length ? exact : rows
  if (!hits.length) throw new Error(`No encontré a nadie del equipo llamado "${name}".`)
  if (hits.length > 1) throw new Error(`"${name}" coincide con varias personas: ${hits.map((h) => h.full_name).join(", ")}. Sé más específico.`)
  return hits[0]
}

const ESTADO = { por_hacer: "Todo", en_progreso: "In Progress", completada: "Done" } as const
const NONE = /^(ninguna|ninguno|nadie|sin asignar|sin fecha|quitar|null|-)$/i

export function registerTaskTools(server: McpServer) {
  server.registerTool(
    "detalle_tarea",
    {
      title: "Detalle de una tarea",
      description:
        "Todo sobre UNA tarea: estado, proyecto, fase, responsable, fechas (creada, vence, completada), descripción, checklist (marcado/pendiente, cuáles bloquean), ping y a quién avisa, entregable requerido (instrucciones y lo que ya se subió) y SOP. Busca por título (o parte); `proyecto` ayuda si el título se repite. Incluye tareas completadas. Solo muestra tareas que tú puedes ver en el dashboard.",
      inputSchema: z.object({
        titulo: z.string().min(1).describe("Título (o parte) de la tarea"),
        proyecto: z.string().optional(),
        tarea_id: z.string().uuid().optional().describe("Id exacto, si ya lo tienes (de una búsqueda anterior)"),
      }),
    },
    async ({ titulo, proyecto, tarea_id }, ctx: ToolCtx) => {
      const caller = await getCaller(ctx)
      const hits = await findVisibleTasks({ titulo, proyecto, tarea_id }, caller)
      if (hits.length > 1) return text(ambiguousList(titulo, hits))
      const t = hits[0]

      const [{ data: checklist }, { data: deliverables }, pingNames] = await Promise.all([
        db().from("task_checklist_items").select("text, is_checked, is_blocking, item_order").eq("task_id", t.id).order("item_order"),
        t.requires_deliverable
          ? db().from("deliverables").select("type, title, content, file_url, file_name, created_at, uploader:profiles!deliverables_uploaded_by_fkey(full_name)").eq("task_id", t.id).order("created_at")
          : Promise.resolve({ data: [] as unknown[] }),
        t.ping_recipient_ids?.length
          ? db().from("profiles").select("full_name").in("id", t.ping_recipient_ids).then((r) => (r.data ?? []).map((p) => p.full_name as string))
          : Promise.resolve([] as string[]),
      ])

      const overdue = t.status !== "Done" && t.due_date && t.due_date < todayMx()
      const sop = t.sop ?? t.task_set_task?.sop ?? null
      const items = (checklist ?? []) as { text: string; is_checked: boolean; is_blocking: boolean }[]
      const dels = (deliverables ?? []) as { type: string; title: string; content: string | null; file_url: string | null; file_name: string | null; created_at: string; uploader: { full_name: string } | null }[]

      const out = [
        `# ${t.title}`,
        `Estado: ${STATUS[t.status] ?? t.status}${overdue ? " · ⚠️ VENCIDA" : ""}${t.is_personal ? " · 🔒 personal" : ""}`,
        `Proyecto: ${t.project?.name ?? "— (tarea suelta)"}${t.phase ? ` · fase ${t.phase.name}` : ""}`,
        `Responsable: ${t.assignee?.full_name ?? "sin asignar"}${t.position ? ` · puesto ${t.position.name}` : ""}${t.assignment_flag === "no_match" ? " · ⚠️ nadie del equipo tiene ese puesto" : t.assignment_flag === "multi" ? " · ⚠️ varios del equipo tienen ese puesto" : ""}`,
        `Fechas: creada ${fmt(t.created_at)} · vence ${fmt(t.due_date)}${t.completed_at ? ` · completada ${fmt(t.completed_at)}` : ""}${t.updated_at ? ` · último cambio ${fmt(t.updated_at)}` : ""}`,
        `\nDescripción:\n${t.description?.trim() || "(sin descripción)"}`,
      ]
      if (items.length) {
        const done = items.filter((i) => i.is_checked).length
        out.push(`\nChecklist (${done}/${items.length}):`, ...items.map((i) => `- [${i.is_checked ? "x" : " "}] ${i.text}${i.is_blocking ? " (bloquea completar)" : ""}`))
      } else out.push("\nChecklist: ninguno")
      if (t.is_pinged) out.push(`\n🔔 Ping: al completarla avisa a ${pingNames.length ? pingNames.join(", ") : "todo el equipo del proyecto"}`)
      if (t.requires_deliverable) {
        out.push(`\n📎 Requiere entregable${t.deliverable_instructions ? `: ${t.deliverable_instructions}` : ""}`)
        out.push(dels.length
          ? dels.map((d) => `- ${d.title} (${d.type}) · subido por ${d.uploader?.full_name ?? "—"} el ${fmt(d.created_at)}${d.file_url ? ` · ${d.file_url}` : ""}${d.content ? `\n  ${d.content}` : ""}`).join("\n")
          : "- Falta: todavía no se sube.")
      }
      if (sop) out.push(`\n📘 SOP: ${sop.title}${sop.doc_url ? ` · doc ${sop.doc_url}` : ""}${sop.video_url ? ` · video ${sop.video_url}` : ""}`)
      out.push(`\ntarea_id ${t.id}`)
      return text(out.join("\n"))
    },
  )

  const Target = {
    titulo: z.string().min(1).describe("Título (o parte) de la tarea"),
    proyecto: z.string().optional().describe("Ayuda si el título se repite"),
    tarea_id: z.string().uuid().optional().describe("Id exacto (de detalle_tarea o de una lista de coincidencias)"),
  }
  const NO_CHANGES = "\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true."

  server.registerTool(
    "editar_tarea",
    {
      title: "Editar una tarea existente",
      description:
        "Cambia una tarea ya creada (la busca por título; usa `proyecto` o `tarea_id` si hay varias): título, descripción, estado, fecha límite, responsable, aviso al completarla (ping y a quién), si pide entregable (y sus instrucciones) y su checklist (agregar, editar texto o si bloquea, marcar/desmarcar, quitar ítems; los números son los del checklist actual de detalle_tarea). Solo cambia lo indicado y muestra antes → después. " +
        "Igual que en el dashboard: cambiar el responsable le avisa a la persona nueva; completar una tarea con ping avisa al equipo; no se puede completar con ítems obligatorios sin marcar; marcar o desmarcar ítems del checklist cambia el estado solo (todos marcados = completada, alguno = en progreso, ninguno = por hacer), así que en ese caso no indiques otro estado. Mover de proyecto o de fase no está disponible (tampoco en el dashboard). Sin confirmar: true no guarda. Para borrar: eliminar_tarea.",
      inputSchema: z.object({
        ...Target,
        nuevo_titulo: z.string().min(1).optional(),
        descripcion: z.string().optional().describe("Vacío la quita"),
        estado: z.enum(["por_hacer", "en_progreso", "completada"]).optional(),
        fecha_limite: z.string().optional().describe("YYYY-MM-DD, o \"ninguna\" para quitarla"),
        responsable: z.string().optional().describe("Nombre de la persona (\"yo\" = quien llama) o \"nadie\" para dejarla sin asignar"),
        pingear: z.boolean().optional().describe("true = al completarla se avisa; false = no se avisa. Solo para tareas de un proyecto"),
        avisar_a: z.array(z.string()).optional().describe("Personas a avisar al completarla (nombres; \"yo\" = quien llama). Lista vacía = todo el equipo del proyecto. Implica pingear: true"),
        requiere_entregable: z.boolean().optional(),
        instrucciones_entregable: z.string().optional().describe("Solo si la tarea pide entregable; vacío las quita"),
        checklist: z.array(z.object({
          accion: z.enum(["agregar", "editar", "marcar", "desmarcar", "quitar"]),
          item: z.union([z.string(), z.number()]).optional().describe("Número (1 = primero) o parte del texto; obligatorio salvo en agregar"),
          texto: z.string().optional().describe("agregar: texto del ítem nuevo; editar: texto nuevo"),
          bloquea: z.boolean().optional().describe("true = la tarea no se puede completar sin marcarlo"),
        })).max(30).optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const caller = await getCaller(ctx)
      if (!caller.canManageTasks) throw new Error("No tienes permiso para editar tareas.")
      const t = await resolveOneTask(a, caller)

      // ── Checklist ──
      const { data: itemRows } = await db().from("task_checklist_items").select("id, text, is_checked, is_blocking, item_order").eq("task_id", t.id).order("item_order")
      const items = (itemRows ?? []) as ChecklistItemRow[]
      const ops: ChecklistOp[] = (a.checklist ?? []).map((o) => {
        if (o.accion === "agregar") {
          if (!o.texto?.trim()) throw new Error("Para agregar un ítem al checklist indica su texto.")
          return { accion: "agregar", texto: o.texto, bloquea: o.bloquea }
        }
        if (o.item === undefined || o.item === "") throw new Error(`En "${o.accion}" indica el ítem (número o parte del texto).`)
        if (o.accion === "editar") return { accion: "editar", item: o.item, texto: o.texto, bloquea: o.bloquea }
        return { accion: o.accion, item: o.item }
      })
      const plan = planChecklist(items, ops)
      const togglesCheck = plan.toggles.length > 0
      const statusFromToggles = togglesCheck ? statusFromChecklist(plan.after) : null

      // ── Campos ──
      const patch: { title?: string; description?: string | null; due_date?: string | null; is_pinged?: boolean; ping_ids?: string[] | null; requires?: boolean; instructions?: string | null } = {}
      const lines: string[] = []
      if (a.nuevo_titulo !== undefined && a.nuevo_titulo.trim() !== t.title) { patch.title = a.nuevo_titulo.trim(); lines.push(`- Título: "${t.title}" → "${patch.title}"`) }
      if (a.descripcion !== undefined && (a.descripcion.trim() || null) !== (t.description?.trim() || null)) {
        patch.description = a.descripcion.trim() || null
        lines.push(`- Descripción: ${t.description ? `"${t.description.slice(0, 80)}${t.description.length > 80 ? "…" : ""}"` : "—"} → ${patch.description ? `"${patch.description.slice(0, 80)}${patch.description.length > 80 ? "…" : ""}"` : "(vacía)"}`)
      }
      if (a.fecha_limite !== undefined) {
        const raw = a.fecha_limite.trim()
        const next = NONE.test(raw) ? null : raw
        if (next !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(next) || Number.isNaN(Date.parse(`${next}T12:00:00`)))) throw new Error("fecha_limite debe ser YYYY-MM-DD (o \"ninguna\").")
        if (next !== t.due_date) { patch.due_date = next; lines.push(`- Fecha límite: ${fmt(t.due_date)} → ${next ? fmt(next) : "sin fecha"}`) }
      }
      // Responsable (se cambia aparte: avisa a la persona nueva, como en el dashboard).
      let newAssignee: { id: string | null; name: string } | undefined
      if (a.responsable !== undefined) {
        const who = NONE.test(a.responsable.trim()) ? null : await resolvePerson(a.responsable, caller.id)
        if ((who?.id ?? null) !== t.assignee_id) {
          newAssignee = { id: who?.id ?? null, name: who?.full_name ?? "sin asignar" }
          lines.push(`- Responsable: ${t.assignee?.full_name ?? "sin asignar"} → ${newAssignee.name}${who ? " (se le avisa que tiene una tarea nueva)" : ""}`)
        }
      }
      // Ping
      let pingedAfter = t.is_pinged
      let pingIdsAfter = t.ping_recipient_ids
      if (a.pingear !== undefined || a.avisar_a !== undefined) {
        if (a.pingear === false) { pingedAfter = false; pingIdsAfter = null }
        else {
          pingedAfter = true
          if (a.avisar_a !== undefined) {
            const ids = await Promise.all(a.avisar_a.map(async (n) => (await resolvePerson(n, caller.id)).id))
            pingIdsAfter = ids.length ? [...new Set(ids)] : null
          }
        }
        if (pingedAfter && !t.project_id) throw new Error("El aviso al completar solo aplica a tareas de un proyecto.")
        const sameIds = JSON.stringify([...(pingIdsAfter ?? [])].sort()) === JSON.stringify([...(t.ping_recipient_ids ?? [])].sort())
        if (pingedAfter !== t.is_pinged || (pingedAfter && !sameIds)) {
          patch.is_pinged = pingedAfter; patch.ping_ids = pingIdsAfter
          let who = "todo el equipo del proyecto"
          if (pingedAfter && pingIdsAfter?.length) who = (await db().from("profiles").select("full_name").in("id", pingIdsAfter)).data?.map((p) => p.full_name).join(", ") ?? who
          lines.push(`- Aviso al completar: ${t.is_pinged ? "sí" : "no"} → ${pingedAfter ? `sí, a ${who}` : "no"}`)
        }
      }
      // Entregable
      let requiresAfter = t.requires_deliverable
      if (a.requiere_entregable !== undefined && a.requiere_entregable !== t.requires_deliverable) {
        requiresAfter = a.requiere_entregable; patch.requires = requiresAfter
        lines.push(`- Pide entregable: ${t.requires_deliverable ? "sí" : "no"} → ${requiresAfter ? "sí" : "no"}`)
      }
      if (a.instrucciones_entregable !== undefined) {
        if (!requiresAfter) throw new Error("Para dar instrucciones del entregable la tarea debe pedirlo (requiere_entregable: true).")
        const next = a.instrucciones_entregable.trim() || null
        if (next !== (t.deliverable_instructions?.trim() || null)) { patch.instructions = next; lines.push(`- Instrucciones del entregable: ${t.deliverable_instructions ? `"${t.deliverable_instructions.slice(0, 60)}…"` : "—"} → ${next ? `"${next.slice(0, 60)}${next.length > 60 ? "…" : ""}"` : "(vacías)"}`) }
      }

      // ── Estado ──
      const wanted = a.estado ? ESTADO[a.estado] : null
      if (wanted && togglesCheck && statusFromToggles && wanted !== statusFromToggles) {
        throw new Error(`Marcar/desmarcar ítems deja la tarea en "${STATUS[statusFromToggles]}" automáticamente; no pidas "${STATUS[wanted]}" a la vez. Haz primero el checklist y luego el estado, en dos llamadas.`)
      }
      const statusAfter = wanted ?? (togglesCheck && statusFromToggles ? statusFromToggles : t.status)
      if (statusAfter === "Done" && t.status !== "Done") {
        const missing = plan.after.filter((i) => i.is_blocking && !i.is_checked).length
        if (missing) throw new Error(`No se puede completar: hay ${missing} ítem${missing > 1 ? "s" : ""} obligatorio${missing > 1 ? "s" : ""} del checklist sin marcar.`)
      }
      if (statusAfter !== t.status) {
        lines.push(`- Estado: ${STATUS[t.status] ?? t.status} → ${STATUS[statusAfter] ?? statusAfter}${togglesCheck && !wanted ? " (automático por el checklist)" : ""}${statusAfter === "Done" && (patch.is_pinged ?? t.is_pinged) ? " · se avisa al equipo (ping)" : ""}`)
      }

      // ── Checklist (resumen) ──
      if (plan.adds.length || plan.edits.length || plan.toggles.length || plan.removes.length) {
        lines.push(`- Checklist (${plan.after.filter((i) => i.is_checked).length}/${plan.after.length} marcados) quedaría:`)
        plan.after.forEach((i, n) => lines.push(`    ${n + 1}. [${i.is_checked ? "x" : " "}] ${i.text}${i.is_blocking ? " (bloquea)" : ""}${i.id === null ? " ← nuevo" : ""}`))
        if (plan.removes.length) lines.push(`    (se quitan ${plan.removes.length}: ${plan.removes.map((id) => `"${items.find((i) => i.id === id)?.text}"`).join(", ")})`)
      }

      if (!lines.length) throw new Error("No indicaste nada que cambiar (o la tarea ya está así).")
      const desc = `Tarea "${t.title}" · ${t.project?.name ?? "sin proyecto"} · ${STATUS[t.status] ?? t.status}\n${lines.join("\n")}`
      if (!a.confirmar) return text(`${desc}${NO_CHANGES}`)

      // ── Ejecutar (mismas acciones que el dashboard; permiso manage_tasks) ──
      const acting = caller.id
      try {
        if (patch.title !== undefined || patch.description !== undefined || patch.due_date !== undefined || patch.is_pinged !== undefined || patch.requires !== undefined || patch.instructions !== undefined) {
          const fd = new FormData()
          fd.set("project_id", t.project_id ?? "")
          fd.set("title", patch.title ?? t.title)
          fd.set("description", (patch.description !== undefined ? patch.description : t.description) ?? "")
          fd.set("status", t.status)
          fd.set("is_pinged", String(patch.is_pinged ?? t.is_pinged))
          const ids = patch.is_pinged !== undefined ? patch.ping_ids : t.ping_recipient_ids
          fd.set("ping_recipient_ids_json", (patch.is_pinged ?? t.is_pinged) && ids?.length ? JSON.stringify(ids) : "")
          fd.set("requires_deliverable", String(patch.requires ?? t.requires_deliverable))
          fd.set("is_personal", String(t.is_personal))
          fd.set("due_date", (patch.due_date !== undefined ? patch.due_date : t.due_date) ?? "")
          fd.set("assignee_id", t.assignee_id ?? "")
          if (patch.instructions !== undefined) fd.set("deliverable_instructions", patch.instructions ?? "")
          await updateTask(t.id, fd, acting)
        }
        if (newAssignee) await updateTaskAssignee(t.id, newAssignee.id, t.project_id, acting)
        for (const id of plan.removes) await deleteChecklistItem(id, t.project_id, acting)
        for (const e of plan.edits) await updateChecklistItem(e.id, { ...(e.text !== undefined ? { text: e.text } : {}), ...(e.is_blocking !== undefined ? { is_blocking: e.is_blocking } : {}) }, t.project_id, acting)
        for (const n of plan.adds) await createChecklistItem(t.id, n.text, n.is_blocking, t.project_id, acting)
        for (const x of plan.toggles) await toggleChecklistItem(x.id, x.checked, t.project_id, acting)
        // Con ítems marcados, el estado ya lo puso el checklist; si no, se aplica el pedido.
        if (wanted && !togglesCheck && wanted !== t.status) await updateTaskStatus(t.id, wanted, t.project_id, acting)
      } catch (e) {
        throw new Error(`${e instanceof Error ? e.message : String(e)}\n\nLa edición se detuvo a la mitad: revisa con detalle_tarea cómo quedó la tarea antes de repetirla.`)
      }
      return text(`✅ Tarea actualizada.\n${desc}`)
    },
  )

  server.registerTool(
    "eliminar_tarea",
    {
      title: "Eliminar una tarea",
      description:
        "Borra una tarea para siempre, con su checklist y los entregables subidos. SOLO ADMIN (igual que el botón de borrar del dashboard). No se puede deshacer: si solo quieres cerrarla usa completar_tarea; para cambiar algo, editar_tarea. Sin confirmar: true solo muestra qué se borraría. Una tarea por llamada.",
      inputSchema: z.object({ ...Target, confirmar: z.boolean().default(false) }),
    },
    async (a, ctx: ToolCtx) => {
      const caller = await getCaller(ctx)
      if (caller.role !== "admin") throw new Error("Solo un admin puede eliminar tareas (igual que en el dashboard). Si solo quieres cerrarla usa completar_tarea.")
      const t = await resolveOneTask(a, caller)
      const [{ count: checklist }, { count: deliverables }] = await Promise.all([
        db().from("task_checklist_items").select("id", { count: "exact", head: true }).eq("task_id", t.id),
        db().from("deliverables").select("id", { count: "exact", head: true }).eq("task_id", t.id),
      ])
      const desc = [
        `Eliminar la tarea "${t.title}"`,
        `Proyecto: ${t.project?.name ?? "sin proyecto"}${t.phase ? ` · fase ${t.phase.name}` : ""} · ${STATUS[t.status] ?? t.status} · responsable ${t.assignee?.full_name ?? "sin asignar"} · vence ${fmt(t.due_date)}`,
        `Se borra junto con: ${checklist ?? 0} ítem(s) de checklist y ${deliverables ?? 0} entregable(s) subido(s).`,
        "⚠️ No se puede deshacer.",
      ].filter(Boolean).join("\n")
      if (!a.confirmar) return text(`${desc}${NO_CHANGES}`)
      await deleteTask(t.id, t.project_id, caller.id)
      return text(`✅ Tarea eliminada.\n${desc}`)
    },
  )
}
