"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import Anthropic from "@anthropic-ai/sdk"
import type { AdClone, AdCloneLine, MetaAdResult, BrandBrain } from "@/lib/types"
import { saveAd } from "@/lib/actions/ad-lab"

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2"

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

// ── AssemblyAI helpers ────────────────────────────────────────

async function aaiPost(path: string, body: unknown) {
  const token = process.env.ASSEMBLYAI_API_KEY
  if (!token) throw new Error("ASSEMBLYAI_API_KEY no configurado")
  const res = await fetch(`${ASSEMBLYAI_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `AssemblyAI error ${res.status}`)
  }
  return res.json()
}

async function aaiGet(path: string) {
  const token = process.env.ASSEMBLYAI_API_KEY
  if (!token) throw new Error("ASSEMBLYAI_API_KEY no configurado")
  const res = await fetch(`${ASSEMBLYAI_BASE}${path}`, {
    headers: { Authorization: token },
    cache: "no-store",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `AssemblyAI error ${res.status}`)
  }
  return res.json()
}

// ── Claude adaptation ─────────────────────────────────────────

function langInstruction(lang: string | null | undefined): string {
  if (!lang) return ""
  const l = lang.toLowerCase().trim()
  const isEn = l === "en" || l.includes("engl") || l.includes("inglés") || l.includes("ingles")
  const isEs = l === "es" || l.includes("span") || l.includes("español") || l.includes("espanol")
  if (isEn) return "CRITICAL — OUTPUT LANGUAGE: Write ALL adapted text in English. Do NOT use Spanish under any circumstance."
  if (isEs) return "CRÍTICO — IDIOMA DE SALIDA: Escribe TODA la adaptación en español. No uses inglés bajo ninguna circunstancia."
  return `CRITICAL — OUTPUT LANGUAGE: Write ALL adapted text in this language: ${lang}.`
}

async function adaptWithClaude(
  rawText: string,
  brain: Pick<BrandBrain, "name" | "industry" | "language" | "tone_of_voice" | "usps" | "key_benefits" | "pain_points" | "target_audience" | "ctas">,
  angulo?: string,
): Promise<AdCloneLine[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")

  const client = new Anthropic({ apiKey })

  const usps    = (brain.usps         ?? []).join(", ") || "—"
  const benefits = (brain.key_benefits ?? []).join(", ") || "—"
  const pains   = (brain.pain_points   ?? []).join(", ") || "—"
  const ctas    = (brain.ctas          ?? []).join(", ") || "—"

  const anguloBlock = angulo?.trim()
    ? `\nÁNGULO DEL CREATIVO:\n"${angulo.trim()}"\nTen en cuenta este ángulo al adaptar el guión: el mensaje debe reflejar este objetivo sin perder el tono de voz de la marca ni el ritmo del video.\n`
    : ""

  const langBlock = langInstruction(brain.language)

  const prompt = `Eres un redactor creativo experto en publicidad digital. Tu tarea tiene dos pasos:
${langBlock ? `\n${langBlock}\n` : ""}
PASO 1 — DIVIDE el siguiente guión en líneas naturales de longitud similar, como aparecerían en un teleprompter o guión de video. Cada línea debe ser una unidad de sentido completa que se pueda decir de un tirón (entre 10 y 25 palabras aproximadamente). Agrupa frases cortas relacionadas en una misma línea. Separa en líneas distintas los cambios de idea o de gancho.

PASO 2 — ADAPTA cada línea al Brand Brain de la marca destino. Preserva la estructura emocional y el ritmo del original. Mantén cada línea adaptada aproximadamente de la misma extensión que la original para respetar el timing del video. Adapta nombres de producto, beneficios, dolores y tono de voz.
${anguloBlock}
GUIÓN ORIGINAL (texto continuo):
${rawText}

MARCA DESTINO:
- Nombre: ${brain.name}
- Industria: ${brain.industry ?? "—"}
- Idioma: ${brain.language ?? "español"}
- Tono de voz: ${brain.tone_of_voice ?? "—"}
- USPs: ${usps}
- Beneficios clave: ${benefits}
- Dolores del cliente: ${pains}
- Audiencia objetivo: ${brain.target_audience ?? "—"}
- CTAs: ${ctas}

Devuelve ÚNICAMENTE un array JSON válido (sin markdown, sin texto extra) donde cada elemento tenga este formato exacto:
{"speaker": null, "original": "<línea original tal como la dividiste>", "adapted": "<línea adaptada para la marca — en ${brain.language ?? "español"}>"}`

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  })

  const raw = (msg.content[0] as { type: string; text: string }).text.trim()
  return JSON.parse(raw) as AdCloneLine[]
}

// ── Public actions ────────────────────────────────────────────

/**
 * Creates an ad_clone entry and submits the video to AssemblyAI for transcription.
 * Returns the clone id and share token so the client can start polling.
 */
export async function startClone(
  ad: MetaAdResult,
  brandBrainId: string,
): Promise<{ cloneId: string; shareToken: string }> {
  const { supabase, user } = await assertAuth()

  // 1. Ensure the ad is saved (upsert) to get a saved_ad_id
  // Resolve media from all Apify shapes: cards[], videos[], images[]
  const snap      = ad.snapshot
  const card      = snap?.cards?.[0]
  const videoItem = (snap as any)?.videos?.[0]
  const imageItem = (snap as any)?.images?.[0]
  const imageUrl  = card?.resized_image_url ?? card?.original_image_url
    ?? card?.video_preview_image_url
    ?? (imageItem?.resized_image_url ?? imageItem?.original_image_url)
    ?? (videoItem?.video_preview_image_url)
    ?? null
  const videoUrl  = card?.video_hd_url ?? card?.video_sd_url
    ?? (videoItem?.video_hd_url ?? videoItem?.video_sd_url) ?? null
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

  // 2. Create ad_clones row
  const { data: clone, error: cloneErr } = await supabase
    .from("ad_clones")
    .insert({
      saved_ad_id:    savedAd.id,
      brand_brain_id: brandBrainId,
      status:         "pending",
      created_by:     user.id,
    })
    .select("id, share_token")
    .single()
  if (cloneErr) throw cloneErr

  // 3. Submit to AssemblyAI (use cached video URL, fall back to original)
  const videoSrc = savedAd.cached_video_url ?? savedAd.video_url ?? videoUrl
  if (!videoSrc) {
    // No video — mark as error
    await supabase
      .from("ad_clones")
      .update({ status: "error", error_message: "Este anuncio no tiene video para transcribir." })
      .eq("id", clone.id)
    return { cloneId: clone.id, shareToken: clone.share_token }
  }

  try {
    const transcript = await aaiPost("/transcript", {
      audio_url:      videoSrc,
      speaker_labels: true,
      speech_models:  ["universal-3-pro", "universal-2"],
      language_code:  "es",
    })
    await supabase
      .from("ad_clones")
      .update({
        status: "transcribing",
        assemblyai_transcript_id: transcript.id,
      })
      .eq("id", clone.id)
  } catch (err) {
    await supabase
      .from("ad_clones")
      .update({ status: "error", error_message: String(err) })
      .eq("id", clone.id)
  }

  return { cloneId: clone.id, shareToken: clone.share_token }
}

/**
 * Polls the AssemblyAI transcript status.
 * If completed, runs Claude adaptation and stores results.
 * Returns the updated clone record.
 */
export async function pollClone(cloneId: string, angulo?: string): Promise<AdClone> {
  const { supabase } = await assertAuth()

  const { data: clone, error } = await supabase
    .from("ad_clones")
    .select("*, brand_brain:brand_brains(id, name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas)")
    .eq("id", cloneId)
    .single()
  if (error) throw error

  // Already in terminal state — return as-is
  if (clone.status === "ready" || clone.status === "error" || !clone.assemblyai_transcript_id) {
    return clone as AdClone
  }

  // Poll AssemblyAI
  let transcript: { status: string; utterances?: Array<{ speaker: string; text: string }>; error?: string; text?: string }
  try {
    transcript = await aaiGet(`/transcript/${clone.assemblyai_transcript_id}`)
  } catch {
    return clone as AdClone
  }

  if (transcript.status === "error") {
    await supabase
      .from("ad_clones")
      .update({ status: "error", error_message: transcript.error ?? "Error de transcripción" })
      .eq("id", cloneId)
    return { ...clone, status: "error", error_message: transcript.error ?? "Error de transcripción" } as AdClone
  }

  if (transcript.status !== "completed") {
    return clone as AdClone
  }

  // Transcription complete — use full text; Claude will split + adapt in one pass
  const rawText = transcript.text ?? ""
  if (!rawText.trim()) {
    await supabase
      .from("ad_clones")
      .update({ status: "error", error_message: "La transcripción no produjo texto." })
      .eq("id", cloneId)
    return { ...clone, status: "error", error_message: "La transcripción no produjo texto." } as AdClone
  }

  // Update status to "adapting" before calling Claude
  await supabase
    .from("ad_clones")
    .update({ status: "adapting" })
    .eq("id", cloneId)

  // Run Claude adaptation (splits + adapts in a single call)
  const brain = clone.brand_brain as Pick<BrandBrain, "name" | "industry" | "tone_of_voice" | "usps" | "key_benefits" | "pain_points" | "target_audience" | "ctas"> | null
  if (!brain) {
    await supabase
      .from("ad_clones")
      .update({ status: "error", error_message: "Brand Brain no encontrado" })
      .eq("id", cloneId)
    return { ...clone, status: "error" } as AdClone
  }

  try {
    const adaptedLines = await adaptWithClaude(rawText, brain, angulo)
    // original_lines mirrors the split Claude produced (for display in the table)
    const originalLines = adaptedLines.map((l) => ({ speaker: l.speaker, original: l.original, adapted: "" }))
    await supabase
      .from("ad_clones")
      .update({
        status:         "ready",
        original_lines: originalLines,
        adapted_lines:  adaptedLines,
        updated_at:     new Date().toISOString(),
      })
      .eq("id", cloneId)
    return { ...clone, status: "ready", original_lines: originalLines, adapted_lines: adaptedLines } as AdClone
  } catch (err) {
    await supabase
      .from("ad_clones")
      .update({ status: "error", error_message: String(err) })
      .eq("id", cloneId)
    return { ...clone, status: "error", error_message: String(err) } as AdClone
  }
}

/**
 * Saves user edits to the adapted lines.
 */
export async function updateAdaptedLines(cloneId: string, adaptedLines: AdCloneLine[]): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("ad_clones")
    .update({ adapted_lines: adaptedLines, updated_at: new Date().toISOString() })
    .eq("id", cloneId)
  if (error) throw error
}

export async function deleteAdClone(cloneId: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { data, error } = await supabase
    .from("ad_clones")
    .delete()
    .eq("id", cloneId)
    .select("id")
  if (error) throw error
  if (!data || data.length === 0) throw new Error("No se pudo eliminar la adaptación — verifica permisos")
}

/**
 * Returns all ready clones for a given saved ad, with brand brain name.
 */
export async function getAdClones(savedAdId: string): Promise<AdClone[]> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("ad_clones")
    .select("*, brand_brain:brand_brains(id, name)")
    .eq("saved_ad_id", savedAdId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
  return (data ?? []) as AdClone[]
}

export async function getAllAdClones(limit = 100): Promise<AdClone[]> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("ad_clones")
    .select("*, brand_brain:brand_brains(id, name, logo_url, brand_colors), saved_ad:saved_ads(id, page_name, cached_image_url, image_url)")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(limit)
  return (data ?? []) as AdClone[]
}

/**
 * Returns a map of savedAdId → ready clone count for a batch of ad IDs.
 */
export async function getAdCloneCountsByAdIds(
  savedAdIds: string[]
): Promise<Record<string, number>> {
  const { supabase } = await assertAuth()
  if (savedAdIds.length === 0) return {}
  const { data } = await supabase
    .from("ad_clones")
    .select("saved_ad_id")
    .in("saved_ad_id", savedAdIds)
    .eq("status", "ready")
  const counts: Record<string, number> = {}
  for (const row of (data ?? [])) {
    counts[row.saved_ad_id] = (counts[row.saved_ad_id] ?? 0) + 1
  }
  return counts
}

/**
 * Fetches a clone by share token — no auth required (uses admin client).
 */
export async function getAdCloneByToken(token: string): Promise<AdClone | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("ad_clones")
    .select("*, brand_brain:brand_brains(id, name), saved_ad:saved_ads(id, page_name, cached_video_url, video_url, cached_image_url, image_url)")
    .eq("share_token", token)
    .single()
  return (data as AdClone) ?? null
}
