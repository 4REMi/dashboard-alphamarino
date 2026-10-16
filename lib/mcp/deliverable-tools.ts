import { resolveProject } from "@/lib/mcp/resolve-project"
import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getScopeOverview, updateDeliverableFulfilled, updatePeriodExpectedQuantity, updatePeriodText, addCustomDeliverable, deleteCustomDeliverable, detachServiceOfferFromProject } from "@/lib/actions/service-deliverables"
import { submitDeliverable } from "@/lib/actions/deliverables"
import { updateTaskStatus } from "@/lib/actions/tasks"
import type { ProjectDeliverablePeriod, DeliverableCadence } from "@/lib/types"

// Entregables de un proyecto por periodo (lo que se palomea): leer el
// periodo actual, marcar avance, ajustar cantidad/texto del periodo y
// agregar entregables extra. Mismas funciones (y permisos) que el alcance
// en el Hub del proyecto. Todo cambio queda en la bitácora.

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()

function profileId(ctx: ToolCtx): string {
  const id = ctx.http?.authInfo?.extra?.profileId
  if (typeof id !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  return id
}

async function project(name: string): Promise<{ id: string; name: string }> {
  return resolveProject(name)
}

// Filas del periodo actual + hitos únicos pendientes, en orden estable.
async function currentRows(projectId: string, pid: string) {
  const ov = await getScopeOverview(projectId, pid)
  const cur = ov.periods.find((p) => p.isCurrent) ?? null
  const rows = ov.rows
    .filter((r) => (cur && r.period_start === cur.start && r.period_label !== "Único") || (r.period_label === "Único" && r.fulfilled_quantity < r.expected_quantity))
    .sort((a, b) => Number(a.period_label === "Único") - Number(b.period_label === "Único") || a.deliverable_text.localeCompare(b.deliverable_text))
  const prev = cur ? ov.periods.filter((p) => p.end < cur.start).pop() ?? null : null
  const prevRows = prev ? ov.rows.filter((r) => r.period_start === prev.start && r.period_label !== "Único") : []
  return { cur, rows, prev, prevRows }
}

// Resto del alcance (para completo: true): continuos, hitos cumplidos e
// historial de periodos anteriores al actual.
async function fullScope(projectId: string, pid: string, curStart: string | null) {
  const ov = await getScopeOverview(projectId, pid)
  const src = (l: { offerName: string | null }) => l.offerName ? ` (oferta ${l.offerName})` : " (propio)"
  const cont = ov.lines.filter((l) => l.cadence === "continuous")
  const doneOnce = ov.rows.filter((r) => r.period_label === "Único" && r.fulfilled_quantity >= r.expected_quantity)
  const past = ov.periods.filter((pp) => !pp.isCurrent && (!curStart || pp.start < curStart)).reverse()
  const out: string[] = []
  out.push(`\n\nContinuos (sin conteo): ${cont.length ? "" : "ninguno"}`)
  cont.forEach((l) => out.push(`- ${l.text}${src(l)}`))
  out.push(`\nHitos únicos cumplidos: ${doneOnce.length ? "" : "ninguno"}`)
  doneOnce.forEach((r) => out.push(`- ✅ ${r.deliverable_text} — ${r.fulfilled_quantity}/${r.expected_quantity}`))
  out.push(`\nHistorial de periodos: ${past.length ? "" : "sin periodos anteriores"}`)
  for (const pp of past) {
    const rs = ov.rows.filter((r) => r.period_start === pp.start && r.period_label !== "Único")
    const d = rs.reduce((s, r) => s + Math.min(r.fulfilled_quantity, r.expected_quantity), 0)
    const e = rs.reduce((s, r) => s + r.expected_quantity, 0)
    const miss = rs.filter((r) => r.fulfilled_quantity < r.expected_quantity)
    out.push(`- ${pp.label} (${pp.start} → ${pp.end}): ${d}/${e}${e && d >= e ? " ✅" : ""}${miss.length ? ` · faltó: ${miss.map((r) => `${r.deliverable_text} ${r.fulfilled_quantity}/${r.expected_quantity}`).join(", ")}` : ""}`)
  }
  return out.join("\n")
}

const fmt = (r: ProjectDeliverablePeriod, i: number) =>
  `${i + 1}. ${r.fulfilled_quantity >= r.expected_quantity ? "✅" : "◻️"} ${r.deliverable_text} — ${r.fulfilled_quantity}/${r.expected_quantity}${r.period_label === "Único" ? " (una vez)" : ""}`

function pickRow(rows: ProjectDeliverablePeriod[], ref: string): ProjectDeliverablePeriod {
  if (/^\d+$/.test(ref.trim())) { const r = rows[Number(ref) - 1]; if (!r) throw new Error(`No hay entregable ${ref} en el periodo.`); return r }
  const q = ref.trim().toLowerCase()
  const hits = rows.filter((r) => r.deliverable_text.toLowerCase().includes(q))
  if (hits.length !== 1) throw new Error(hits.length ? `"${ref}" coincide con varios entregables; usa el número de entregables_proyecto.` : `No encontré "${ref}" en el periodo actual.`)
  return hits[0]
}

async function log(projectId: string, pid: string, body: string) {
  await db().from("project_log_entries").insert({ project_id: projectId, author_id: pid, body: `**Entregables:** ${body}`, category: "Interno" })
}

const CADENCIA = { una_vez: "once", por_periodo: "monthly", cada_3_periodos: "quarterly", cada_6_periodos: "biannual", continuo: "continuous" } as const

// Coincidencia simple tarea ↔ entregable del alcance (palabras en común),
// para PROPONER sumar al periodo cuando se entrega una tarea.
const words = (t: string) => new Set(t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3))
function scopeCandidates(taskTitle: string, rows: ProjectDeliverablePeriod[]) {
  const tw = words(taskTitle)
  return rows
    .map((r, i) => ({ r, i, score: [...words(r.deliverable_text)].filter((w) => tw.has(w) || [...tw].some((x) => x.startsWith(w.slice(0, 5)))).length }))
    .filter((x) => x.score > 0 && x.r.fulfilled_quantity < x.r.expected_quantity)
    .sort((a, b) => b.score - a.score).slice(0, 3)
}

