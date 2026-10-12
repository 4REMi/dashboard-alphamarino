import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getScopeOverview, updateDeliverableFulfilled, updatePeriodExpectedQuantity, updatePeriodText, addCustomDeliverable } from "@/lib/actions/service-deliverables"
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
  const { data } = await db().from("projects").select("id, name, status").ilike("name", `%${name.trim()}%`).limit(8)
  const rows = (data ?? []).filter((p) => p.status !== "Archived")
  const exact = rows.filter((p) => p.name.toLowerCase() === name.trim().toLowerCase())
  const hits = exact.length ? exact : rows
  if (!hits.length) throw new Error(`No encontré el proyecto "${name}".`)
  if (hits.length > 1) throw new Error(`"${name}" coincide con varios proyectos: ${hits.map((p) => p.name).join(", ")}. Sé más específico.`)
  return hits[0]
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

export function registerDeliverableTools(server: McpServer) {
  server.registerTool(
    "entregables_proyecto",
    {
      title: "Entregables del periodo",
      description: "Entregables del periodo actual de un proyecto (lo que se palomea): cada uno con su avance (hecho/esperado), los hitos únicos pendientes y si el periodo anterior quedó incompleto. Los números sirven para marcar_entregable y ajustar_entregable.",
      inputSchema: z.object({ proyecto: z.string().min(1) }),
    },
    async ({ proyecto }, ctx: ToolCtx) => {
      const pid = profileId(ctx)
      const p = await project(proyecto)
      const { cur, rows, prev, prevRows } = await currentRows(p.id, pid)
      if (!rows.length) return text(`${p.name} no tiene entregables en el periodo actual (¿tiene ofertas asignadas?).`)
      const done = rows.reduce((s, r) => s + Math.min(r.fulfilled_quantity, r.expected_quantity), 0)
      const exp = rows.reduce((s, r) => s + r.expected_quantity, 0)
      const prevMissing = prevRows.filter((r) => r.fulfilled_quantity < r.expected_quantity)
      return text([
        `${p.name} · ${cur ? `periodo ${cur.label} (${cur.start} → ${cur.end})` : "sin periodo actual"} · ${done}/${exp}`,
        ...rows.map(fmt),
        prev && prevMissing.length ? `\n⚠️ Periodo anterior (${prev.label}) incompleto: ${prevMissing.map((r) => `${r.deliverable_text} ${r.fulfilled_quantity}/${r.expected_quantity}`).join(", ")}` : "",
      ].filter(Boolean).join("\n"))
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
}
