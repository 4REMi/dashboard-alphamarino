import type { SupabaseClient } from "@supabase/supabase-js"
import { contextForMake, hasTemplate, PROPOSAL_TYPES, type QuoteLead, type QuoteStatus } from "@/lib/quotes/core"

// Operaciones del hub con un cliente ya autorizado (admin). Las usan las
// server actions (dashboard) y el MCP — misma lógica en los dos.

export const EDITABLE = ["name", "company", "email", "phone", "giro", "website", "socials", "problem", "investment", "business_size", "offer", "ai_summary", "notes", "proposal_type", "price", "status", "proposal_pdf_url", "proposal_slides_url"] as const
export type QuotePatch = Partial<Pick<QuoteLead, (typeof EDITABLE)[number]>>

export async function listLeads(db: SupabaseClient): Promise<QuoteLead[]> {
  const { data, error } = await db.from("quote_leads").select("*").order("created_at", { ascending: false }).limit(500)
  if (error) return [] // sin la migración 119
  return (data ?? []) as QuoteLead[]
}

export async function updateLead(db: SupabaseClient, id: string, patch: QuotePatch): Promise<void> {
  const clean: Record<string, unknown> = {}
  for (const k of EDITABLE) if (k in patch) { const v = (patch as Record<string, unknown>)[k]; clean[k] = v === "" ? null : v }
  const now = new Date().toISOString()
  if (patch.status) {
    const { data: cur } = await db.from("quote_leads").select("status").eq("id", id).single()
    if (cur && cur.status !== patch.status) {
      if (patch.status === "enviada") clean.sent_at = now
      if (patch.status === "ganada" || patch.status === "perdida") clean.closed_at = now
      else clean.closed_at = null
    }
  }
  clean.updated_at = now
  let { error } = await db.from("quote_leads").update(clean).eq("id", id)
  if (error && /sent_at|closed_at/.test(error.message)) {
    // Sin la migración 120 todavía: se guarda sin esas fechas.
    delete clean.sent_at; delete clean.closed_at
    ;({ error } = await db.from("quote_leads").update(clean).eq("id", id))
  }
  if (error) throw new Error(error.message)
}

export async function createLead(db: SupabaseClient, input: QuotePatch & { name: string; source?: string }): Promise<string> {
  if (!input.name?.trim()) throw new Error("Falta el nombre")
  const row: Record<string, unknown> = { source: input.source ?? "manual", status: "nuevo" }
  for (const k of EDITABLE) if (k in input) { const v = (input as Record<string, unknown>)[k]; row[k] = typeof v === "string" ? v.trim() || null : v }
  const { data, error } = await db.from("quote_leads").insert(row).select("id").single()
  if (error) throw new Error(error.message)
  return data.id
}

// Imagen vacía válida (1×1 px): el escenario de Make siempre manda una imagen a OpenAI.
const BLANK_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

export async function generateProposal(db: SupabaseClient, id: string): Promise<QuoteLead> {
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
    body: JSON.stringify({ texto: contextForMake({ ...lead, price }), imagen_mime: "image/png", imagen_data: BLANK_PNG, lead_id: lead.id, origen: "dashboard" }),
  })
  if (!res.ok) throw new Error(`Make respondió ${res.status}`)
  const patch = { status: "generando" as QuoteStatus, price, last_error: null, updated_at: new Date().toISOString() }
  await db.from("quote_leads").update(patch).eq("id", id)
  return { ...lead, ...patch }
}
