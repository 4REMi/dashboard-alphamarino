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

export async function createIncome(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("income").insert({
    project_id: (formData.get("project_id") as string) || null,
    amount: Number(formData.get("amount")),
    date: formData.get("date") as string,
    description: (formData.get("description") as string) || null,
    invoice_number: (formData.get("invoice_number") as string) || null,
  })
  if (error) throw error
  revalidatePath("/finances")
}

export async function deleteIncome(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("income").delete().eq("id", id)
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
  const { error } = await supabase.from("project_expenses").insert({
    project_id: formData.get("project_id") as string,
    amount: Number(formData.get("amount")),
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

export async function createDomain(formData: FormData) {
  const supabase = await createClient()
  const customerId = formData.get("customer_id") as string
  const { error } = await supabase.from("domains").insert({
    domain: formData.get("domain") as string,
    customer_id: customerId && customerId !== "none" ? customerId : null,
    registrar: (formData.get("registrar") as string) || null,
    renewal_date: (formData.get("renewal_date") as string) || null,
    renewal_cost: formData.get("renewal_cost") ? Number(formData.get("renewal_cost")) : null,
    notes: (formData.get("notes") as string) || null,
  })
  if (error) throw error
  revalidatePath("/finances/domains")
}

export async function updateDomain(id: string, formData: FormData) {
  const supabase = await createClient()
  const customerId = formData.get("customer_id") as string
  const { error } = await supabase
    .from("domains")
    .update({
      domain: formData.get("domain") as string,
      customer_id: customerId && customerId !== "none" ? customerId : null,
      registrar: (formData.get("registrar") as string) || null,
      renewal_date: (formData.get("renewal_date") as string) || null,
      renewal_cost: formData.get("renewal_cost") ? Number(formData.get("renewal_cost")) : null,
      notes: (formData.get("notes") as string) || null,
    })
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

// ============================================================
// FINANCIAL SUMMARY (for home + finances overview)
// ============================================================

export async function getFinancialSummary() {
  const supabase = await createClient()

  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

  const [incomeRes, projectExpensesRes, recurringRes, mrrRes] = await Promise.all([
    supabase.from("income").select("amount").gte("date", firstDay).lte("date", lastDay),
    supabase.from("project_expenses").select("amount").gte("date", firstDay).lte("date", lastDay),
    supabase.from("recurring_expenses").select("amount, frequency").eq("is_active", true),
    // MRR: sum of monthly_fee from Active paid media projects
    supabase
      .from("projects")
      .select("monthly_fee")
      .eq("status", "In Progress")
      .not("monthly_fee", "is", null),
  ])

  const monthlyIncome = (incomeRes.data ?? []).reduce((s, i) => s + Number(i.amount), 0)
  const monthlyProjectExpenses = (projectExpensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0)
  const monthlyRecurring = (recurringRes.data ?? []).reduce(
    (s, e) => s + normalizeToMonthly(Number(e.amount), e.frequency as ExpenseFrequency),
    0
  )
  const mrr = (mrrRes.data ?? []).reduce((s, p) => s + Number(p.monthly_fee ?? 0), 0)

  return {
    monthlyIncome,
    monthlyExpenses: monthlyProjectExpenses + monthlyRecurring,
    monthlyRecurring,
    monthlyProjectExpenses,
    netMargin: monthlyIncome - monthlyProjectExpenses - monthlyRecurring,
    mrr,
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

  const [incomeRes, expensesRes] = await Promise.all([
    supabase.from("income").select("amount, date").gte("date", startDate),
    supabase.from("project_expenses").select("amount, date").gte("date", startDate),
  ])

  const months: Record<string, { month: string; ingresos: number; gastos: number; margen: number }> = {}

  // Build 12-month skeleton
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const key = d.toISOString().slice(0, 7)
    months[key] = {
      month: d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }),
      ingresos: 0,
      gastos: 0,
      margen: 0,
    }
  }

  for (const entry of incomeRes.data ?? []) {
    const key = entry.date.slice(0, 7)
    if (months[key]) months[key].ingresos += Number(entry.amount)
  }

  for (const entry of expensesRes.data ?? []) {
    const key = entry.date.slice(0, 7)
    if (months[key]) months[key].gastos += Number(entry.amount)
  }

  return Object.values(months).map((m) => ({ ...m, margen: m.ingresos - m.gastos }))
}
