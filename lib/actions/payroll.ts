"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getExchangeRate } from "@/lib/actions/finances"

// Nómina (solo admin). Salario fijo mensual con día de pago por persona,
// bonos y comisiones discrecionales (con acuerdos de bono guardados para
// no olvidar lo pactado). Marcar un pago como pagado crea su gasto en
// Finanzas (recurring_expenses One-time, categoría Payroll, en USD).

export type Currency = "USD" | "MXN"
export type PayrollKind = "salary" | "bonus" | "commission"

export interface CompensationProfile {
  profile_id: string
  scheme: "fixed" | "commission" | "mixed"
  base_salary: number | null
  currency: Currency
  pay_day: number
  starts_on: string
  active: boolean
  notes: string | null
}

export interface BonusAgreement { id: string; profile_id: string; title: string; amount: number; currency: Currency }

export interface PayrollItem {
  id: string
  profile_id: string
  kind: PayrollKind
  amount: number
  currency: Currency
  period_month: string
  due_date: string
  reason: string | null
  project_id: string | null
  status: "pending" | "paid" | "skipped"
  paid_at: string | null
  amount_usd: number | null
  exchange_rate: number | null
  profile?: { full_name: string } | null
  project?: { name: string } | null
}

async function admin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (data?.role !== "admin") throw new Error("Solo un admin puede ver o editar la nómina")
  return { supabase, userId: user.id }
}

