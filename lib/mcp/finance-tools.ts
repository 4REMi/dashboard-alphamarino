import { resolveProject } from "@/lib/mcp/resolve-project"
import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getExchangeRate } from "@/lib/actions/finances"
import { can } from "@/lib/permissions"
import { revalidatePath } from "next/cache"
import { feeColumns, isMissingFeeColumns } from "@/lib/finance/project-fee"
import { recurringAppliesToMonth } from "@/lib/utils/recurring-in-month"
import { normalizeToMonthly, type ExpenseFrequency } from "@/lib/types"

// Herramientas MCP de Finanzas: registrar gasto, listar gastos, resumen del
// mes, registrar ingreso, fees pendientes y editar el fee de un proyecto. Mismo permiso que la sección /finances (view_global_finances). Mismo
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

export async function requireFinance(ctx: ToolCtx): Promise<string> {
  const profileId = ctx.http?.authInfo?.extra?.profileId
  if (typeof profileId !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("role, permissions").eq("id", profileId).single()
  if (!can(data as never, "view_global_finances")) throw new Error("No tienes acceso a Finanzas")
  return profileId
}

const mxn = (n: number) => `MXN ${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Fee de un proyecto como texto: "MXN 11,500.00 (≈ USD 615.00)" o "USD 615.00".
function feeText(p: { monthly_fee: number | null; monthly_fee_currency?: string | null; monthly_fee_original?: number | null }): string {
  if (!p.monthly_fee) return "—"
  if (p.monthly_fee_currency === "MXN" && Number(p.monthly_fee_original) > 0) return `${mxn(Number(p.monthly_fee_original))} (≈ ${usd(Number(p.monthly_fee))})`
  return usd(Number(p.monthly_fee))
}

// MXN → USD con el tipo de cambio de la fecha (mismo criterio que el bot).
async function toUsd(monto: number, moneda: "MXN" | "USD", date: string) {
  if (moneda === "USD") return { amountUsd: monto, rate: 1, note: "" }
  const rate = await getExchangeRate(date)
  if (!rate) throw new Error("No pude obtener el tipo de cambio para esa fecha; intenta de nuevo.")
  const amountUsd = Math.round((monto / rate) * 100) / 100
  return { amountUsd, rate, note: ` (≈ ${usd(amountUsd)} a ${rate.toFixed(2)})` }
}

async function findProject(name: string) {
  return resolveProject(name)
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

  server.registerTool(
    "registrar_ingreso",
    {
      title: "Registrar ingreso",
      description: "Registra un ingreso cobrado en Finanzas (lo mismo que un ingreso nuevo en /finances o un ingreso por Telegram). Con `proyecto` queda ligado a ese proyecto y cuenta como su cobro del mes (ya no sale en fees_pendientes). Monto en MXN o USD: se guarda el original y su equivalente en USD con el tipo de cambio de la fecha. Avisa si ese proyecto ya tiene un ingreso en el mismo mes. Requiere acceso a Finanzas.",
      inputSchema: z.object({
        monto: z.number().positive(),
        moneda: z.enum(["MXN", "USD"]).describe("Moneda en que se cobró"),
        proyecto: z.string().optional(),
        descripcion: z.string().optional().describe("Por defecto: Cuota mensual - <proyecto> (<mes>) o Ingreso"),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; por defecto hoy"),
        factura: z.string().optional().describe("Número de factura, si hay"),
      }),
    },
    async ({ monto, moneda, proyecto, descripcion, fecha, factura }, ctx: ToolCtx) => {
      await requireFinance(ctx)
      const date = fecha ?? today()
      const p = proyecto ? await findProject(proyecto) : null
      const { amountUsd, rate, note } = await toUsd(monto, moneda, date)

      let dupNote = ""
      if (p) {
        const r = monthRange(date.slice(0, 7))
        const { data: dup } = await db().from("income").select("amount, date, description").eq("project_id", p.id).gte("date", r.first).lte("date", r.last)
        if (dup?.length) dupNote = `\n⚠️ ${p.name} ya tenía ${dup.length} ingreso(s) en ${r.key}: ${dup.map((d) => `${usd(Number(d.amount))} el ${d.date}`).join(", ")}. Si este es un duplicado, bórralo en /finances.`
      }
      const monthLabel = new Date(`${date}T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" })
      const desc = descripcion?.trim() || (p ? `Cuota mensual - ${p.name} (${monthLabel})` : "Ingreso")

      const { error } = await db().from("income").insert({
        project_id: p?.id ?? null,
        amount: amountUsd,
        currency: moneda,
        original_amount: monto,
        exchange_rate: rate,
        date,
        description: desc,
        invoice_number: factura?.trim() || null,
      })
      if (error) throw new Error(error.message)
      revalidatePath("/finances")
      const shown = moneda === "MXN" ? mxn(monto) : usd(monto)
      return text(`✅ Ingreso registrado: ${shown}${note}${p ? ` · ${p.name}` : ""}\n${desc}\n📅 ${date}${dupNote}`)
    },
  )

  server.registerTool(
    "fees_pendientes",
    {
      title: "Fees mensuales pendientes",
      description: "Proyectos activos con fee mensual que todavía no tienen ningún ingreso registrado en el mes (por defecto el actual) — la misma lista de cuotas pendientes de /finances — con el total pendiente. Montos en USD. Requiere acceso a Finanzas.",
      inputSchema: z.object({ mes: z.string().optional().describe("YYYY-MM") }),
    },
    async ({ mes }, ctx: ToolCtx) => {
      await requireFinance(ctx)
      const r = monthRange(mes)
      const [{ data: projects }, { data: inc }] = await Promise.all([
        db().from("projects").select("*").eq("status", "Active").gt("monthly_fee", 0).order("name"),
        db().from("income").select("project_id").gte("date", r.first).lte("date", r.last).not("project_id", "is", null),
      ])
      const paid = new Set((inc ?? []).map((i) => i.project_id))
      const pending = (projects ?? []).filter((p) => !paid.has(p.id))
      if (!pending.length) return text(`✅ Todos los proyectos activos con fee ya tienen ingreso en ${r.key}.`)
      const total = pending.reduce((s, p) => s + Number(p.monthly_fee), 0)
      return text(`Fees pendientes de ${r.key} (${pending.length}):\n${pending.map((p) => `- ${p.name}: ${feeText(p)}`).join("\n")}\nTotal pendiente: ${usd(total)} (equivalente en USD)`)
    },
  )

  server.registerTool(
    "editar_fee_proyecto",
    {
      title: "Editar fee mensual / valor de un proyecto",
      description: "Cambia el fee mensual y/o el valor de un proyecto existente (lo mismo que esos campos en 'Editar proyecto'). El fee se guarda en la moneda en que se pactó: en MXN queda el monto en pesos y su equivalente en USD (para el MRR) se actualiza a diario con el tipo de cambio. El valor del proyecto se guarda en USD (MXN se convierte con el tipo de cambio de hoy). 0 quita el fee. Sin confirmar: true solo muestra antes → después y el efecto en el MRR. Solo admin/subadmin con permiso para ver finanzas de proyectos.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        fee_mensual: z.number().nonnegative().optional(),
        valor: z.number().nonnegative().optional().describe("Valor total del proyecto"),
        moneda: z.enum(["MXN", "USD"]).describe("Moneda de los montos que das"),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const profileId = ctx.http?.authInfo?.extra?.profileId
      if (typeof profileId !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
      const { data: me } = await db().from("profiles").select("role, permissions").eq("id", profileId).single()
      if (!me || (me.role !== "admin" && me.role !== "subadmin")) throw new Error("Solo admin o subadmin pueden editar proyectos.")
      if (!can(me as never, "view_project_financials")) throw new Error("No tienes permiso para ver/editar las finanzas de proyectos.")
      if (a.fee_mensual == null && a.valor == null) throw new Error("Indica fee_mensual, valor o ambos.")

      const p = await findProject(a.proyecto)
      const { data: cur } = await db().from("projects").select("*").eq("id", p.id).single()
      const date = today()
      const patch: Record<string, number | string | null> = {}
      const notes: string[] = []
      if (a.fee_mensual != null) {
        const { rate, ...cols } = await feeColumns(a.fee_mensual > 0 ? a.fee_mensual : null, a.moneda)
        Object.assign(patch, cols)
        if (rate) notes.push(`fee en pesos; hoy equivale a ${usd(Number(cols.monthly_fee))} a ${rate.toFixed(2)} y se actualiza a diario`)
      }
      if (a.valor != null) {
        const c = await toUsd(a.valor, a.moneda, date)
        patch.project_value = c.amountUsd > 0 ? c.amountUsd : null
        if (a.moneda === "MXN" && a.valor > 0) notes.push(`Valor ${mxn(a.valor)}${c.note}`)
      }
      const fmt = (n: number | null | undefined) => (n ? usd(Number(n)) : "—")
      const lines = [
        `${p.name}`,
        ...("monthly_fee" in patch ? [`Fee mensual: ${feeText(cur ?? { monthly_fee: null })} → ${feeText(patch as { monthly_fee: number | null })}`] : []),
        ...("project_value" in patch ? [`Valor: ${fmt(cur?.project_value)} → ${fmt(patch.project_value as number | null)}`] : []),
        ...notes.map((n) => `(${n})`),
      ]
      if ("monthly_fee" in patch && cur?.status === "Active") {
        const { data: rows } = await db().from("projects").select("id, monthly_fee").eq("status", "Active").gt("monthly_fee", 0)
        const before = (rows ?? []).reduce((s, r) => s + Number(r.monthly_fee), 0)
        const after = before - Number(cur?.monthly_fee ?? 0) + Number(patch.monthly_fee ?? 0)
        lines.push(`MRR: ${usd(before)} → ${usd(after)}`)
      } else if ("monthly_fee" in patch) {
        lines.push(`(El proyecto no está activo: su fee no cuenta en el MRR.)`)
      }
      if (!a.confirmar) return text(`${lines.join("\n")}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)

      let { error } = await db().from("projects").update(patch).eq("id", p.id)
      // Sin la migración 122 todavía: un fee en USD se guarda igual que antes.
      if (error && isMissingFeeColumns(error.message) && patch.monthly_fee_currency !== "MXN") {
        const { monthly_fee_currency: _c, monthly_fee_original: _o, ...legacy } = patch
        void _c; void _o
        ;({ error } = await db().from("projects").update(legacy).eq("id", p.id))
      }
      if (error && isMissingFeeColumns(error.message)) throw new Error("Para guardar el fee en pesos falta correr la migración 122 en Supabase.")
      if (error) throw new Error(error.message)
      revalidatePath("/projects"); revalidatePath(`/projects/${p.id}`); revalidatePath("/finances")
      return text(`✅ Proyecto actualizado.\n${lines.join("\n")}\n\nEsto no registra ningún cobro: si ya pagó, usa registrar_ingreso.`)
    },
  )

  server.registerTool(
    "editar_gasto_recurrente",
    {
      title: "Editar o dar de baja un gasto recurrente",
      description:
        "Cambia o da de baja un gasto recurrente general (suscripciones, renta, etc.; lo que en /finances son gastos recurrentes). Se busca por nombre. " +
        "Cambio de monto o frecuencia (ej. 'Pastel ahora cuesta 35'): por defecto es un cambio de precio DESDE ESTE MES — el gasto anterior se cierra al final del mes pasado y se crea uno igual con el monto nuevo, así los meses anteriores conservan lo que de verdad costó. Con corregir_historial: true se edita en su lugar (para corregir un monto que estaba mal desde el inicio; cambia también los meses pasados). " +
        "Nombre y categoría se editan en su lugar. dar_de_baja: true lo desactiva desde hoy (igual que el switch de Finanzas; no se borra de los meses en que aplicó). " +
        "Monto en MXN o USD (se guarda en USD con el tipo de cambio de hoy). Sin confirmar: true solo muestra antes → después. Requiere acceso a Finanzas.",
      inputSchema: z.object({
        gasto: z.string().min(1).describe("Nombre (o parte) del gasto recurrente"),
        nuevo_monto: z.number().positive().optional(),
        moneda: z.enum(["MXN", "USD"]).default("USD").describe("Moneda de nuevo_monto"),
        frecuencia: z.enum(["mensual", "semanal", "semestral", "anual"]).optional(),
        nuevo_nombre: z.string().min(1).optional(),
        categoria: z.enum(CATS).optional(),
        dar_de_baja: z.boolean().default(false),
        corregir_historial: z.boolean().default(false),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      await requireFinance(ctx)
      const { data: all, error: e0 } = await db().from("recurring_expenses").select("*").eq("is_active", true).neq("frequency", "One-time").order("name")
      if (e0) throw new Error(e0.message)
      const rows = (all ?? []) as { id: string; name: string; amount: number; frequency: string; category: string; start_date: string | null; created_at: string; next_payment_date: string | null }[]
      const q = a.gasto.trim().toLowerCase()
      const exact = rows.filter((r) => r.name.trim().toLowerCase() === q)
      const hits = exact.length ? exact : rows.filter((r) => r.name.toLowerCase().includes(q))
      if (!hits.length) throw new Error(`No encontré un gasto recurrente activo "${a.gasto}". Activos: ${rows.map((r) => r.name).join(", ") || "ninguno"}.`)
      if (hits.length > 1) throw new Error(`"${a.gasto}" coincide con varios gastos recurrentes: ${hits.map((r) => `${r.name} (${usd(Number(r.amount))})`).join(", ")}. Sé más específico.`)
      const g = hits[0]

      const FREQ: Record<string, string> = { mensual: "Monthly", semanal: "Weekly", semestral: "Semestral", anual: "Annual" }
      const FREQ_LABEL: Record<string, string> = { Monthly: "mensual", Weekly: "semanal", Semestral: "semestral", Annual: "anual" }
      const line = (x: { name: string; amount: number; frequency: string; category: string }) =>
        `${x.name} · ${usd(Number(x.amount))} ${FREQ_LABEL[x.frequency] ?? x.frequency} · ${CAT_LABEL[x.category] ?? x.category}`
      const date = today()
      const thisMonth = monthRange(date.slice(0, 7))

      if (a.dar_de_baja) {
        const desc = `Dar de baja desde hoy (${date}):\n- ${line(g)}\nSigue contando en los meses en que ya aplicó.`
        if (!a.confirmar) return text(`${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
        const { error } = await db().from("recurring_expenses").update({ is_active: false, ended_at: date }).eq("id", g.id)
        if (error) throw new Error(error.message)
        revalidatePath("/finances"); revalidatePath("/finances/expenses")
        return text(`✅ Gasto recurrente dado de baja.\n${desc}`)
      }

      let amount = Number(g.amount)
      let rateNote = ""
      if (a.nuevo_monto != null) {
        const c = await toUsd(a.nuevo_monto, a.moneda, date)
        amount = c.amountUsd
        if (a.moneda === "MXN") rateNote = `\n(${mxn(a.nuevo_monto)}${c.note})`
      }
      const frequency = a.frecuencia ? FREQ[a.frecuencia] : g.frequency
      const after = { name: a.nuevo_nombre?.trim() || g.name, amount, frequency, category: a.categoria ?? g.category }
      const moneyChanged = amount !== Number(g.amount) || frequency !== g.frequency
      if (!moneyChanged && after.name === g.name && after.category === g.category) throw new Error("No indicaste nada que cambiar.")

      // ¿Cambio de precio desde este mes (cerrar + crear) o edición en su lugar?
      const begins = (g.start_date ?? g.created_at.slice(0, 10))
      const splitByMonth = moneyChanged && !a.corregir_historial && begins < thisMonth.first
      const prevMonthEnd = new Date(Date.UTC(Number(thisMonth.key.slice(0, 4)), Number(thisMonth.key.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10)

      const desc = [
        `Antes:   ${line(g)}`,
        `Después: ${line(after)}${rateNote}`,
        splitByMonth
          ? `Cambio de precio desde ${thisMonth.key}: el gasto actual se cierra el ${prevMonthEnd} (los meses anteriores conservan ${usd(Number(g.amount))}) y se crea uno igual con el monto nuevo desde el ${thisMonth.first}.`
          : moneyChanged
            ? `Se edita en su lugar: el monto nuevo aplica también a los meses pasados de este gasto.`
            : `Se edita en su lugar.`,
      ].join("\n")
      if (!a.confirmar) return text(`${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)

      if (splitByMonth) {
        const { error: e1 } = await db().from("recurring_expenses").insert({
          name: after.name, amount: after.amount, frequency: after.frequency, category: after.category,
          start_date: thisMonth.first, next_payment_date: g.next_payment_date, is_active: true,
        })
        if (e1) throw new Error(e1.message)
        const { error: e2 } = await db().from("recurring_expenses").update({ is_active: false, ended_at: prevMonthEnd }).eq("id", g.id)
        if (e2) throw new Error(`Se creó el gasto con el monto nuevo pero no se pudo cerrar el anterior (${e2.message}); dalo de baja en /finances para no duplicarlo.`)
      } else {
        const { error } = await db().from("recurring_expenses").update(after).eq("id", g.id)
        if (error) throw new Error(error.message)
      }
      revalidatePath("/finances"); revalidatePath("/finances/expenses")
      return text(`✅ Gasto recurrente actualizado.\n${desc}`)
    },
  )
}
