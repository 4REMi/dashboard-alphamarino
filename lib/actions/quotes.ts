"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { contextForMake, hasTemplate, PROPOSAL_TYPES, type QuoteLead, type QuoteStatus } from "@/lib/quotes/core"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (p?.role !== "admin") throw new Error("Solo admin")
  return createAdminClient()
}

export async function getQuoteLeads(): Promise<QuoteLead[]> {
  const db = await requireAdmin()
  const { data, error } = await db.from("quote_leads").select("*").order("created_at", { ascending: false }).limit(300)
  if (error) return [] // sin la migración 119
  return (data ?? []) as QuoteLead[]
}

const EDITABLE = ["name", "company", "email", "phone", "giro", "website", "socials", "problem", "investment", "business_size", "offer", "ai_summary", "notes", "proposal_type", "price", "status", "proposal_pdf_url", "proposal_slides_url"] as const
export type QuotePatch = Partial<Pick<QuoteLead, (typeof EDITABLE)[number]>>

export async function updateQuoteLead(id: string, patch: QuotePatch): Promise<void> {
  const db = await requireAdmin()
  const clean: Record<string, unknown> = {}
  for (const k of EDITABLE) if (k in patch) clean[k] = (patch as Record<string, unknown>)[k] === "" ? null : (patch as Record<string, unknown>)[k]
  clean.updated_at = new Date().toISOString()
  const { error } = await db.from("quote_leads").update(clean).eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/cotizaciones")
}

export async function createQuoteLead(input: { name: string; company?: string; phone?: string; email?: string; notes?: string }): Promise<string> {
  const db = await requireAdmin()
  if (!input.name.trim()) throw new Error("Falta el nombre")
  const { data, error } = await db.from("quote_leads").insert({
    source: "manual", status: "nuevo", name: input.name.trim(),
    company: input.company?.trim() || null, phone: input.phone?.trim() || null, email: input.email?.trim() || null, notes: input.notes?.trim() || null,
  }).select("id").single()
  if (error) throw new Error(error.message)
  revalidatePath("/cotizaciones")
  return data.id
}

export async function deleteQuoteLead(id: string): Promise<void> {
  const db = await requireAdmin()
  await db.from("quote_leads").delete().eq("id", id)
  revalidatePath("/cotizaciones")
}

// Imagen vacía válida (1×1 px): el escenario de Make siempre manda una imagen a OpenAI.
const BLANK_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

export async function generateQuoteProposal(id: string): Promise<void> {
  const db = await requireAdmin()
  const url = process.env.MAKE_QUOTE_WEBHOOK_URL
  if (!url) throw new Error("Falta configurar MAKE_QUOTE_WEBHOOK_URL (webhook del escenario Cotizador de Make).")
  const { data } = await db.from("quote_leads").select("*").eq("id", id).single()
  const lead = data as QuoteLead | null
  if (!lead) throw new Error("Lead no encontrado")
  if (!hasTemplate(lead.proposal_type)) throw new Error("Este tipo de propuesta todavía no tiene plantilla de Slides.")
  const type = PROPOSAL_TYPES.find((p) => p.key === lead.proposal_type)!
  const price = lead.price ?? type.defaultPrice
  const res = await fetch(url, {
    method: "POST",
    // El webhook "Cotizador — Intake" de Make pide la API key en x-make-apikey.
    headers: { "Content-Type": "application/json", ...(process.env.MAKE_QUOTE_WEBHOOK_APIKEY ? { "x-make-apikey": process.env.MAKE_QUOTE_WEBHOOK_APIKEY } : {}) },
    body: JSON.stringify({
      texto: contextForMake({ ...lead, price }),
      imagen_mime: "image/png",
      imagen_data: BLANK_PNG,
      lead_id: lead.id,
      origen: "dashboard",
    }),
  })
  if (!res.ok) throw new Error(`Make respondió ${res.status}`)
  await db.from("quote_leads").update({ status: "generando" as QuoteStatus, price, last_error: null, updated_at: new Date().toISOString() }).eq("id", id)
  revalidatePath("/cotizaciones")
}
