"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { BrandBrain, BrandBrainAsset, BrandLine } from "@/lib/types"

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

// Download a remote URL and upload it to Storage, return public URL or null
async function mirrorUrlToStorage(
  brainId: string,
  sourceUrl: string,
  filename: string,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const buffer      = await res.arrayBuffer()
    const contentType = res.headers.get("content-type") ?? "image/jpeg"
    const ext         = (contentType.split("/")[1]?.split(";")[0] ?? "jpg").slice(0, 4)
    const path        = `${brainId}/${filename}.${ext}`
    const admin       = createAdminClient()
    const { error }   = await admin.storage.from("brand-brains").upload(path, buffer, { contentType, upsert: true })
    if (error) { console.error("[brand-brains] mirrorUrlToStorage error:", error.message); return null }
    const { data: { publicUrl } } = admin.storage.from("brand-brains").getPublicUrl(path)
    return publicUrl
  } catch (e) {
    console.error("[brand-brains] mirrorUrlToStorage exception:", e)
    return null
  }
}

// Upload a single logo file to Storage and return its public URL.
// SVGs are rejected — they are not supported by Replicate's image pipeline.
async function uploadLogo(
  brainId: string,
  file: File,
  filename: string,
): Promise<string | null> {
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name)
  if (isSvg) throw new Error("SVG no soportado. Por favor sube el logo en formato PNG o JPG.")

  const ext   = file.name.split(".").pop()
  const path  = `${brainId}/${filename}.${ext}`
  const admin = createAdminClient()
  const { error } = await admin.storage.from("brand-brains").upload(path, file, { upsert: true })
  if (error) { console.error("[brand-brains] uploadLogo error:", error.message); return null }
  const { data: { publicUrl } } = admin.storage.from("brand-brains").getPublicUrl(path)
  return publicUrl
}

const LOGO_FIELDS = [
  { field: "logo",            filename: "logo",            col: "logo_url"            },
  { field: "logo_square",     filename: "logo_square",     col: "logo_square_url"     },
  { field: "logo_horizontal", filename: "logo_horizontal", col: "logo_horizontal_url" },
] as const

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

  const logoUpdates: Record<string, string> = {}
  for (const { field, filename, col } of LOGO_FIELDS) {
    const file = formData.get(field) as File | null
    if (!file || file.size === 0) continue
    const url = await uploadLogo(brain.id, file, filename)
    if (url) { logoUpdates[col] = url; (brain as Record<string, unknown>)[col] = url }
  }

  // Mirror remote logo URLs (from import) to Storage when no file was uploaded
  const remoteFields = [
    { key: "logo_url_remote",            col: "logo_url",            filename: "logo"         },
    { key: "logo_square_url_remote",     col: "logo_square_url",     filename: "logo_square"  },
    { key: "logo_horizontal_url_remote", col: "logo_horizontal_url", filename: "logo_horizontal" },
  ] as const
  for (const { key, col, filename } of remoteFields) {
    const remoteUrl = formData.get(key) as string | null
    if (!remoteUrl || logoUpdates[col]) continue
    const url = await mirrorUrlToStorage(brain.id, remoteUrl, filename)
    if (url) { logoUpdates[col] = url; (brain as Record<string, unknown>)[col] = url }
  }

  if (Object.keys(logoUpdates).length > 0) {
    await supabase.from("brand_brains").update(logoUpdates).eq("id", brain.id)
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

  const logoUpdates: Record<string, string | null> = {}

  // Clear flags — user explicitly removed a logo
  const clearMap: Record<string, string> = {
    logo_cleared:            "logo_url",
    logo_square_cleared:     "logo_square_url",
    logo_horizontal_cleared: "logo_horizontal_url",
  }
  for (const [key, col] of Object.entries(clearMap)) {
    if (formData.get(key) === "true") logoUpdates[col] = null
  }

  // New uploads — override clear if a new file was also provided
  for (const { field, filename, col } of LOGO_FIELDS) {
    const file = formData.get(field) as File | null
    if (!file || file.size === 0) continue
    const url = await uploadLogo(id, file, filename)
    if (url) logoUpdates[col] = url
  }

  if (Object.keys(logoUpdates).length > 0) {
    await supabase.from("brand_brains").update(logoUpdates).eq("id", id)
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

// ── Brand Lines ──────────────────────────────────────────────

export async function getBrandLines(brainId: string): Promise<BrandLine[]> {
  const { supabase } = await assertAuth()
  const { data, error } = await supabase
    .from("brand_lines")
    .select("*")
    .eq("brand_brain_id", brainId)
    .order("position", { ascending: true })
  if (error) throw error
  return (data ?? []) as BrandLine[]
}

export async function getAllBrandLines(): Promise<BrandLine[]> {
  const { supabase } = await assertAuth()
  const { data, error } = await supabase
    .from("brand_lines")
    .select("*")
    .order("position", { ascending: true })
  if (error) throw error
  return (data ?? []) as BrandLine[]
}

export async function createBrandLine(
  brainId: string,
  fields: { name: string; description?: string | null; usps?: string[]; pain_points?: string[]; keywords?: string[]; color?: string }
): Promise<BrandLine> {
  const { supabase } = await assertAuth()
  const { data: maxPos } = await supabase
    .from("brand_lines")
    .select("position")
    .eq("brand_brain_id", brainId)
    .order("position", { ascending: false })
    .limit(1)
    .single()

  const { data, error } = await supabase.from("brand_lines").insert({
    brand_brain_id: brainId,
    name: fields.name,
    description: fields.description || null,
    usps: fields.usps ?? [],
    pain_points: fields.pain_points ?? [],
    keywords: fields.keywords ?? [],
    color: fields.color ?? "#6366f1",
    position: (maxPos?.position ?? -1) + 1,
  }).select("*").single()
  if (error) throw error
  revalidate(brainId)
  return data as BrandLine
}

export async function updateBrandLine(
  id: string,
  brainId: string,
  fields: Partial<Pick<BrandLine, "name" | "description" | "usps" | "pain_points" | "keywords" | "color" | "position">>
): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("brand_lines").update({
    ...fields,
    updated_at: new Date().toISOString(),
  }).eq("id", id)
  if (error) throw error
  revalidate(brainId)
}

export async function deleteBrandLine(id: string, brainId: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("brand_lines").delete().eq("id", id)
  if (error) throw error
  revalidate(brainId)
}
