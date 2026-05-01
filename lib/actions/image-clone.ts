"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import Anthropic from "@anthropic-ai/sdk"
import { saveAd } from "@/lib/actions/ad-lab"
import type { ImageClone, ImageCloneLine, MetaAdResult, BrandBrain } from "@/lib/types"

const REPLICATE_BASE = "https://api.replicate.com/v1"
const REPLICATE_MODEL = "google/nano-banana"

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

// ── Replicate helpers ─────────────────────────────────────────

function replicateHeaders() {
  const token = process.env.REPLICATE_KEY
  if (!token) throw new Error("REPLICATE_KEY no configurado")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function replicateSubmit(input: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${REPLICATE_BASE}/models/${REPLICATE_MODEL}/predictions`, {
    method: "POST",
    headers: replicateHeaders(),
    body: JSON.stringify({ input }),
    cache: "no-store",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `Replicate error ${res.status}`)
  }
  const data = await res.json() as { id: string }
  return data.id
}

async function replicatePoll(predictionId: string): Promise<{ status: string; urls?: string[]; error?: string }> {
  const res = await fetch(`${REPLICATE_BASE}/predictions/${predictionId}`, {
    headers: replicateHeaders(),
    cache: "no-store",
  })
  if (!res.ok) return { status: "failed" }
  const data = await res.json() as {
    status: string
    output?: string | string[] | null
    error?: string | null
  }
  // Replicate may return a single string or an array of strings
  const raw = data.output
  const urls = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
  return {
    status: data.status,
    urls,
    error: data.error ?? undefined,
  }
}

// ── Claude Vision helpers ─────────────────────────────────────

type BrainContext = Pick<BrandBrain, "name" | "industry" | "tone_of_voice" | "usps" | "key_benefits" | "pain_points" | "target_audience" | "ctas" | "brand_colors" | "logo_url" | "logo_square_url" | "logo_horizontal_url">

async function extractAndAdaptWithClaude(
  imageUrl: string,
  brain: BrainContext,
): Promise<ImageCloneLine[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")

  const client = new Anthropic({ apiKey })

  const usps     = (brain.usps         ?? []).join(", ") || "—"
  const benefits = (brain.key_benefits ?? []).join(", ") || "—"
  const pains    = (brain.pain_points   ?? []).join(", ") || "—"
  const ctas     = (brain.ctas          ?? []).join(", ") || "—"

  const prompt = `Eres un experto en publicidad digital y copywriting.

PASO 1 — EXTRAE todos los elementos de texto visibles en este anuncio de imagen. Incluye: headline, subheadline, body copy, CTA, tags, precios, disclaimers, y cualquier texto visible. Omite textos puramente decorativos o ilegibles.

PASO 2 — ADAPTA cada elemento al Brand Brain de la marca destino. Mantén la función comunicativa de cada elemento (un headline sigue siendo headline, un CTA sigue siendo CTA). Adapta el producto, los beneficios, el tono y el lenguaje al nuevo contexto de marca.

MARCA DESTINO:
- Nombre: ${brain.name}
- Industria: ${brain.industry ?? "—"}
- Tono de voz: ${brain.tone_of_voice ?? "—"}
- USPs: ${usps}
- Beneficios clave: ${benefits}
- Dolores del cliente: ${pains}
- Audiencia objetivo: ${brain.target_audience ?? "—"}
- CTAs: ${ctas}

Devuelve ÚNICAMENTE un array JSON válido (sin markdown, sin texto extra) donde cada elemento tenga este formato exacto:
{"element": "<tipo de elemento, e.g. Headline>", "original": "<texto exacto del anuncio>", "adapted": "<texto adaptado para la marca>"}`

  const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) })
  if (!imageRes.ok) throw new Error("No se pudo descargar la imagen del anuncio")

  const imageBuffer = await imageRes.arrayBuffer()
  const base64 = Buffer.from(imageBuffer).toString("base64")
  const mediaType = (imageRes.headers.get("content-type") ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif"

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  })

  const raw = (msg.content[0] as { type: string; text: string }).text.trim()
  return JSON.parse(raw) as ImageCloneLine[]
}

function buildGenerationPrompt(
  adaptedLines: ImageCloneLine[],
  brain: BrainContext,
  primaryColor: string | null,
  additionalContext: string,
): string {
  const allColors = (brain.brand_colors ?? []).map((c) => c.hex)
  const primary = primaryColor ?? allColors[0] ?? null
  const secondaryColors = allColors.filter((h) => h !== primary)

  const colorBlock = primary
    ? [
        `Primary: ${primary}`,
        secondaryColors.length > 0 ? `Secondary: ${secondaryColors.join(", ")}` : "",
        `→ Apply primary to main backgrounds, buttons, and dominant graphic elements.`,
        secondaryColors.length > 0 ? `→ Apply secondary as accents, borders, and supporting elements.` : "",
        `→ Remove all original brand colors completely.`,
      ].filter(Boolean).join("\n")
    : ""

  const textBlock = adaptedLines
    .map((l, i) => `${i + 1}. "${l.original}" → "${l.adapted}"`)
    .join("\n")

  const extraLine = additionalContext.trim()
    ? `\n\n---\n\nADDITIONAL INSTRUCTIONS\n${additionalContext.trim()}`
    : ""

  return [
    `You are recreating a real advertisement for a new brand.`,
    `TASK: Reproduce the exact layout, composition, and visual structure of image 1. Replace brand identity, colors, and all text.`,
    `---`,
    `BRAND\nName: ${brain.name}${brain.industry ? `\nIndustry: ${brain.industry}` : ""}${brain.tone_of_voice ? `\nTone: ${brain.tone_of_voice}` : ""}`,
    colorBlock ? `---\n\nCOLORS\n${colorBlock}` : "",
    `---\n\nTEXT REPLACEMENTS\nReplace each string exactly as written, in its original position:\n${textBlock}`,
    extraLine,
  ].filter(Boolean).join("\n\n")
}

// ── Public actions ────────────────────────────────────────────

/**
 * Creates an image_clone row and immediately runs Claude Vision
 * to extract + adapt text. Returns cloneId, shareToken, and the lines.
 */
export async function startImageClone(
  ad: MetaAdResult,
  brandBrainId: string,
): Promise<{ cloneId: string; shareToken: string; lines: ImageCloneLine[] }> {
  const { supabase, user } = await assertAuth()

  // 1. Upsert saved ad
  const card = ad.snapshot?.cards?.[0]
  const imageUrl = card?.resized_image_url ?? card?.original_image_url ?? null
  const videoUrl = card?.video_hd_url ?? card?.video_sd_url ?? null
  const toDate = (ts: number | null) =>
    ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null

  const savedAd = await saveAd({
    ad_archive_id:     ad.ad_archive_id,
    page_id:           ad.page_id,
    page_name:         ad.page_name,
    body:              ad.snapshot?.body?.text ?? card?.body ?? null,
    image_url:         imageUrl,
    video_url:         videoUrl,
    snapshot_url:      ad.ad_library_url ?? null,
    start_date:        toDate(ad.start_date),
    end_date:          toDate(ad.end_date),
    status:            ad.is_active ? "active" : "inactive",
    platforms:         (ad.publisher_platform ?? []).map((p) => p.toLowerCase()),
    spend_lower:       ad.spend?.lower_bound ?? null,
    spend_upper:       ad.spend?.upper_bound ?? null,
    impressions_lower: null,
    impressions_upper: null,
    currency:          ad.currency ?? "MXN",
    ad_snapshot:       ad,
  })

  // 2. Create image_clones row
  const { data: clone, error: cloneErr } = await supabase
    .from("image_clones")
    .insert({
      saved_ad_id:    savedAd.id,
      brand_brain_id: brandBrainId,
      status:         "extracting",
      created_by:     user.id,
    })
    .select("id, share_token")
    .single()
  if (cloneErr) throw cloneErr

  // 3. Resolve image URL (use cached if available)
  const srcImageUrl = savedAd.cached_image_url ?? savedAd.image_url ?? imageUrl
  if (!srcImageUrl) {
    await supabase
      .from("image_clones")
      .update({ status: "error", error_message: "Este anuncio no tiene imagen para analizar." })
      .eq("id", clone.id)
    return { cloneId: clone.id, shareToken: clone.share_token, lines: [] }
  }

  // 4. Fetch brand brain
  const { data: brain, error: brainErr } = await supabase
    .from("brand_brains")
    .select("id, name, industry, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas, brand_colors, logo_url, logo_square_url, logo_horizontal_url")
    .eq("id", brandBrainId)
    .single()
  if (brainErr || !brain) {
    await supabase
      .from("image_clones")
      .update({ status: "error", error_message: "Brand Brain no encontrado" })
      .eq("id", clone.id)
    return { cloneId: clone.id, shareToken: clone.share_token, lines: [] }
  }

  // 5. Run Claude Vision
  try {
    const lines = await extractAndAdaptWithClaude(srcImageUrl, brain as BrainContext)
    const originalLines = lines.map((l) => ({ element: l.element, original: l.original, adapted: "" }))
    await supabase
      .from("image_clones")
      .update({
        status:         "ready",
        original_lines: originalLines,
        adapted_lines:  lines,
        updated_at:     new Date().toISOString(),
      })
      .eq("id", clone.id)
    return { cloneId: clone.id, shareToken: clone.share_token, lines }
  } catch (err) {
    await supabase
      .from("image_clones")
      .update({ status: "error", error_message: String(err) })
      .eq("id", clone.id)
    return { cloneId: clone.id, shareToken: clone.share_token, lines: [] }
  }
}

/**
 * Uploads product reference images to Supabase storage and
 * stores their URLs on the clone record. Returns the public URLs.
 */
export async function uploadReferenceImages(
  cloneId: string,
  formData: FormData,
): Promise<string[]> {
  // assertAuth verifies the user is authenticated before we proceed
  const { supabase } = await assertAuth()
  // Use admin client for storage uploads — bucket INSERT policies may not be
  // configured for the authenticated user role, and this runs server-side.
  const adminStorage = createAdminClient()

  const files = formData.getAll("files") as File[]
  if (!files.length) return []

  const urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const ext = file.name.split(".").pop() ?? "jpg"
    const path = `image-clones/${cloneId}/ref-${Date.now()}-${i}.${ext}`
    const buffer = await file.arrayBuffer()

    const { error } = await adminStorage.storage
      .from("ad-lab")
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (error) throw new Error(`Error subiendo imagen: ${error.message}`)

    const { data: { publicUrl } } = adminStorage.storage.from("ad-lab").getPublicUrl(path)
    urls.push(publicUrl)
  }

  const { error } = await supabase
    .from("image_clones")
    .update({ reference_image_urls: urls })
    .eq("id", cloneId)
  if (error) throw error

  return urls
}

/**
 * Saves user edits to the adapted lines.
 */
export async function updateImageAdaptedLines(
  cloneId: string,
  adaptedLines: ImageCloneLine[],
): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("image_clones")
    .update({ adapted_lines: adaptedLines, updated_at: new Date().toISOString() })
    .eq("id", cloneId)
  if (error) throw error
}

/**
 * Submits N parallel generation jobs to Replicate (Flux 2 Pro).
 * Flux 2 Pro generates 1 image per prediction, so numImages = N submissions.
 * Stores all prediction IDs as a JSON array in fal_request_id.
 */
export async function generateImages(
  cloneId: string,
  config: {
    adaptedLines:      ImageCloneLine[]
    brandColor:        string | null
    aspectRatio:       string
    numImages:         number
    additionalContext: string
  },
): Promise<{ prompt: string }> {
  const { supabase } = await assertAuth()

  const { data: clone, error } = await supabase
    .from("image_clones")
    .select("*, brand_brain:brand_brains(id, name, industry, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas, brand_colors, logo_url, logo_square_url, logo_horizontal_url), saved_ad:saved_ads(cached_image_url, image_url)")
    .eq("id", cloneId)
    .single()
  if (error) throw error

  // Original ad is always the first reference (layout/composition anchor).
  // User-uploaded product images are appended after it.
  const savedAd = clone.saved_ad as { cached_image_url: string | null; image_url: string | null } | null
  const adImageUrl = savedAd?.cached_image_url ?? savedAd?.image_url ?? null
  if (!adImageUrl) throw new Error("No se encontró imagen del anuncio original.")

  const userUploads: string[] = clone.reference_image_urls ?? []
  const brain = clone.brand_brain as BrainContext | null
  const logoUrl = brain?.logo_square_url ?? brain?.logo_url ?? brain?.logo_horizontal_url ?? null
  // Order: original ad → logo (if any) → user uploads (max 8 total)
  const inputImages = [adImageUrl, ...(logoUrl ? [logoUrl] : []), ...userUploads].slice(0, 8)

  const prompt = buildGenerationPrompt(
    config.adaptedLines,
    brain ?? { name: "Marca", industry: null, tone_of_voice: null, usps: [], key_benefits: [], pain_points: [], target_audience: null, ctas: [], brand_colors: [], logo_url: null, logo_square_url: null, logo_horizontal_url: null },
    config.brandColor,
    config.additionalContext,
  )

  await supabase
    .from("image_clones")
    .update({
      adapted_lines: config.adaptedLines,
      brand_color:   config.brandColor,
      aspect_ratio:  config.aspectRatio,
      num_images:    config.numImages,
      status:        "generating",
    })
    .eq("id", cloneId)

  try {
    // Submit N predictions in parallel (one per desired image)
    const submissionInput = {
      prompt,
      image_input:   inputImages,
      aspect_ratio:  config.aspectRatio,
      output_format: "jpg",
    }
    const ids = await Promise.all(
      Array.from({ length: config.numImages }, () => replicateSubmit(submissionInput))
    )
    await supabase
      .from("image_clones")
      .update({ fal_request_id: JSON.stringify(ids) })
      .eq("id", cloneId)
  } catch (err) {
    await supabase
      .from("image_clones")
      .update({ status: "error", error_message: String(err) })
      .eq("id", cloneId)
    throw err
  }

  return { prompt }
}

/**
 * Polls all Replicate predictions. Marks done when every prediction settles.
 * Returns the current clone record.
 */
export async function pollImageGeneration(cloneId: string): Promise<ImageClone> {
  const { supabase } = await assertAuth()

  const { data: clone, error } = await supabase
    .from("image_clones")
    .select("*")
    .eq("id", cloneId)
    .single()
  if (error) throw error

  if (clone.status === "done" || clone.status === "error" || !clone.fal_request_id) {
    return clone as ImageClone
  }

  // fal_request_id stores a JSON array of prediction IDs
  let ids: string[]
  try {
    const parsed = JSON.parse(clone.fal_request_id)
    ids = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    ids = [clone.fal_request_id]
  }

  const results = await Promise.all(ids.map((id) => replicatePoll(id)))

  const allSettled = results.every((r) => r.status === "succeeded" || r.status === "failed" || r.status === "canceled")
  if (!allSettled) {
    // Still in progress — keep polling
    return clone as ImageClone
  }

  const urls = results.flatMap((r) => r.urls ?? [])
  if (urls.length > 0) {
    await supabase
      .from("image_clones")
      .update({
        status:               "done",
        generated_image_urls: urls,
        updated_at:           new Date().toISOString(),
      })
      .eq("id", cloneId)
    return { ...clone, status: "done", generated_image_urls: urls } as ImageClone
  }

  // All predictions failed
  const msg = results.find((r) => r.error)?.error ?? "Error en la generación"
  await supabase
    .from("image_clones")
    .update({ status: "error", error_message: msg })
    .eq("id", cloneId)
  return { ...clone, status: "error", error_message: msg } as ImageClone
}

/**
 * Returns all done image clones for a saved ad (with brand brain name).
 */
export async function getImageClones(savedAdId: string): Promise<ImageClone[]> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("image_clones")
    .select("*, brand_brain:brand_brains(id, name)")
    .eq("saved_ad_id", savedAdId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
  return (data ?? []) as ImageClone[]
}

/**
 * Returns a map of savedAdId → done clone count for a batch of ad IDs.
 */
export async function getImageCloneCountsByAdIds(
  savedAdIds: string[],
): Promise<Record<string, number>> {
  const { supabase } = await assertAuth()
  if (savedAdIds.length === 0) return {}
  const { data } = await supabase
    .from("image_clones")
    .select("saved_ad_id")
    .in("saved_ad_id", savedAdIds)
    .eq("status", "done")
  const counts: Record<string, number> = {}
  for (const row of (data ?? [])) {
    counts[row.saved_ad_id] = (counts[row.saved_ad_id] ?? 0) + 1
  }
  return counts
}

export async function deleteImageClone(cloneId: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { data, error } = await supabase
    .from("image_clones")
    .delete()
    .eq("id", cloneId)
    .select("id")
  if (error) throw error
  if (!data || data.length === 0) throw new Error("No se pudo eliminar el clon — verifica permisos")
}

/**
 * Fetches a clone by share token — no auth required (uses admin client).
 */
export async function getImageCloneByToken(token: string): Promise<ImageClone | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("image_clones")
    .select("*, brand_brain:brand_brains(id, name), saved_ad:saved_ads(id, page_name, cached_image_url, image_url)")
    .eq("share_token", token)
    .single()
  return (data as ImageClone) ?? null
}