export function registerDeliverableTools(server: McpServer) {
  server.registerTool(
    "entregables_de_tareas",
    {
      title: "Entregables de tareas",
      description: "Tareas de un proyecto que requieren entregable (resultado subido: texto, documento o imagen): cuáles ya se entregaron (qué, quién, cuándo) y cuáles faltan (responsable, fecha límite, si está vencida). No confundir con entregables_proyecto (alcance por periodo).",
      inputSchema: z.object({ proyecto: z.string().min(1), solo_faltantes: z.boolean().default(false) }),
    },
    async ({ proyecto, solo_faltantes }, ctx: ToolCtx) => {
      profileId(ctx)
      const p = await project(proyecto)
      const { data: tasks } = await db().from("tasks").select("id, title, status, due_date, deliverable_instructions, assignee:profiles(full_name)")
        .eq("project_id", p.id).eq("requires_deliverable", true).order("due_date", { ascending: true, nullsFirst: false })
      const list = (tasks ?? []) as unknown as { id: string; title: string; status: string; due_date: string | null; deliverable_instructions: string | null; assignee: { full_name: string } | null }[]
      if (!list.length) return text(`${p.name} no tiene tareas que requieran entregable.`)
      const { data: dels } = await db().from("deliverables").select("task_id, type, title, content, file_url, created_at, uploader:profiles(full_name)").in("task_id", list.map((t) => t.id)).order("created_at", { ascending: false })
      const byTask = new Map<string, any[]>()
      for (const d of (dels ?? []) as any[]) byTask.set(d.task_id, [...(byTask.get(d.task_id) ?? []), d])
      const today = new Date().toISOString().slice(0, 10)
      const done = list.filter((t) => byTask.has(t.id)), missing = list.filter((t) => !byTask.has(t.id))
      const lines: string[] = [`${p.name} · ${done.length} entregadas · ${missing.length} faltan`]
      if (missing.length) lines.push("\n◻️ Faltan:", ...missing.map((t) => `- ${t.title} · ${t.assignee?.full_name ?? "sin responsable"}${t.due_date ? ` · vence ${t.due_date}${t.due_date < today ? " ⚠️ vencida" : ""}` : ""}${t.status === "Done" ? " · (tarea marcada hecha sin entregable)" : ""}${t.deliverable_instructions ? `\n  Instrucciones: ${t.deliverable_instructions}` : ""}`))
      if (!solo_faltantes && done.length) lines.push("\n✅ Entregadas:", ...done.map((t) => {
        const d = byTask.get(t.id)![0]
        return `- ${t.title} → "${d.title}" (${d.type}${d.file_url ? `: ${d.file_url}` : d.content ? `: ${String(d.content).slice(0, 120)}` : ""}) · ${d.uploader?.full_name ?? "—"} · ${String(d.created_at).slice(0, 10)}`
      }))
      return text(lines.join("\n"))
    },
  )

  server.registerTool(
    "entregar_tarea",
    {
      title: "Entregar una tarea",
      description: "Sube el entregable de una tarea (un texto o un enlace a archivo) a nombre de quien llama, y opcionalmente marca la tarea como hecha. Después PROPONE qué entregable del alcance del periodo podría sumar; con sumar_a_alcance (número o texto de entregables_proyecto) lo suma en el mismo paso.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        tarea: z.string().min(1).describe("Parte del título de la tarea"),
        titulo: z.string().optional().describe("Nombre del entregable; por defecto el de la tarea"),
        texto: z.string().optional(),
        enlace: z.string().url().optional().describe("Link al archivo (Drive, Frame.io, etc.)"),
        completar: z.boolean().default(false).describe("Marcar la tarea como hecha"),
        sumar_a_alcance: z.string().optional().describe("Entregable del periodo al que sumar 1"),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const pid = profileId(ctx)
      const p = await project(a.proyecto)
      if (!a.texto && !a.enlace) throw new Error("Manda el texto del entregable o un enlace.")
      const { data } = await db().from("tasks").select("id, title, requires_deliverable").eq("project_id", p.id).ilike("title", `%${a.tarea.trim()}%`).limit(6)
      if (!data?.length) throw new Error(`No encontré la tarea "${a.tarea}" en ${p.name}.`)
      if (data.length > 1) throw new Error(`"${a.tarea}" coincide con varias tareas: ${data.map((t) => t.title).join(" · ")}. Sé más específico.`)
      const task = data[0]
      const fd = new FormData()
      fd.set("project_id", p.id); fd.set("task_id", task.id)
      fd.set("type", a.enlace ? "document" : "text")
      fd.set("title", a.titulo?.trim() || task.title)
      if (a.texto) fd.set("content", a.texto)
      if (a.enlace) { fd.set("file_url", a.enlace); fd.set("file_name", a.enlace.split("/").pop() ?? "enlace") }
      await submitDeliverable(fd, pid)
      const out = [`✅ Entregable subido a "${task.title}"${task.requires_deliverable ? "" : " (la tarea no lo requería)"}.`]
      if (a.completar) { await updateTaskStatus(task.id, "Done", p.id, pid); out.push("Tarea marcada como hecha.") }

      const { rows } = await currentRows(p.id, pid).catch(() => ({ rows: [] as ProjectDeliverablePeriod[] }))
      if (a.sumar_a_alcance) {
        const r = pickRow(rows, a.sumar_a_alcance)
        await updateDeliverableFulfilled(r.id, r.fulfilled_quantity + 1, p.id, pid)
        await log(p.id, pid, `"${task.title}" entregada → ${r.deliverable_text}: ${r.fulfilled_quantity} → ${r.fulfilled_quantity + 1} de ${r.expected_quantity}.`)
        out.push(`Alcance: ${r.deliverable_text} ${r.fulfilled_quantity} → ${r.fulfilled_quantity + 1} de ${r.expected_quantity}.`)
      } else {
        const c = scopeCandidates(task.title, rows)
        if (c.length) out.push(`¿Cuenta para el alcance del periodo? Posibles: ${c.map((x) => `#${rows.indexOf(x.r) + 1} ${x.r.deliverable_text} (${x.r.fulfilled_quantity}/${x.r.expected_quantity})`).join(" · ")}. Si sí, usa marcar_entregable con ese número.`)
      }
      return text(out.join("\n"))
    },
  )

  server.registerTool(
    "entregables_proyecto",
    {
      title: "Entregables del periodo",
      description: "Entregables del periodo actual de un proyecto (lo que se palomea): cada uno con su avance (hecho/esperado), los hitos únicos pendientes y si el periodo anterior quedó incompleto. Los números sirven para marcar_entregable y ajustar_entregable. Con completo: true agrega todo el alcance: entregables continuos (sin conteo), hitos únicos ya cumplidos y el historial de periodos anteriores (hasta 12) con su avance y lo que faltó.",
      inputSchema: z.object({ proyecto: z.string().min(1), completo: z.boolean().default(false) }),
    },
    async ({ proyecto, completo }, ctx: ToolCtx) => {
      const pid = profileId(ctx)
      const p = await project(proyecto)
      const { cur, rows, prev, prevRows } = await currentRows(p.id, pid)
      const extra = completo ? await fullScope(p.id, pid, cur?.start ?? null) : ""
      if (!rows.length) return text(`${p.name} no tiene entregables en el periodo actual (¿tiene ofertas asignadas?).${extra}`)
      const done = rows.reduce((s, r) => s + Math.min(r.fulfilled_quantity, r.expected_quantity), 0)
      const exp = rows.reduce((s, r) => s + r.expected_quantity, 0)
      const prevMissing = prevRows.filter((r) => r.fulfilled_quantity < r.expected_quantity)
      return text([
        `${p.name} · ${cur ? `periodo ${cur.label} (${cur.start} → ${cur.end})` : "sin periodo actual"} · ${done}/${exp}`,
        ...rows.map(fmt),
        prev && prevMissing.length ? `\n⚠️ Periodo anterior (${prev.label}) incompleto: ${prevMissing.map((r) => `${r.deliverable_text} ${r.fulfilled_quantity}/${r.expected_quantity}`).join(", ")}` : "",
      ].filter(Boolean).join("\n") + extra)
    },
  )

  server.registerTool(
    "marcar_entregable",
    {
      title: "Marcar avance de un entregable",
      description: "Registra avance de un entregable del periodo actual: sumar unidades (sumar: 2), fijar el total (hecho: 4) o marcarlo completo (completo: true). El entregable por número (de entregables_proyecto) o parte de su texto. Directo (sin vista previa); se puede corregir con otro llamado. Miembros con permiso de tareas o admin/subadmin.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        entregable: z.string().min(1),
        sumar: z.number().int().optional(),
        hecho: z.number().int().nonnegative().optional(),
        completo: z.boolean().optional(),
      }),
    },
    async ({ proyecto, entregable, sumar, hecho, completo }, ctx: ToolCtx) => {
      const pid = profileId(ctx)
      const p = await project(proyecto)
      const { rows } = await currentRows(p.id, pid)
      const r = pickRow(rows, entregable)
      const next = completo ? r.expected_quantity : hecho != null ? hecho : sumar != null ? r.fulfilled_quantity + sumar : null
      if (next == null) throw new Error("Indica sumar, hecho o completo.")
      await updateDeliverableFulfilled(r.id, next, p.id, pid)
      await log(p.id, pid, `${r.deliverable_text}: ${r.fulfilled_quantity} → ${Math.max(0, next)} de ${r.expected_quantity}.`)
      return text(`✅ ${r.deliverable_text}: ${r.fulfilled_quantity} → ${Math.max(0, next)} de ${r.expected_quantity}${next > r.expected_quantity ? " (sobre-entrega)" : ""}.`)
    },
  )

  server.registerTool(
    "ajustar_entregable",
    {
      title: "Ajustar entregable del periodo",
      description: "Cambia SOLO para el periodo actual la cantidad esperada y/o el texto de un entregable (ej. este mes acordaron 8 piezas en vez de 6). Los periodos siguientes vuelven a tomar lo de la oferta. Sin confirmar: true solo muestra el cambio. Solo admin/subadmin.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        entregable: z.string().min(1),
        cantidad: z.number().int().nonnegative().optional(),
        texto: z.string().min(1).optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ proyecto, entregable, cantidad, texto, confirmar }, ctx: ToolCtx) => {
      const pid = profileId(ctx)
      const p = await project(proyecto)
      const { rows } = await currentRows(p.id, pid)
      const r = pickRow(rows, entregable)
      if (cantidad == null && !texto) throw new Error("Indica cantidad y/o texto.")
      const desc = `${p.name} · "${r.deliverable_text}"${cantidad != null ? ` · esperado ${r.expected_quantity} → ${cantidad}` : ""}${texto ? ` · texto → "${texto}"` : ""} (solo este periodo)`
      if (!confirmar) return text(`Cambiaría:\n${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
      if (cantidad != null) await updatePeriodExpectedQuantity(r.id, cantidad, p.id, pid)
      if (texto) await updatePeriodText(r.id, texto, p.id, pid)
      await log(p.id, pid, desc)
      return text(`✅ ${desc}`)
    },
  )

  server.registerTool(
    "agregar_entregable_extra",
    {
      title: "Agregar entregable extra al proyecto",
      description: "Agrega un entregable que no viene de una oferta, solo para este proyecto (ej. un video extra que pidió el cliente). Aparece en el alcance desde el periodo actual. Sin confirmar: true solo muestra el plan. Solo admin/subadmin.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        texto: z.string().min(1),
        cadencia: z.enum(["una_vez", "por_periodo", "cada_3_periodos", "cada_6_periodos", "continuo"]).default("una_vez"),
        cantidad: z.number().int().positive().optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ proyecto, texto, cadencia, cantidad, confirmar }, ctx: ToolCtx) => {
      const pid = profileId(ctx)
      const p = await project(proyecto)
      const cadence = CADENCIA[cadencia] as DeliverableCadence
      const desc = `${p.name} · extra "${texto}" · ${cadencia.replace(/_/g, " ")}${cantidad && cadence !== "continuous" ? ` ×${cantidad}` : ""}`
      if (!confirmar) return text(`Agregaría:\n${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
      await addCustomDeliverable(p.id, texto, cadence, cadence === "continuous" ? null : cantidad ?? null, pid)
      await log(p.id, pid, `Entregable extra agregado: ${desc}`)
      return text(`✅ ${desc}. Usa entregables_proyecto para verlo en el periodo.`)
    },
  )

  server.registerTool(
    "quitar_entregable",
    {
      title: "Quitar entregable propio del proyecto",
      description: "Quita un entregable propio (agregado con agregar_entregable_extra o al crear el proyecto), p. ej. si quedó duplicado o se cargó por error. Se indica por número de entregables_proyecto o parte de su texto. Borra la definición y sus filas sin avance; lo ya entregado queda como historial. Los entregables que vienen de una oferta no se quitan aquí: usa quitar_oferta_de_proyecto o ajustar_entregable. Sin confirmar: true solo muestra qué quitaría. Solo admin/subadmin.",
      inputSchema: z.object({ proyecto: z.string().min(1), entregable: z.string().min(1), confirmar: z.boolean().default(false) }),
    },
    async ({ proyecto, entregable, confirmar }, ctx: ToolCtx) => {
      const pid = profileId(ctx)
      const p = await project(proyecto)
      const ov = await getScopeOverview(p.id, pid)
      const live = ov.lines.filter((l) => !l.removed)
      let line: (typeof live)[number] | undefined
      if (/^\d+$/.test(entregable.trim())) {
        const { rows } = await currentRows(p.id, pid)
        const r = pickRow(rows, entregable)
        line = live.find((l) => l.key === r.deliverable_key)
      } else {
        const q = entregable.trim().toLowerCase()
        const hits = live.filter((l) => l.text.toLowerCase().includes(q))
        const own = hits.filter((l) => l.customId)
        if (own.length > 1) throw new Error(`"${entregable}" coincide con varios entregables propios: ${own.map((l) => l.text).join(", ")}. Usa el número de entregables_proyecto para quitar uno a la vez.`)
        line = own[0] ?? hits[0]
      }
      if (!line) throw new Error(`No encontré "${entregable}" en el alcance de ${p.name}.`)
      if (!line.customId) throw new Error(`"${line.text}" viene de la oferta ${line.offerName ?? ""}; no es un entregable propio. Para quitarlo, quita la oferta (quitar_oferta_de_proyecto) o ajusta su cantidad del periodo (ajustar_entregable).`)
      const dupes = live.filter((l) => l.customId && l.text.trim().toLowerCase() === line!.text.trim().toLowerCase()).length
      const desc = `${p.name} · quitar entregable propio "${line.text}"${dupes > 1 ? ` (hay ${dupes} con el mismo texto; se quita solo uno)` : ""}`
      if (!confirmar) return text(`Quitaría:\n${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
      await deleteCustomDeliverable(line.customId, p.id, pid, true)
      await log(p.id, pid, `Entregable propio quitado: "${line.text}"`)
      return text(`✅ ${desc}.`)
    },
  )

  server.registerTool(
    "quitar_oferta_de_proyecto",
    {
      title: "Quitar oferta de un proyecto",
      description: "Desasigna una oferta del catálogo de un proyecto (p. ej. asignada dos veces o por error). Sus entregables dejan de generarse; lo ya entregado queda como historial. Sin confirmar: true solo muestra el plan. Solo admin/subadmin.",
      inputSchema: z.object({ proyecto: z.string().min(1), oferta: z.string().min(1), confirmar: z.boolean().default(false) }),
    },
    async ({ proyecto, oferta, confirmar }, ctx: ToolCtx) => {
      const pid = profileId(ctx)
      const p = await project(proyecto)
      const { data } = await db().from("project_service_offers").select("service_offer_id, service_offer:service_offers(name)").eq("project_id", p.id)
      const rows = (data ?? []) as unknown as { service_offer_id: string; service_offer: { name: string } | null }[]
      const q = oferta.trim().toLowerCase()
      const hits = rows.filter((r) => (r.service_offer?.name ?? "").toLowerCase().includes(q))
      if (!hits.length) throw new Error(`${p.name} no tiene asignada una oferta que coincida con "${oferta}". Asignadas: ${rows.map((r) => r.service_offer?.name).join(", ") || "ninguna"}.`)
      if (new Set(hits.map((h) => h.service_offer_id)).size > 1) throw new Error(`"${oferta}" coincide con varias ofertas: ${hits.map((h) => h.service_offer?.name).join(", ")}.`)
      const name = hits[0].service_offer?.name ?? oferta
      const desc = `${p.name} · quitar oferta "${name}"`
      if (!confirmar) return text(`Quitaría:\n${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
      await detachServiceOfferFromProject(p.id, hits[0].service_offer_id, pid)
      await log(p.id, pid, `Oferta quitada: "${name}"`)
      return text(`✅ ${desc}.`)
    },
  )
}
