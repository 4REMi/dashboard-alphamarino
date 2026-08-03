"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { normalizeToMonthly } from "@/lib/types"
import type { ExpenseFrequency, ExpenseCategory } from "@/lib/types"

// ============================================================
// RECURRING EXPENSES
// ============================================================

export async function getRecurringExpenses() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("*")
    .order("category")
  if (error) throw error
  return data
}

export async function createRecurringExpense(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("recurring_expenses").insert({
    name: formData.get("name") as string,
    amount: Number(formData.get("amount")),
    frequency: formData.get("frequency") as ExpenseFrequency,
    category: formData.get("category") as ExpenseCategory,
    next_payment_date: (formData.get("next_payment_date") as string) || null,
    expense_date: (formData.get("expense_date") as string) || null,
    is_active: true,
  })
  if (error) throw error
  revalidatePath("/finances")
  revalidatePath("/finances/expenses")
}

export async function updateRecurringExpense(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("recurring_expenses")
    .update({
      name: formData.get("name") as string,
      amount: Number(formData.get("amount")),
      frequency: formData.get("frequency") as ExpenseFrequency,
      category: formData.get("category") as ExpenseCategory,
      next_payment_date: (formData.get("next_payment_date") as string) || null,
      expense_date: (formData.get("expense_date") as string) || null,
      is_active: formData.get("is_active") !== null,
    })
    .eq("id", id)
  if (error) throw error
  revalidatePath("/finances/expenses")
  revalidatePath("/finances")
}

export async function deleteRecurringExpense(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("recurring_expenses").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/finances/expenses")
}

// ============================================================
// INCOME
// ============================================================

export async function getIncome(projectId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from("income")
    .select("*, project:projects(id, name)")
    .order("date", { ascending: false })
  if (projectId) query = query.eq("project_id", projectId)
  const { data, error } = await query
  if (error) throw error
  return data
}

