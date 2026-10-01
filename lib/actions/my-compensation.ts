"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { notify } from "@/lib/notifications/notify"
import type { CompensationProfile, BonusAgreement, PayrollItem } from "@/lib/actions/payroll"

// "Mi compensación": lo que ve cada empleado de nómina sobre SÍ MISMO
// (contrato, bonos pactados, pagos) y su reporte mensual de bonos. Todo
// con la sesión del propio empleado: las reglas de la base de datos
// (migraciones 107/108) solo le dejan leer sus propias filas, nunca las de
// otros. Fecha límite del reporte: día 3 del mes siguiente.

import { DEADLINE_DAY } from "@/lib/utils/bonus-report"

export interface BonusReportItem {
  id: string
  agreement_id: string | null
  description: string
  evidence_url: string | null
  project_id: string | null
  status: "pending" | "approved" | "rejected"
  admin_comment: string | null
  approved_amount: number | null
  project?: { name: string } | null
}
export interface BonusReport {
  id: string | null
  period_month: string
  status: "draft" | "submitted" | "reviewed"
  submitted_at: string | null
  items: BonusReportItem[]
}

const pad = (n: number) => String(n).padStart(2, "0")
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`
function deadlineOf(month: string) {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m, DEADLINE_DAY))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const today = () => new Date().toISOString().slice(0, 10)
const monthLabel = (m: string) => new Date(m + "T00:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" })

async function me() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, userId: user.id }
}

// Mes abierto para reportar: el actual; además el anterior mientras no pase
// el día 3 (fecha límite).
function openMonths(): string[] {
  const t = today()
  const cur = monthStart(t)
  const [y, m] = cur.split("-").map(Number)
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10)
  return t <= deadlineOf(prev) ? [prev, cur] : [cur]
}

export async function getMyCompensation(): Promise<{
  comp: CompensationProfile | null
  agreements: BonusAgreement[]
  payments: PayrollItem[]
  reports: BonusReport[]          // meses abiertos (editables si están en borrador)
  pastReports: BonusReport[]      // enviados/revisados anteriores
  openMonths: string[]
  projects: { id: string; name: string }[]
}> {
  const { supabase, userId } = await me()
  const [c, a, p, r, proj] = await Promise.all([
    supabase.from("compensation_profiles").select("*").eq("profile_id", userId).maybeSingle(),
    supabase.from("bonus_agreements").select("*").eq("profile_id", userId).order("created_at"),
    supabase.from("payroll_items").select("*, project:projects(name)").eq("profile_id", userId).neq("status", "skipped").order("due_date", { ascending: false }).limit(24),
    supabase.from("bonus_reports").select("*, items:bonus_report_items(*, project:projects(name))").eq("profile_id", userId).order("period_month", { ascending: false }).limit(12),
    supabase.from("project_members").select("project:projects(id, name, status)").eq("profile_id", userId),
  ])
  const months = openMonths()
  const all = (r.data ?? []) as (BonusReport & { id: string })[]
  const reports = months.map((m) => all.find((x) => x.period_month === m) ?? { id: null, period_month: m, status: "draft" as const, submitted_at: null, items: [] })
  return {
    comp: (c.data as CompensationProfile | null) ?? null,
    agreements: (a.data ?? []) as BonusAgreement[],
    payments: (p.data ?? []) as PayrollItem[],
    reports,
    pastReports: all.filter((x) => !months.includes(x.period_month)),
    openMonths: months,
    projects: ((proj.data ?? []).map((x) => x.project as unknown as { id: string; name: string; status: string }).filter((x) => x && x.status !== "Archived")).map(({ id, name }) => ({ id, name })),
  }
}

async function editableReport(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, month: string): Promise<string> {
  const m = monthStart(month)
  if (!openMonths().includes(m)) throw new Error(`El reporte de ${monthLabel(m)} ya cerró (fecha límite: día ${DEADLINE_DAY} del mes siguiente)`)
  const { data: existing } = await supabase.from("bonus_reports").select("id, status").eq("profile_id", userId).eq("period_month", m).maybeSingle()
  if (existing && existing.status !== "draft") throw new Error("Este reporte ya se envió; ya no se puede editar")
  if (existing) return existing.id
  const { data, error } = await supabase.from("bonus_reports").insert({ profile_id: userId, period_month: m }).select("id").single()
  if (error) throw new Error(error.message.includes("bonus_reports") ? "Falta correr la migración 108 en Supabase" : error.message)
  return data.id
}

export async function saveMyBonusActivity(input: { month: string; id?: string; agreementId: string | null; description: string; evidenceUrl?: string; projectId?: string | null }): Promise<void> {
  const { supabase, userId } = await me()
  if (!input.description.trim()) throw new Error("Describe la actividad")
  const reportId = await editableReport(supabase, userId, input.month)
  if (input.agreementId) {
    const { data: ag } = await supabase.from("bonus_agreements").select("id").eq("id", input.agreementId).eq("profile_id", userId).maybeSingle()
    if (!ag) throw new Error("Ese bono pactado no es tuyo")
  }
  const row = {
    report_id: reportId, agreement_id: input.agreementId || null, description: input.description.trim(),
    evidence_url: input.evidenceUrl?.trim() || null, project_id: input.projectId || null,
  }
  const { error } = input.id
    ? await supabase.from("bonus_report_items").update(row).eq("id", input.id).eq("report_id", reportId)
    : await supabase.from("bonus_report_items").insert(row)
  if (error) throw new Error(error.message)
  revalidatePath("/mi-compensacion")
}

export async function deleteMyBonusActivity(month: string, id: string): Promise<void> {
  const { supabase, userId } = await me()
  const reportId = await editableReport(supabase, userId, month)
  await supabase.from("bonus_report_items").delete().eq("id", id).eq("report_id", reportId)
  revalidatePath("/mi-compensacion")
}

export async function submitMyBonusReport(month: string): Promise<void> {
  const { supabase, userId } = await me()
  const reportId = await editableReport(supabase, userId, month)
  const { count } = await supabase.from("bonus_report_items").select("*", { count: "exact", head: true }).eq("report_id", reportId)
  if (!count) throw new Error("Agrega al menos una actividad antes de enviar")
  const { error } = await supabase.from("bonus_reports").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", reportId)
  if (error) throw new Error(error.message)

  // Aviso a los admins (Telegram).
  const admin = createAdminClient()
  const [{ data: who }, { data: admins }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", userId).single(),
    admin.from("profiles").select("id").eq("role", "admin"),
  ])
  await Promise.all((admins ?? []).map((a) => notify(a.id, "bonus_report_submitted", { employeeName: who?.full_name ?? "Alguien", month: monthLabel(monthStart(month)), count })))
  revalidatePath("/mi-compensacion")
  revalidatePath("/employees/nomina")
}

// Cron diario: recordatorio el último día del mes y el día 2 (un día antes
// de la fecha límite) a quien tiene salario fijo activo y no ha enviado.
// Exige CRON_SECRET: este archivo es "use server" y todo lo exportado es
// invocable desde el navegador.
export async function runBonusReportReminders(cronSecret: string): Promise<{ reminded: number }> {
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) throw new Error("unauthorized")
  const t = new Date()
  const iso = t.toISOString().slice(0, 10)
  const tomorrow = new Date(t.getTime() + 86_400_000).toISOString().slice(0, 10)
  const isLastDay = tomorrow.slice(8) === "01"
  const isDayBeforeDeadline = Number(iso.slice(8)) === DEADLINE_DAY - 1
  if (!isLastDay && !isDayBeforeDeadline) return { reminded: 0 }
  const month = isLastDay ? monthStart(iso) : new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)

  const admin = createAdminClient()
  const [{ data: comps }, { data: sent }] = await Promise.all([
    admin.from("compensation_profiles").select("profile_id").eq("active", true).not("base_salary", "is", null),
    admin.from("bonus_reports").select("profile_id").eq("period_month", month).neq("status", "draft"),
  ])
  const done = new Set((sent ?? []).map((r) => r.profile_id))
  const targets = (comps ?? []).filter((c) => !done.has(c.profile_id))
  const deadline = new Date(deadlineOf(month) + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long" })
  await Promise.all(targets.map((c) => notify(c.profile_id, "bonus_report_reminder", { month: monthLabel(month), deadline })))
  return { reminded: targets.length }
}
