"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { BrandBrain, BrandBrainAsset } from "@/lib/types"

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

function revalidate(id?: string) {
  revalidatePath("/brand-brains")
  if (id) revalidatePath(`/brand-brains/${id}`)
}

// ── CRUD ─────────────────────────────────────────────────────

export async function getBrandBrains(): Promise<BrandBrain[]> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("brand_brains")
    .select("*")
    .order("created_at", { ascending: false })
  return (data ?? []) as BrandBrain[]
}

export async function getBrandBrain(id: string): Promise<BrandBrain | null> {
  const { supabase } = await assertAuth()
  const [brainRes, assetsRes] = await Promise.all([
    supabase.from("brand_brains").select("*").eq("id", id).single(),
    supabase.from("brand_brain_assets").select("*").eq("brand_brain_id", id).order("created_at"),
  ])
  if (!brainRes.data) return null
  return { ...brainRes.data, assets: assetsRes.data ?? [] } as BrandBrain
}

export async function createBrandBrain(formData: FormData): Promise<BrandBrain> {
  const { supabase, user } = await assertAuth()

  const brandColors = JSON.parse((formData.get("brand_colors") as string) || "[]")

  const { data: brain, error } = await supabase
    .from("brand_brains")
    .insert({
      name:               (formData.get("name") as string).trim(),
      initials:           (formData.get("initials") as string)?.trim() || null,
      industry:           (formData.get("industry") as string)?.trim() || null,
      language:           (formData.get("language") as string) || "es",
      brand_colors:       brandColors,
      description:        (formData.get("description") as string)?.trim() || null,
      usps:               JSON.parse((formData.get("usps") as string) || "[]"),
      key_benefits:       JSON.parse((formData.get("key_benefits") as string) || "[]"),
      pain_points:        JSON.parse((formData.get("pain_points") as string) || "[]"),
      target_audience:    (formData.get("target_audience") as string)?.trim() || null,
      key_features:       JSON.parse((formData.get("key_features") as string) || "[]"),
      ctas:               JSON.parse((formData.get("ctas") as string) || "[]"),
      tone_of_voice:      (formData.get("tone_of_voice") as string)?.trim() || null,
      additional_context: (formData.get("additional_context") as string)?.trim() || null,
      created_by:         user.id,
    })
    .select()
    .single()

  if (error) throw error

  // Upload logo if provided
  const logoFile = formData.get("logo") as File | null
  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.name.split(".").pop()
    const path = `${brain.id}/logo.${ext}`
    const { error: uploadError } = await supabase.storage
      .from("brand-brains")
      .upload(path, logoFile, { upsert: true })

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from("brand-brains").getPublicUrl(path)
      await supabase.from("brand_brains").update({ logo_url: publicUrl }).eq("id", brain.id)
      brain.logo_url = publicUrl
    }
  }

  revalidate()
  return brain as BrandBrain
}

export async function updateBrandBrain(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()

  const brandColors = JSON.parse((formData.get("brand_colors") as string) || "[]")

  const { error } = await supabase
    .from("brand_brains")
    .update({
      name:               (formData.get("name") as string).trim(),
      initials:           (formData.get("initials") as string)?.trim() || null,
      industry:           (formData.get("industry") as string)?.trim() || null,
      language:           (formData.get("language") as string) || "es",
      brand_colors:       brandColors,
      description:        (formData.get("description") as string)?.trim() || null,
      usps:               JSON.parse((formData.get("usps") as string) || "[]"),
      key_benefits:       JSON.parse((formData.get("key_benefits") as string) || "[]"),
      pain_points:        JSON.parse((formData.get("pain_points") as string) || "[]"),
      target_audience:    (formData.get("target_audience") as string)?.trim() || null,
      key_features:       JSON.parse((formData.get("key_features") as string) || "[]"),
      ctas:               JSON.parse((formData.get("ctas") as string) || "[]"),
      tone_of_voice:      (formData.get("tone_of_voice") as string)?.trim() || null,
      additional_context: (formData.get("additional_context") as string)?.trim() || null,
    })
    .eq("id", id)

  if (error) throw error

  // Upload new logo if provided
  const logoFile = formData.get("logo") as File | null
  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.name.split(".").pop()
    const path = `${id}/logo.${ext}`
    const { error: uploadError } = await supabase.storage
      .from("brand-brains")
      .upload(path, logoFile, { upsert: true })

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from("brand-brains").getPublicUrl(path)
      await supabase.from("brand_brains").update({ logo_url: publicUrl }).eq("id", id)
    }
  }

  revalidate(id)
}

export async function deleteBrandBrain(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  // Remove all storage files for this brain
  const { data: files } = await supabase.storage.from("brand-brains").list(id)
  if (files && files.length > 0) {
    await supabase.storage.from("brand-brains").remove(files.map((f) => `${id}/${f.name}`))
  }
  const { error } = await supabase.from("brand_brains").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

// ── Assets ────────────────────────────────────────────────────

export async function addBrandBrainAsset(brandBrainId: string, formData: FormData): Promise<BrandBrainAsset> {
  const { supabase, user } = await assertAuth()

  const file = formData.get("file") as File
  if (!file || file.size === 0) throw new Error("No file provided")

  const ext  = file.name.split(".").pop()
  const slug = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${brandBrainId}/assets/${slug}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("brand-brains")
    .upload(path, file)

  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage.from("brand-brains").getPublicUrl(path)

  const type = file.type.startsWith("video/") ? "video" : "image"

  const { data, error } = await supabase
    .from("brand_brain_assets")
    .insert({
      brand_brain_id: brandBrainId,
      name:           file.name,
      url:            publicUrl,
      type,
      size:           file.size,
      added_by:       user.id,
    })
    .select()
    .single()

  if (error) throw error
  revalidate(brandBrainId)
  return data as BrandBrainAsset
}

export async function deleteBrandBrainAsset(assetId: string, brandBrainId: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { data: asset } = await supabase
    .from("brand_brain_assets")
    .select("url")
    .eq("id", assetId)
    .single()

  if (asset?.url) {
    // Extract storage path from public URL
    const url = new URL(asset.url)
    const storagePath = url.pathname.split("/object/public/brand-brains/")[1]
    if (storagePath) {
      await supabase.storage.from("brand-brains").remove([storagePath])
    }
  }

  const { error } = await supabase.from("brand_brain_assets").delete().eq("id", assetId)
  if (error) throw error
  revalidate(brandBrainId)
}
