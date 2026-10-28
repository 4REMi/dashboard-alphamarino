"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { listLeads, updateLead, createLead, generateProposal, type QuotePatch } from "@/lib/quotes/server"
import type { QuoteLead } from "@/lib/quotes/core"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (p?.role !== "admin") throw new Error("Solo admin")
  return createAdminClient()
}

export async function getQuoteLeads(): Promise<QuoteLead[]> {
  return listLeads(await requireAdmin())
}

export async function updateQuoteLead(id: string, patch: QuotePatch): Promise<void> {
  await updateLead(await requireAdmin(), id, patch)
  revalidatePath("/cotizaciones")
}

export async function createQuoteLead(input: { name: string; company?: string; phone?: string; email?: string; notes?: string }): Promise<string> {
  const id = await createLead(await requireAdmin(), input)
  revalidatePath("/cotizaciones")
  return id
}

export async function deleteQuoteLead(id: string): Promise<void> {
  const db = await requireAdmin()
  await db.from("quote_leads").delete().eq("id", id)
  revalidatePath("/cotizaciones")
}

export async function generateQuoteProposal(id: string): Promise<void> {
  await generateProposal(await requireAdmin(), id)
  revalidatePath("/cotizaciones")
}
