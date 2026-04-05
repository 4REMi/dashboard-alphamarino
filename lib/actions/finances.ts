"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ExpenseFrequency, ExpenseCategory } from "@/lib/types"

// ── Recurring Expenses ──────────────────────────────────────

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
    start_date: (formData.get("start_date") as string) || new Date().toISOString().split("T")[0],
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
      is_active: formData.get("is_active") === "true",
    })
    .eq("id", id)

  if (error) throw error
  revalidatePath("/finances/expenses")
}

export async function deleteRecurringExpense(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("recurring_expenses").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/finances/expenses")
}

// ── Income ──────────────────────────────────────────────────

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
  revalidatePath("/finances/income")
}

export async function deleteIncome(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("income").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/finances/income")
}

// ── Project Expenses ────────────────────────────────────────

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

// ── Summary helpers ─────────────────────────────────────────

export async function getFinancialSummary() {
  const supabase = await createClient()

  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

  const [incomeRes, expensesRes, recurringRes] = await Promise.all([
    supabase
      .from("income")
      .select("amount, date, project:projects(name)")
      .gte("date", firstDay)
      .lte("date", lastDay),
    supabase
      .from("project_expenses")
      .select("amount, date")
      .gte("date", firstDay)
      .lte("date", lastDay),
    supabase
      .from("recurring_expenses")
      .select("amount, frequency")
      .eq("is_active", true),
  ])

  const monthlyIncome = (incomeRes.data ?? []).reduce((s, i) => s + Number(i.amount), 0)
  const monthlyProjectExpenses = (expensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0)
  const monthlyRecurring = (recurringRes.data ?? []).reduce((s, e) => {
    if (e.frequency === "Monthly") return s + Number(e.amount)
    if (e.frequency === "Weekly") return s + Number(e.amount) * 4.33
    if (e.frequency === "Annual") return s + Number(e.amount) / 12
    return s
  }, 0)

  return {
    monthlyIncome,
    monthlyExpenses: monthlyProjectExpenses + monthlyRecurring,
    monthlyRecurring,
    monthlyProjectExpenses,
    netMargin: monthlyIncome - monthlyProjectExpenses - monthlyRecurring,
  }
}