// Tipo de cambio histórico USD -> MXN (Frankfurter, datos del Banco Central Europeo, sin API key)
export async function getExchangeRate(date: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.frankfurter.app/${date}?from=USD&to=MXN`, { cache: "no-store" })
    if (!res.ok) return null
    const data = await res.json()
    const rate = data?.rates?.MXN
    return typeof rate === "number" ? rate : null
  } catch {
    return null
  }
}

function buildIncomePayload(formData: FormData) {
  const taxRate = formData.get("tax_rate") as string
  const taxAmount = formData.get("tax_amount") as string

  const currency = ((formData.get("currency") as string) || "USD") as "USD" | "MXN"
  const originalAmount = Number(formData.get("original_amount"))
  const exchangeRate = currency === "MXN" ? Number(formData.get("exchange_rate")) : 1
  const amount = currency === "MXN" && exchangeRate ? originalAmount / exchangeRate : originalAmount

  return {
    project_id: (formData.get("project_id") as string) || null,
    amount,
    currency,
    original_amount: originalAmount,
    exchange_rate: exchangeRate || null,
    tax_rate: taxRate ? Number(taxRate) : null,
    tax_amount: taxAmount ? Number(taxAmount) : null,
    date: formData.get("date") as string,
    description: (formData.get("description") as string) || null,
    invoice_number: (formData.get("invoice_number") as string) || null,
  }
}

export async function createIncome(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("income").insert(buildIncomePayload(formData))
  if (error) throw error
  revalidatePath("/finances")
}

export async function updateIncome(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("income").update(buildIncomePayload(formData)).eq("id", id)
  if (error) throw error
  revalidatePath("/finances")
}

export async function deleteIncome(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("income").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/finances")
}

// Proyectos "Active" con monthly_fee que aún no tienen un Income registrado este mes
export async function getPendingMonthlyFees() {
  const supabase = await createClient()
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

  const [projectsRes, incomeRes] = await Promise.all([
    supabase.from("projects").select("id, name, monthly_fee").eq("status", "Active").gt("monthly_fee", 0),
    supabase.from("income").select("project_id").gte("date", firstDay).lte("date", lastDay).not("project_id", "is", null),
  ])

  const collectedProjectIds = new Set((incomeRes.data ?? []).map((i) => i.project_id))

  return (projectsRes.data ?? [])
    .filter((p) => !collectedProjectIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, monthly_fee: Number(p.monthly_fee) }))
}

// Registra la cuota mensual de un proyecto como Income (USD, fecha de hoy)
export async function collectMonthlyFee(formData: FormData) {
  const supabase = await createClient()
  const projectId = formData.get("project_id") as string
  const projectName = formData.get("project_name") as string
  const amount = Number(formData.get("amount"))

  const today = new Date()
  const monthLabel = today.toLocaleDateString("es-MX", { month: "long", year: "numeric" })

  const { error } = await supabase.from("income").insert({
    project_id: projectId,
    amount,
    currency: "USD",
    original_amount: amount,
    exchange_rate: 1,
    date: today.toISOString().split("T")[0],
    description: `Cuota mensual - ${projectName} (${monthLabel})`,
  })
  if (error) throw error
  revalidatePath("/finances")
}

// ============================================================
// PROJECT EXPENSES
// ============================================================

export async function getProjectExpenses(projectId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from("project_expenses")
    .select("*, project:projects(id, name)")
    .order("date", { ascending: false })
  if (projectId) query = query.eq("project_id", projectId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createProjectExpense(formData: FormData) {
  const supabase = await createClient()
  const taxRate = formData.get("tax_rate") as string
  const taxAmount = formData.get("tax_amount") as string
  const { error } = await supabase.from("project_expenses").insert({
    project_id: formData.get("project_id") as string,
    amount: Number(formData.get("amount")),
    tax_rate: taxRate ? Number(taxRate) : null,
    tax_amount: taxAmount ? Number(taxAmount) : null,
    date: formData.get("date") as string,
    description: (formData.get("description") as string) || null,
    category: (formData.get("category") as string) || null,
  })
  if (error) throw error
  revalidatePath("/finances")
}

export async function deleteProjectExpense(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("project_expenses").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/finances")
}

// ============================================================
// DOMAINS
// ============================================================

export async function getDomains() {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from("domains")
      .select("*, customer:customers(id, name)")
      .order("renewal_date", { ascending: true })
    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

function domainFieldsFromForm(formData: FormData) {
  const customerId = formData.get("customer_id") as string
  const maintenanceType = (formData.get("maintenance_type") as string) || "client"
  return {
    domain: formData.get("domain") as string,
    customer_id: customerId && customerId !== "none" ? customerId : null,
    registrar: (formData.get("registrar") as string) || null,
    hosted_at: (formData.get("hosted_at") as string) || null,
    renewal_date: (formData.get("renewal_date") as string) || null,
    renewal_cost: formData.get("renewal_cost") ? Number(formData.get("renewal_cost")) : null,
    maintenance_type: maintenanceType,
    maintenance_cost:
      maintenanceType === "client" && formData.get("maintenance_cost")
        ? Number(formData.get("maintenance_cost"))
        : null,
    last_maintenance_date: (formData.get("last_maintenance_date") as string) || null,
    last_maintenance_notes: (formData.get("last_maintenance_notes") as string) || null,
    notes: (formData.get("notes") as string) || null,
  }
}

export async function createDomain(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("domains").insert(domainFieldsFromForm(formData))
  if (error) throw error
  revalidatePath("/finances/domains")
}

export async function updateDomain(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("domains")
    .update(domainFieldsFromForm(formData))
    .eq("id", id)
  if (error) throw error
  revalidatePath("/finances/domains")
}

export async function deleteDomain(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("domains").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/finances/domains")
}

function addOneYear(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split("T")[0]
}

// Marca la mantención/renovación como saldada. chargeDomain/chargeMaintenance
// controlan, caso por caso, si el cobro correspondiente (renewal_cost /
// maintenance_cost) crea un Income — no hay regla fija, el usuario decide en
// el modal cuáles cuotas se cobraron en esta renovación. extendYear, si viene
// true, empuja renewal_date un año a partir de su valor actual (no de la
// fecha del modal), para no perder tiempo ya pagado si se renueva antes de
// vencer.
export async function renewDomain(domainId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: domain, error: dErr } = await supabase
    .from("domains")
    .select("domain, renewal_date, renewal_cost, maintenance_cost")
    .eq("id", domainId)
    .single()
  if (dErr || !domain) throw new Error("Dominio no encontrado")

  const date = formData.get("date") as string
  const notes = (formData.get("notes") as string) || null
  const chargeDomain = formData.get("charge_domain") === "true"
  const chargeMaintenance = formData.get("charge_maintenance") === "true"
  const extendYear = formData.get("extend_year") === "true"

  const charges: { amount: number; description: string }[] = []
  if (chargeDomain && domain.renewal_cost) {
    charges.push({ amount: Number(domain.renewal_cost), description: `Renovación dominio ${domain.domain}` })
  }
  if (chargeMaintenance && domain.maintenance_cost) {
    charges.push({ amount: Number(domain.maintenance_cost), description: `Mantenimiento ${domain.domain}` })
  }

  if (charges.length > 0) {
    const exchangeRate = await getExchangeRate(date)
    const { error: iErr } = await supabase.from("income").insert(
      charges.map((c) => ({
        project_id: null,
        amount: exchangeRate ? c.amount / exchangeRate : c.amount,
        currency: "MXN",
        original_amount: c.amount,
        exchange_rate: exchangeRate,
        date,
        description: c.description,
      }))
    )
    if (iErr) throw iErr
  }

  const update: Record<string, string | null> = { last_maintenance_date: date, last_maintenance_notes: notes }
  if (extendYear && domain.renewal_date) {
    update.renewal_date = addOneYear(domain.renewal_date)
  }

  const { error: uErr } = await supabase.from("domains").update(update).eq("id", domainId)
  if (uErr) throw uErr

  revalidatePath("/finances/domains")
  revalidatePath("/finances")
}

// ============================================================
// FINANCIAL SUMMARY (for home + finances overview)
// ============================================================

export async function getFinancialSummary() {
  const supabase = await createClient()

  const now = new Date()
  const firstDay    = new Date(now.getFullYear(), now.getMonth(),     1).toISOString().split("T")[0]
  const lastDay     = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]
  const prevFirst   = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0]
  const prevLast    = new Date(now.getFullYear(), now.getMonth(),     0).toISOString().split("T")[0]

  const [incomeRes, projectExpensesRes, recurringRes, mrrRes,
         prevIncomeRes, prevExpensesRes] = await Promise.all([
    supabase.from("income").select("amount").gte("date", firstDay).lte("date", lastDay),
    supabase.from("project_expenses").select("amount").gte("date", firstDay).lte("date", lastDay),
    supabase.from("recurring_expenses").select("amount, frequency, expense_date").eq("is_active", true),
    supabase.from("projects").select("monthly_fee").eq("status", "Active").gt("monthly_fee", 0),
    supabase.from("income").select("amount").gte("date", prevFirst).lte("date", prevLast),
    supabase.from("project_expenses").select("amount").gte("date", prevFirst).lte("date", prevLast),
  ])

  const fixedMonthly = (recurringRes.data ?? []).reduce(
    (s, e) => s + normalizeToMonthly(Number(e.amount), e.frequency as ExpenseFrequency), 0
  )

  const oneTimeInRange = (start: string, end: string) =>
    (recurringRes.data ?? [])
      .filter((e) => e.frequency === "One-time" && e.expense_date && e.expense_date >= start && e.expense_date <= end)
      .reduce((s, e) => s + Number(e.amount), 0)

  const monthlyRecurring = fixedMonthly + oneTimeInRange(firstDay, lastDay)

  const monthlyIncome          = (incomeRes.data ?? []).reduce((s, i) => s + Number(i.amount), 0)
  const monthlyProjectExpenses = (projectExpensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0)
  const mrr                    = (mrrRes.data ?? []).reduce((s, p) => s + Number(p.monthly_fee ?? 0), 0)

  const prevRecurring = fixedMonthly + oneTimeInRange(prevFirst, prevLast)
  const prevIncome   = (prevIncomeRes.data ?? []).reduce((s, i) => s + Number(i.amount), 0)
  const prevExpenses = (prevExpensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0) + prevRecurring

  const monthlyExpenses = monthlyProjectExpenses + monthlyRecurring
  const netMargin       = monthlyIncome - monthlyExpenses
  const prevNetMargin   = prevIncome - prevExpenses

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlyRecurring,
    monthlyProjectExpenses,
    netMargin,
    mrr,
    prevIncome,
    prevExpenses,
    prevNetMargin,
    marginPct: monthlyIncome > 0 ? (netMargin / monthlyIncome) * 100 : 0,
  }
}

// ============================================================
// CHART DATA (12-month history)
// ============================================================

export async function getMonthlyChartData() {
  const supabase = await createClient()

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
  twelveMonthsAgo.setDate(1)
  const startDate = twelveMonthsAgo.toISOString().split("T")[0]

  const [incomeRes, expensesRes, recurringRes] = await Promise.all([
    supabase.from("income").select("amount, date").gte("date", startDate),
    supabase.from("project_expenses").select("amount, date").gte("date", startDate),
    supabase.from("recurring_expenses").select("amount, frequency, category, expense_date").eq("is_active", true),
  ])

  // Normalized monthly recurring cost (fixed, same every month), por categoría
  const fixedByCategory: Record<string, number> = {}
  for (const e of recurringRes.data ?? []) {
    const monthly = normalizeToMonthly(Number(e.amount), e.frequency as ExpenseFrequency)
    if (monthly === 0) continue
    fixedByCategory[e.category] = (fixedByCategory[e.category] ?? 0) + monthly
  }
  const fixedMonthly = Object.values(fixedByCategory).reduce((s, v) => s + v, 0)

  const months: Record<string, {
    month: string; label: string; ingresos: number; gastos: number; margen: number
    gastosBreakdown: Record<string, number>
  }> = {}

  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const key = d.toISOString().slice(0, 7)
    months[key] = {
      month: key,
      label: d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }),
      ingresos: 0,
      gastos: fixedMonthly,  // base: recurring expenses normalized
      margen: 0,
      gastosBreakdown: { ...fixedByCategory },
    }
  }

  for (const entry of incomeRes.data ?? []) {
    const key = entry.date.slice(0, 7)
    if (months[key]) months[key].ingresos += Number(entry.amount)
  }

  for (const entry of expensesRes.data ?? []) {
    const key = entry.date.slice(0, 7)
    if (months[key]) {
      months[key].gastos += Number(entry.amount)
      months[key].gastosBreakdown.Proyectos = (months[key].gastosBreakdown.Proyectos ?? 0) + Number(entry.amount)
    }
  }

  for (const entry of recurringRes.data ?? []) {
    if (entry.frequency !== "One-time" || !entry.expense_date) continue
    const key = entry.expense_date.slice(0, 7)
    if (months[key]) {
      months[key].gastos += Number(entry.amount)
      months[key].gastosBreakdown[entry.category] = (months[key].gastosBreakdown[entry.category] ?? 0) + Number(entry.amount)
    }
  }

  return Object.values(months).map((m) => ({
    ...m,
    ingresos: Math.round(m.ingresos),
    gastos: Math.round(m.gastos),
    margen: Math.round(m.ingresos - m.gastos),
    gastosBreakdown: Object.fromEntries(
      Object.entries(m.gastosBreakdown).map(([k, v]) => [k, Math.round(v)])
    ),
  }))
}

// ============================================================
// TOP CLIENTS (last 12 months)
// ============================================================

export async function getTopClients() {
  const supabase = await createClient()

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
  twelveMonthsAgo.setDate(1)
  const startDate = twelveMonthsAgo.toISOString().split("T")[0]

  const { data, error } = await supabase
    .from("income")
    .select("amount, project:projects(id, name, customer:customers(id, name, company))")
    .gte("date", startDate)

  if (error || !data) return []

  const clientMap: Record<string, { id: string; name: string; company: string | null; total: number }> = {}

  for (const entry of data) {
    const project = (entry.project as unknown) as { id: string; name: string; customer: { id: string; name: string; company: string | null } | null } | null
    const customer = project?.customer
    if (!customer) continue
    if (!clientMap[customer.id]) {
      clientMap[customer.id] = { id: customer.id, name: customer.name, company: customer.company, total: 0 }
    }
    clientMap[customer.id].total += Number(entry.amount)
  }

  return Object.values(clientMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
}
