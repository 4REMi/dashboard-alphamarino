import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getExchangeRate } from "@/lib/actions/finances"
import { can } from "@/lib/permissions"
import { recurringAppliesToMonth } from "@/lib/utils/recurring-in-month"
import { normalizeToMonthly, type ExpenseFrequency } from "@/lib/types"

// Herramientas MCP de Finanzas: registrar gasto, listar gastos y resumen del
// mes. Mismo permiso que la sección /finances (view_global_finances). Mismo
// modelo que el bot de Telegram (lib/telegram-bot/handlers/finanzas.ts):
// todo se guarda en USD; si viene en MXN se convierte con el tipo de cambio
// del día. Gasto de proyecto → project_expenses; gasto general →
// recurring_expenses con frequency "One-time". Nómina NO se toca aquí.

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()
const CATS = ["Software", "Rent", "Services", "Other", "Payroll"] as const
const CAT_LABEL: Record<string, string> = { Payroll: "Nómina", Software: "Software", Rent: "Renta", Services: "Servicios", Other: "Otros" }
const usd = (n: number) => `USD ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })

async function requireFinance(ctx: ToolCtx): Promise<string> {
  const profileId = ctx.http?.authInfo?.extra?.profileId
  if (typeof profileId !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("role, permissions").eq("id", profileId).single()
  if (!can(data as never, "view_global_finances")) throw new Error("No tienes acceso a Finanzas")
  return profileId
}

async function findProject(name: string) {
  const { data } = await db().from("projects").select("id, name")
  const rows = data ?? []
  const q = name.trim().toLowerCase()
  const exact = rows.filter((r) => r.name.toLowerCase() === q)
  const hits = exact.length ? exact : rows.filter((r) => r.name.toLowerCase().includes(q))
  if (hits.length === 1) return hits[0]
  if (!hits.length) throw new Error(`No encontré el proyecto "${name}".`)
  throw new Error(`"${name}" coincide con varios proyectos: ${hits.map((h) => h.name).join(", ")}. Sé más específico.`)
}

function monthRange(mes?: string) {
  const key = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : today().slice(0, 7)
  const [y, m] = key.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { key, first: `${key}-01`, last: `${key}-${String(last).padStart(2, "0")}` }
}

export function registerFinanceTools(server: McpServer) {
  server.registerTool(
    "registrar_gasto",
    {
      title: "Registrar gasto",
      description: "Registra un gasto en Finanzas. Con `proyecto` queda como gasto de ese proyecto; sin proyecto, como gasto general de la agencia: único por defecto, o recurrente con `frecuencia` (mensual, semanal, semestral, anual; cuenta desde el mes en que se registra hasta que se dé de baja en Finanzas). Monto en MXN o USD (MXN se convierte a USD con el tipo de cambio de la fecha). Requiere acceso a Finanzas.",
      inputSchema: z.object({
        monto: z.number().positive(),
        moneda: z.enum(["MXN", "USD"]).default("MXN"),
        descripcion: z.string().min(1),
        categoria: z.enum(CATS).default("Other").describe("Software, Rent (renta), Services (servicios), Other, Payroll"),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; por defecto hoy"),
        proyecto: z.string().optional(),
        frecuencia: z.enum(["unico", "mensual", "semanal", "semestral", "anual"]).default("unico").describe("Recurrente solo para gastos generales (sin proyecto)"),
      }),
    },
    async ({ monto, moneda, descripcion, categoria, fecha, proyecto, frecuencia }, ctx: ToolCtx) => {
      await requireFinance(ctx)
      if (proyecto && frecuencia !== "unico") throw new Error("Los gastos recurrentes son generales de la agencia; quita el proyecto o regístralo como único.")
      const date = fecha ?? today()
      let amountUsd = monto
      let rateNote = ""
      if (moneda === "MXN") {
        const rate = await getExchangeRate(date)
        if (!rate) throw new Error("No pude obtener el tipo de cambio para esa fecha; intenta de nuevo.")
        amountUsd = monto / rate
        rateNote = ` (≈ ${usd(amountUsd)} a ${rate.toFixed(2)})`
      }
      const shown = moneda === "MXN" ? `MXN ${monto.toLocaleString("es-MX")}` : usd(monto)
      if (proyecto) {
        const p = await findProject(proyecto)
        const { error } = await db().from("project_expenses").insert({ project_id: p.id, amount: amountUsd, date, description: descripcion, category: categoria })
        if (error) throw new Error(error.message)
        return text(`✅ Gasto de proyecto registrado: ${shown}${rateNote} · ${p.name} · ${CAT_LABEL[categoria]}\n${descripcion}\n📅 ${date}`)
      }
      if (frecuencia !== "unico") {
        const freq = { mensual: "Monthly", semanal: "Weekly", semestral: "Semestral", anual: "Annual" }[frecuencia]
        const { error } = await db().from("recurring_expenses").insert({ name: descripcion, amount: amountUsd, frequency: freq, category: categoria, is_active: true })
        if (error) throw new Error(error.message)
        return text(`✅ Gasto recurrente ${frecuencia} registrado: ${shown}${rateNote} · ${CAT_LABEL[categoria]}\n${descripcion}\n📅 cuenta desde este mes (se da de baja en Finanzas)${moneda === "MXN" ? "\nSe guardó en USD con el tipo de cambio de hoy." : ""}`)
      }
      const { error } = await db().from("recurring_expenses").insert({ name: descripcion, amount: amountUsd, frequency: "One-time", category: categoria, expense_date: date, is_active: true })
      if (error) throw new Error(error.message)
      return text(`✅ Gasto general registrado: ${shown}${rateNote} · ${CAT_LABEL[categoria]}\n${descripcion}\n📅 ${date}`)
    },
  )

  server.registerTool(
    "listar_gastos",
    {
      title: "Listar gastos",
      description: "Gastos de un mes (por defecto el actual): gastos de proyecto, gastos únicos generales y los recurrentes activos ese mes. Montos en USD. Filtros opcionales por proyecto o categoría. Requiere acceso a Finanzas.",
      inputSchema: z.object({
        mes: z.string().optional().describe("YYYY-MM; por defecto el mes actual"),
        proyecto: z.string().optional(),
        categoria: z.enum(CATS).optional(),
      }),
    },
    async ({ mes, proyecto, categoria }, ctx: ToolCtx) => {
      await requireFinance(ctx)
      const r = monthRange(mes)
      const p = proyecto ? await findProject(proyecto) : null
      let q = db().from("project_expenses").select("amount, date, description, category, project:projects(name)").gte("date", r.first).lte("date", r.last).order("date")
      if (p) q = q.eq("project_id", p.id)
      if (categoria) q = q.eq("category", categoria)
      const [{ data: pe }, { data: rec }] = await Promise.all([q, p ? Promise.resolve({ data: [] }) : db().from("recurring_expenses").select("*")])
      const lines: string[] = []
      let total = 0
      for (const e of (pe ?? []) as unknown as { amount: number; date: string; description: string | null; category: string; project: { name: string } | null }[]) {
        total += Number(e.amount)
        lines.push(`- ${e.date} · ${usd(Number(e.amount))} · ${e.project?.name ?? "Proyecto"} · ${CAT_LABEL[e.category] ?? e.category} · ${e.description ?? ""}`)
      }
      for (const e of (rec ?? []) as { name: string; amount: number; frequency: string; category: string; expense_date: string | null }[]) {
        if (!recurringAppliesToMonth(e as never, r.key)) continue
        if (categoria && e.category !== categoria) continue
        const amt = e.frequency === "One-time" ? Number(e.amount) : normalizeToMonthly(Number(e.amount), e.frequency as ExpenseFrequency)
        total += amt
        lines.push(`- ${e.frequency === "One-time" ? e.expense_date : "recurrente"} · ${usd(amt)} · General · ${CAT_LABEL[e.category] ?? e.category} · ${e.name}${e.frequency !== "One-time" ? ` (${e.frequency})` : ""}`)
      }
      if (!lines.length) return text(`Sin gastos en ${r.key}${p ? ` para ${p.name}` : ""}.`)
      return text(`Gastos ${r.key}${p ? ` · ${p.name}` : ""}${categoria ? ` · ${CAT_LABEL[categoria]}` : ""} — total ${usd(total)}\n${lines.join("\n")}`)
    },
  )

  server.registerTool(
    "resumen_finanzas",
    {
      title: "Resumen de finanzas",
      description: "Resumen de un mes (por defecto el actual) contra el anterior: ingresos, gastos (de proyecto + generales/recurrentes), margen neto y MRR, más gastos por categoría. Montos en USD. Requiere acceso a Finanzas.",
      inputSchema: z.object({ mes: z.string().optional().describe("YYYY-MM") }),
    },
    async ({ mes }, ctx: ToolCtx) => {
      await requireFinance(ctx)
      const cur = monthRange(mes)
      const [py, pm] = cur.key.split("-").map(Number)
      const prev = monthRange(`${pm === 1 ? py - 1 : py}-${String(pm === 1 ? 12 : pm - 1).padStart(2, "0")}`)
      const { data: rec } = await db().from("recurring_expenses").select("*")
      const { data: mrrRows } = await db().from("projects").select("monthly_fee").eq("status", "Active").gt("monthly_fee", 0)

      async function month(r: ReturnType<typeof monthRange>) {
        const [{ data: inc }, { data: pe }] = await Promise.all([
          db().from("income").select("amount").gte("date", r.first).lte("date", r.last),
          db().from("project_expenses").select("amount, category").gte("date", r.first).lte("date", r.last),
        ])
        const byCat: Record<string, number> = {}
        let projectExp = 0
        for (const e of pe ?? []) { projectExp += Number(e.amount); byCat[e.category] = (byCat[e.category] ?? 0) + Number(e.amount) }
        let general = 0
        for (const e of rec ?? []) {
          if (!recurringAppliesToMonth(e, r.key)) continue
          const amt = e.frequency === "One-time" ? Number(e.amount) : normalizeToMonthly(Number(e.amount), e.frequency as ExpenseFrequency)
          general += amt; byCat[e.category] = (byCat[e.category] ?? 0) + amt
        }
        const income = (inc ?? []).reduce((s, i) => s + Number(i.amount), 0)
        return { income, projectExp, general, expenses: projectExp + general, net: income - projectExp - general, byCat }
      }
      const [a, b] = await Promise.all([month(cur), month(prev)])
      const mrr = (mrrRows ?? []).reduce((s, p) => s + Number(p.monthly_fee ?? 0), 0)
      const delta = (x: number, y: number) => (y ? ` (${x >= y ? "+" : ""}${(((x - y) / Math.abs(y)) * 100).toFixed(0)}% vs ${prev.key})` : "")
      const cats = Object.entries(a.byCat).sort((x, y) => y[1] - x[1]).map(([k, v]) => `  - ${CAT_LABEL[k] ?? k}: ${usd(v)}`).join("\n")
      return text([
        `Finanzas ${cur.key} (USD)`,
        `- Ingresos: ${usd(a.income)}${delta(a.income, b.income)}`,
        `- Gastos: ${usd(a.expenses)}${delta(a.expenses, b.expenses)} — proyectos ${usd(a.projectExp)} · generales/recurrentes ${usd(a.general)}`,
        `- Margen neto: ${usd(a.net)}${a.income ? ` (${((a.net / a.income) * 100).toFixed(0)}%)` : ""} · mes anterior ${usd(b.net)}`,
        `- MRR (fees mensuales de proyectos activos): ${usd(mrr)}`,
        cats ? `Gastos por categoría:\n${cats}` : "",
      ].filter(Boolean).join("\n"))
    },
  )
}
