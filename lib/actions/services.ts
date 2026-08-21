"use server"

import { revalidatePath } from "next/cache"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import type { ServiceOffer, ServiceAddon, Currency } from "@/lib/types"

function revalidateServices() {
  revalidatePath("/services")
}

function parseDeliverables(formData: FormData): string[] {
  const raw = (formData.get("deliverables") as string) ?? ""
  return raw.split("\n").map((l) => l.trim()).filter(Boolean)
}

function parsePrice(formData: FormData): number | null {
  const raw = formData.get("price") as string
  if (!raw || raw.trim() === "") return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function parseCurrency(formData: FormData): Currency {
  return (formData.get("currency") as string) === "USD" ? "USD" : "MXN"
}

// ============================================================
// OFFERS
// ============================================================

export async function getServiceOffers(): Promise<ServiceOffer[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("service_offers")
    .select(`
      *,
      based_on_offer:service_offers!based_on_offer_id(id, name),
      default_project_type:project_types(id, name, color, icon),
      addons:service_offer_addons(addon:service_addons(*))
    `)
    .order("category")
    .order("is_base", { ascending: false })
    .order("name")
  if (error) throw error
  return (data ?? []).map((row) => ({
    ...row,
    addons: (row.addons ?? []).map((a: { addon: ServiceAddon }) => a.addon),
  })) as ServiceOffer[]
}

export async function createServiceOffer(formData: FormData): Promise<ServiceOffer> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const basedOnId = (formData.get("based_on_offer_id") as string) || null
  const projectTypeId = (formData.get("default_project_type_id") as string) || null

  const { data, error } = await supabase
    .from("service_offers")
    .insert({
      category:                formData.get("category") as string,
      name:                    formData.get("name") as string,
      description:             (formData.get("description") as string) || null,
      deliverables:            parseDeliverables(formData),
      is_base:                 formData.get("is_base") === "true",
      based_on_offer_id:       basedOnId,
      default_project_type_id: projectTypeId,
      price:                   parsePrice(formData),
      currency:                parseCurrency(formData),
      price_note:              (formData.get("price_note") as string) || null,
      created_by:              user?.id ?? null,
    })
    .select("*, based_on_offer:service_offers!based_on_offer_id(id, name), default_project_type:project_types(id, name, color, icon)")
    .single()
  if (error) throw error
  revalidateServices()
  return { ...data, addons: [] } as ServiceOffer
}

export async function updateServiceOffer(id: string, formData: FormData): Promise<ServiceOffer> {
  const supabase = await createClient()
  const basedOnId = (formData.get("based_on_offer_id") as string) || null
  const projectTypeId = (formData.get("default_project_type_id") as string) || null

  const { data, error } = await supabase
    .from("service_offers")
    .update({
      category:                formData.get("category") as string,
      name:                    formData.get("name") as string,
      description:             (formData.get("description") as string) || null,
      deliverables:            parseDeliverables(formData),
      is_base:                 formData.get("is_base") === "true",
      based_on_offer_id:       basedOnId,
      default_project_type_id: projectTypeId,
      price:                   parsePrice(formData),
      currency:                parseCurrency(formData),
      price_note:              (formData.get("price_note") as string) || null,
    })
    .eq("id", id)
    .select("*, based_on_offer:service_offers!based_on_offer_id(id, name), default_project_type:project_types(id, name, color, icon)")
    .single()
  if (error) throw error
  revalidateServices()
  return data as ServiceOffer
}

export async function archiveServiceOffer(id: string, archived: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("service_offers")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", id)
  if (error) throw error
  revalidateServices()
}

export async function deleteServiceOffer(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from("service_offers").delete().eq("id", id)
  if (error) throw error
  revalidateServices()
}

