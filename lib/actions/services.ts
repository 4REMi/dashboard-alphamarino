"use server"

import { revalidatePath } from "next/cache"
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