const pad = (n: number) => String(n).padStart(2, "0")
const today = () => new Date().toISOString().slice(0, 10)
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`
function dueDate(month: string, payDay: number) {
  const [y, m] = month.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${pad(m)}-${pad(Math.min(payDay, last))}`
}
function addMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`
}
// Solo si la tabla de verdad no existe (no cualquier error que la mencione).
const migrationHint = (msg: string) => /(relation|table) .*(payroll_items|compensation_|bonus_agreements).*(does not exist|not find)/i.test(msg) || /Could not find the table/i.test(msg) ? "Falta correr la migración 107 en Supabase" : msg

function revalidate(profileId?: string) {
  revalidatePath("/employees/nomina")
  revalidatePath("/finances")
  if (profileId) revalidatePath(`/employees/${profileId}`)
}

// ── Compensación por persona ────────────────────────────────────────
export async function getCompensation(profileId: string): Promise<{ comp: CompensationProfile | null; agreements: BonusAgreement[]; history: { amount: number | null; currency: string; effective_from: string }[]; items: PayrollItem[] }> {
  const { supabase } = await admin()
  const [c, a, h, i] = await Promise.all([
    supabase.from("compensation_profiles").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase.from("bonus_agreements").select("*").eq("profile_id", profileId).order("created_at"),
    supabase.from("compensation_salary_history").select("amount, currency, effective_from").eq("profile_id", profileId).order("effective_from", { ascending: false }),
    supabase.from("payroll_items").select("*, project:projects(name)").eq("profile_id", profileId).order("due_date", { ascending: false }).limit(24),
  ])
  if (c.error) throw new Error(migrationHint(c.error.message))
  return { comp: c.data as CompensationProfile | null, agreements: (a.data ?? []) as BonusAgreement[], history: h.data ?? [], items: (i.data ?? []) as PayrollItem[] }
}

export async function saveCompensation(profileId: string, input: Omit<CompensationProfile, "profile_id">): Promise<void> {
  const { supabase } = await admin()
  if (input.scheme !== "commission" && !(Number(input.base_salary) > 0)) throw new Error("Indica el salario base mensual")
  const { data: prev } = await supabase.from("compensation_profiles").select("base_salary, currency").eq("profile_id", profileId).maybeSingle()
  const base = input.scheme === "commission" ? null : Number(input.base_salary)
  const { error } = await supabase.from("compensation_profiles").upsert({
    profile_id: profileId, ...input, base_salary: base, pay_day: Math.min(31, Math.max(1, Math.round(input.pay_day))), updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(migrationHint(error.message))
  if (!prev || Number(prev.base_salary ?? 0) !== Number(base ?? 0) || prev.currency !== input.currency) {
    await supabase.from("compensation_salary_history").insert({ profile_id: profileId, amount: base, currency: input.currency, effective_from: today() })
  }
  // Salarios pendientes de este mes en adelante se actualizan al nuevo monto.
  if (base !== null) {
    await supabase.from("payroll_items").update({ amount: base, currency: input.currency })
      .eq("profile_id", profileId).eq("kind", "salary").eq("status", "pending").gte("period_month", monthStart(today()))
  }
  revalidate(profileId)
}

export async function saveBonusAgreement(profileId: string, a: { id?: string; title: string; amount: number; currency: Currency }): Promise<void> {
  const { supabase } = await admin()
  if (!a.title.trim() || !(a.amount > 0)) throw new Error("Título y monto son obligatorios")
  const row = { profile_id: profileId, title: a.title.trim(), amount: a.amount, currency: a.currency }
  const { error } = a.id ? await supabase.from("bonus_agreements").update(row).eq("id", a.id) : await supabase.from("bonus_agreements").insert(row)
  if (error) throw new Error(migrationHint(error.message))
  revalidate(profileId)
}

export async function deleteBonusAgreement(id: string, profileId: string): Promise<void> {
  const { supabase } = await admin()
  await supabase.from("bonus_agreements").delete().eq("id", id)
  revalidate(profileId)
}

// ── Nómina ──────────────────────────────────────────────────────────
// Genera (si faltan) los salarios del mes pedido y de los meses anteriores
// desde que arrancó cada persona (máx. 6 meses atrás), para que nada vencido
// se pierda. Se llama al abrir la vista.
async function ensureSalaries(supabase: Awaited<ReturnType<typeof createClient>>, upTo: string) {
  const { data: comps } = await supabase.from("compensation_profiles").select("*").eq("active", true).not("base_salary", "is", null)
  const rows: Record<string, unknown>[] = []
  for (const c of (comps ?? []) as CompensationProfile[]) {
    let m = monthStart(c.starts_on)
    const floor = addMonth(upTo, -6)
    if (m < floor) m = floor
    for (; m <= upTo; m = addMonth(m, 1)) {
      rows.push({ profile_id: c.profile_id, kind: "salary", amount: c.base_salary, currency: c.currency, period_month: m, due_date: dueDate(m, c.pay_day), reason: "Salario base" })
    }
  }
  if (rows.length) await supabase.from("payroll_items").upsert(rows, { onConflict: "profile_id,period_month", ignoreDuplicates: true })
}

export interface PayrollOverview {
  month: string
  items: PayrollItem[]           // del mes elegido
  overdue: PayrollItem[]         // pendientes de meses anteriores
  people: { id: string; full_name: string; comp: CompensationProfile | null; agreements: BonusAgreement[] }[]
  legacyPayroll: { id: string; name: string; amount: number }[] // gastos "Payroll" recurrentes aún activos
}

export async function getPayroll(month?: string): Promise<PayrollOverview> {
  const { supabase } = await admin()
  const m = monthStart(month ?? today())
  const current = monthStart(today())
  await ensureSalaries(supabase, m > current ? m : current)
  const [items, overdue, people, comps, agreements, legacy] = await Promise.all([
    supabase.from("payroll_items").select("*, profile:profiles!payroll_items_profile_id_fkey(full_name), project:projects(name)").eq("period_month", m).order("due_date"),
    supabase.from("payroll_items").select("*, profile:profiles!payroll_items_profile_id_fkey(full_name), project:projects(name)").eq("status", "pending").lt("period_month", m).order("due_date"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("compensation_profiles").select("*"),
    supabase.from("bonus_agreements").select("*"),
    supabase.from("recurring_expenses").select("id, name, amount, frequency").eq("category", "Payroll").eq("is_active", true).neq("frequency", "One-time"),
  ])
  if (items.error) throw new Error(migrationHint(items.error.message))
  const compBy = new Map(((comps.data ?? []) as CompensationProfile[]).map((c) => [c.profile_id, c]))
  return {
    month: m,
    items: (items.data ?? []) as PayrollItem[],
    overdue: (overdue.data ?? []) as PayrollItem[],
    people: (people.data ?? []).map((p) => ({
      id: p.id as string, full_name: p.full_name as string, comp: compBy.get(p.id as string) ?? null,
      agreements: ((agreements.data ?? []) as BonusAgreement[]).filter((a) => a.profile_id === p.id),
    })),
    legacyPayroll: (legacy.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, amount: Number(r.amount) })),
  }
}

export async function addPayrollItem(input: {
  profileId: string; kind: "bonus" | "commission"; amount: number; currency: Currency
  reason: string; projectId?: string | null; agreementId?: string | null; month?: string; dueDate?: string
}): Promise<void> {
  const { supabase, userId } = await admin()
  if (!(input.amount > 0)) throw new Error("El monto debe ser mayor a 0")
  if (!input.reason.trim()) throw new Error("Indica el motivo")
  const m = monthStart(input.month ?? today())
  const { error } = await supabase.from("payroll_items").insert({
    profile_id: input.profileId, kind: input.kind, amount: input.amount, currency: input.currency,
    period_month: m, due_date: input.dueDate ?? today(), reason: input.reason.trim(),
    project_id: input.projectId || null, agreement_id: input.agreementId || null, created_by: userId,
  })
  if (error) throw new Error(migrationHint(error.message))
  revalidate(input.profileId)
}

// Pagar: convierte a USD con el tipo de cambio del día (si es MXN) y crea
// el gasto en Finanzas con la fecha real del pago.
export async function markPaid(itemIds: string[], paidAt?: string): Promise<{ paid: number }> {
  const { supabase } = await admin()
  const date = paidAt ?? today()
  const { data: items } = await supabase.from("payroll_items").select("*, profile:profiles!payroll_items_profile_id_fkey(full_name)").in("id", itemIds).eq("status", "pending")
  let rate: number | null = null
  let paid = 0
  for (const it of (items ?? []) as PayrollItem[]) {
    if (it.currency === "MXN" && rate === null) {
      rate = await getExchangeRate(date)
      if (!rate) throw new Error("No se pudo obtener el tipo de cambio USD/MXN; intenta de nuevo")
    }
    const usd = it.currency === "MXN" ? Math.round((Number(it.amount) / rate!) * 100) / 100 : Number(it.amount)
    const label = it.kind === "salary" ? `Salario ${new Date(it.period_month + "T00:00:00").toLocaleDateString("es-MX", { month: "short", year: "numeric" })}` : it.kind === "bonus" ? "Bono" : "Comisión"
    const { data: exp, error: expErr } = await supabase.from("recurring_expenses").insert({
      name: `Nómina — ${it.profile?.full_name ?? "Persona"} · ${label}${it.reason && it.kind !== "salary" ? ` (${it.reason})` : ""}${it.currency === "MXN" ? ` · $${Number(it.amount).toLocaleString("en-US")} MXN` : ""}`,
      amount: usd, frequency: "One-time", category: "Payroll", start_date: date, expense_date: date, is_active: true,
    }).select("id").single()
    if (expErr) throw new Error(expErr.message)
    await supabase.from("payroll_items").update({
      status: "paid", paid_at: date, amount_usd: usd, exchange_rate: it.currency === "MXN" ? rate : null, expense_id: exp.id,
    }).eq("id", it.id)
    paid++
  }
  revalidate()
  return { paid }
}

// Deshacer un pago: vuelve a pendiente y borra su gasto en Finanzas.
export async function unmarkPaid(itemId: string): Promise<void> {
  const { supabase } = await admin()
  const { data: it } = await supabase.from("payroll_items").select("expense_id, profile_id").eq("id", itemId).single()
  if (it?.expense_id) await supabase.from("recurring_expenses").delete().eq("id", it.expense_id)
  await supabase.from("payroll_items").update({ status: "pending", paid_at: null, amount_usd: null, exchange_rate: null, expense_id: null }).eq("id", itemId)
  revalidate(it?.profile_id)
}

// Omitir (ej. un mes sin salario) o quitar un bono/comisión no pagado.
export async function skipOrDeleteItem(itemId: string): Promise<void> {
  const { supabase } = await admin()
  const { data: it } = await supabase.from("payroll_items").select("kind, status, profile_id").eq("id", itemId).single()
  if (!it || it.status === "paid") throw new Error("Primero deshaz el pago")
  if (it.kind === "salary") await supabase.from("payroll_items").update({ status: it.status === "skipped" ? "pending" : "skipped" }).eq("id", itemId)
  else await supabase.from("payroll_items").delete().eq("id", itemId)
  revalidate(it.profile_id)
}

// Dar de baja los gastos "Payroll" recurrentes viejos al arrancar la nómina:
// cuentan hasta el fin del mes anterior (el historial se conserva) y desde
// este mes mandan los pagos reales.
export async function retireLegacyPayroll(ids: string[]): Promise<void> {
  const { supabase } = await admin()
  const d = new Date()
  const lastOfPrev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10)
  const { error } = await supabase.from("recurring_expenses").update({ is_active: false, ended_at: lastOfPrev }).in("id", ids).eq("category", "Payroll")
  if (error) throw new Error(error.message)
  revalidate()
}

// Costo de equipo de un mes (USD) para Finanzas: lo pagado ese mes.
export async function getTeamCost(month: string): Promise<{ paidUsd: number; pendingByCurrency: Record<string, number> }> {
  const { supabase } = await admin()
  const m = monthStart(month)
  const end = addMonth(m, 1)
  const [{ data: paid }, { data: pending }] = await Promise.all([
    supabase.from("payroll_items").select("amount_usd").eq("status", "paid").gte("paid_at", m).lt("paid_at", end),
    supabase.from("payroll_items").select("amount, currency").eq("status", "pending").eq("period_month", m),
  ])
  const pendingByCurrency: Record<string, number> = {}
  for (const p of pending ?? []) pendingByCurrency[p.currency as string] = (pendingByCurrency[p.currency as string] ?? 0) + Number(p.amount)
  return { paidUsd: (paid ?? []).reduce((s, r) => s + Number(r.amount_usd ?? 0), 0), pendingByCurrency }
}


// ── Reportes de bonos (revisión del admin) ───────────────────────────
export interface AdminBonusReport {
  id: string
  profile_id: string
  period_month: string
  status: "draft" | "submitted" | "reviewed"
  submitted_at: string | null
  profile?: { full_name: string } | null
  items: {
    id: string; agreement_id: string | null; description: string; evidence_url: string | null
    status: "pending" | "approved" | "rejected"; admin_comment: string | null; approved_amount: number | null
    project?: { name: string } | null
  }[]
}

// Reportes enviados de un mes (o en revisión) + quién con salario fijo no ha enviado.
export async function getBonusReports(month: string): Promise<{ reports: AdminBonusReport[]; missing: { id: string; full_name: string }[] }> {
  const { supabase } = await admin()
  const m = monthStart(month)
  const [{ data: reports, error }, { data: comps }] = await Promise.all([
    supabase.from("bonus_reports").select("*, profile:profiles(full_name), items:bonus_report_items(*, project:projects(name))").eq("period_month", m).neq("status", "draft"),
    supabase.from("compensation_profiles").select("profile_id, profile:profiles(full_name)").eq("active", true).not("base_salary", "is", null),
  ])
  if (error) return { reports: [], missing: [] }
  const sent = new Set((reports ?? []).map((r) => r.profile_id as string))
  return {
    reports: (reports ?? []) as AdminBonusReport[],
    missing: (comps ?? []).filter((c) => !sent.has(c.profile_id as string)).map((c) => ({ id: c.profile_id as string, full_name: (c.profile as unknown as { full_name: string } | null)?.full_name ?? "—" })),
  }
}

// Aprobar crea el bono pendiente en Nómina (monto del acuerdo o el ajustado);
// rechazar guarda el comentario que ve el empleado.
export async function reviewBonusActivity(itemId: string, decision: "approved" | "rejected", opts: { amount?: number; currency?: Currency; comment?: string } = {}): Promise<void> {
  const { supabase, userId } = await admin()
  const { data: it } = await supabase.from("bonus_report_items")
    .select("*, report:bonus_reports(profile_id, period_month), agreement:bonus_agreements(title, amount, currency)").eq("id", itemId).single()
  if (!it) throw new Error("Actividad no encontrada")
  if (it.payroll_item_id) {
    const { data: pi } = await supabase.from("payroll_items").select("status").eq("id", it.payroll_item_id).maybeSingle()
    if (pi?.status === "paid") throw new Error("Ese bono ya se pagó; deshaz el pago en Nómina primero")
    await supabase.from("payroll_items").delete().eq("id", it.payroll_item_id)
  }
  const report = it.report as { profile_id: string; period_month: string }
  const ag = it.agreement as { title: string; amount: number; currency: Currency } | null
  let payrollItemId: string | null = null
  let amount: number | null = null
  if (decision === "approved") {
    amount = opts.amount ?? (ag ? Number(ag.amount) : NaN)
    if (!(amount > 0)) throw new Error("Indica el monto del bono (la actividad no tiene bono pactado)")
    const { data: pi, error } = await supabase.from("payroll_items").insert({
      profile_id: report.profile_id, kind: "bonus", amount, currency: opts.currency ?? ag?.currency ?? "USD",
      period_month: report.period_month, due_date: today(), reason: ag?.title ?? it.description.slice(0, 80),
      project_id: it.project_id, agreement_id: it.agreement_id, created_by: userId,
    }).select("id").single()
    if (error) throw new Error(error.message)
    payrollItemId = pi.id
  }
  await supabase.from("bonus_report_items").update({
    status: decision, admin_comment: opts.comment?.trim() || null, approved_amount: amount, payroll_item_id: payrollItemId,
  }).eq("id", itemId)
  revalidate(report.profile_id)
  revalidatePath("/mi-compensacion")
}

// Cerrar la revisión: avisa al empleado con el resultado.
export async function finishBonusReview(reportId: string): Promise<void> {
  const { supabase } = await admin()
  const { data: r } = await supabase.from("bonus_reports").select("profile_id, period_month, items:bonus_report_items(status)").eq("id", reportId).single()
  if (!r) throw new Error("Reporte no encontrado")
  const items = (r.items ?? []) as { status: string }[]
  if (items.some((i) => i.status === "pending")) throw new Error("Aún hay actividades sin revisar")
  await supabase.from("bonus_reports").update({ status: "reviewed" }).eq("id", reportId)
  const { notify } = await import("@/lib/notifications/notify")
  await notify(r.profile_id, "bonus_report_reviewed", {
    month: new Date(r.period_month + "T00:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" }),
    approved: items.filter((i) => i.status === "approved").length,
    rejected: items.filter((i) => i.status === "rejected").length,
  })
  revalidate(r.profile_id)
  revalidatePath("/mi-compensacion")
}

// Reabrir un reporte enviado para que el empleado lo corrija.
export async function reopenBonusReport(reportId: string): Promise<void> {
  const { supabase } = await admin()
  await supabase.from("bonus_reports").update({ status: "draft", submitted_at: null }).eq("id", reportId)
  revalidate()
  revalidatePath("/mi-compensacion")
}