export async function setOfferAddons(offerId: string, addonIds: string[]): Promise<void> {
  const supabase = await createClient()
  const { error: delError } = await supabase.from("service_offer_addons").delete().eq("offer_id", offerId)
  if (delError) throw delError
  if (addonIds.length > 0) {
    const { error: insError } = await supabase
      .from("service_offer_addons")
      .insert(addonIds.map((addon_id) => ({ offer_id: offerId, addon_id })))
    if (insError) throw insError
  }
  revalidateServices()
}

// ============================================================
// ADDONS
// ============================================================

export async function getServiceAddons(): Promise<ServiceAddon[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("service_addons")
    .select("*")
    .order("name")
  if (error) throw error
  return (data ?? []) as ServiceAddon[]
}

export async function createServiceAddon(formData: FormData): Promise<ServiceAddon> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("service_addons")
    .insert({
      name:        formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      price:       parsePrice(formData),
      currency:    parseCurrency(formData),
      price_note:  (formData.get("price_note") as string) || null,
      created_by:  user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  revalidateServices()
  return data as ServiceAddon
}

export async function updateServiceAddon(id: string, formData: FormData): Promise<ServiceAddon> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("service_addons")
    .update({
      name:        formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      price:       parsePrice(formData),
      currency:    parseCurrency(formData),
      price_note:  (formData.get("price_note") as string) || null,
    })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  revalidateServices()
  return data as ServiceAddon
}

export async function archiveServiceAddon(id: string, archived: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("service_addons")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", id)
  if (error) throw error
  revalidateServices()
}

export async function deleteServiceAddon(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from("service_addons").delete().eq("id", id)
  if (error) throw error
  revalidateServices()
}

// ============================================================
// AI AUTOFILL — one-shot, on demand. Fills description + deliverables
// (and suggests a project type) from category/name/hint the admin
// already typed. Never touches price, is_base, or based_on — those
// stay deliberate human calls, never a model's guess.
// ============================================================

export async function suggestServiceOffer(input: {
  category: string
  name: string
  hint?: string
  projectTypes: { id: string; name: string }[]
}): Promise<{ description: string; deliverables: string[]; project_type_id: string | null }> {
  if (!input.category.trim() || !input.name.trim()) {
    throw new Error("Escribe al menos la categoría y el nombre antes de autorrellenar")
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
  const client = new Anthropic({ apiKey })

  const typeList = input.projectTypes.map((t) => `- ${t.name} (id: ${t.id})`).join("\n") || "(sin tipos de proyecto registrados)"

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `Eres estratega de una agencia de marketing/desarrollo armando su catálogo interno de servicios. Redacta una oferta de servicio a partir de estos datos:

Categoría: ${input.category}
Nombre de la oferta: ${input.name}
${input.hint?.trim() ? `Contexto adicional dado por el admin: ${input.hint.trim()}` : ""}

Escribe:
1. Una descripción corta (1-2 oraciones) que sea la promesa de valor de la oferta — qué resultado obtiene el cliente, no una lista de tareas.
2. Entre 3 y 7 entregables concretos y verificables (cosas que el cliente puede ver/recibir), cada uno una frase corta.
3. De esta lista de tipos de proyecto ya existentes en el sistema, cuál (si alguno) es el más relevante para esta oferta — o null si ninguno aplica bien:
${typeList}

Responde ÚNICAMENTE con JSON válido (sin markdown, sin explicación):
{"description": "...", "deliverables": ["...", "..."], "project_type_id": "<id o null>"}`,
    }],
  })

  const raw = (msg.content[0] as { type: string; text: string }).text.trim()
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
  let parsed: { description?: string; deliverables?: string[]; project_type_id?: string | null }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error("La IA no devolvió una respuesta válida — intenta de nuevo")
  }

  const validTypeId = input.projectTypes.some((t) => t.id === parsed.project_type_id) ? parsed.project_type_id! : null
  return {
    description: parsed.description?.trim() || "",
    deliverables: (parsed.deliverables ?? []).map((d) => d.trim()).filter(Boolean),
    project_type_id: validTypeId,
  }
}
