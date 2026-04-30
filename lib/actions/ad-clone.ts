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

async function adaptWithClaude(
  utterances: Array<{ speaker: string | null; text: string }>,
  brain: Pick<BrandBrain, "name" | "industry" | "tone_of_voice" | "usps" | "key_benefits" | "pain_points" | "target_audience" | "ctas">
): Promise<AdCloneLine[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")

  const client = new Anthropic({ apiKey })

  const scriptText = utterances.map((u, i) => `${i + 1}. "${u.text}"`).join("\n")
  const usps = (brain.usps ?? []).join(", ") || "—"
  const benefits = (brain.key_benefits ?? []).join(", ") || "—"
  const pains = (brain.pain_points ?? []).join(", ") || "—"
  const ctas = (brain.ctas ?? []).join(", ") || "—"

  const prompt = `Eres un redactor creativo experto en publicidad digital. Adapta el siguiente guión de un anuncio de video para que encaje con la marca indicada. Preserva la estructura emocional y el ritmo del original — cada línea debe quedar aproximadamente de la misma longitud para mantener el timing. Adapta los nombres de producto, beneficios, dolores y tono de voz a la marca.

GUIÓN ORIGINAL:
${scriptText}

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
{"speaker": null, "original": "<línea original>", "adapted": "<línea adaptada>"}`

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  })

  const raw = (msg.content[0] as { type: string; text: string }).text.trim()
  const parsed = JSON.parse(raw) as AdCloneLine[]
  return parsed.map((line, i) => ({
    speaker: utterances[i]?.speaker ?? null,
    original: line.original,
    adapted: line.adapted,
  }))
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
export async function pollClone(cloneId: string): Promise<AdClone> {
  const { supabase } = await assertAuth()

  const { data: clone, error } = await supabase
    .from("ad_clones")
    .select("*, brand_brain:brand_brains(id, name, industry, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas)")
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

  // Transcription complete — build utterances list
  const utterances: Array<{ speaker: string | null; text: string }> = transcript.utterances?.length
    ? transcript.utterances.map((u) => ({ speaker: u.speaker, text: u.text }))
    : (transcript.text ?? "").split(/[.!?]+/).filter((s) => s.trim()).map((s) => ({ speaker: null, text: s.trim() }))

  const originalLines = utterances.map((u) => ({
    speaker: u.speaker,
    original: u.text,
    adapted: "",
  }))

  // Store original lines and update status to "adapting"
  await supabase
    .from("ad_clones")
    .update({ status: "adapting", original_lines: originalLines })
    .eq("id", cloneId)

  // Run Claude adaptation
  const brain = clone.brand_brain as Pick<BrandBrain, "name" | "industry" | "tone_of_voice" | "usps" | "key_benefits" | "pain_points" | "target_audience" | "ctas"> | null
  if (!brain) {
    await supabase
      .from("ad_clones")
      .update({ status: "error", error_message: "Brand Brain no encontrado" })
      .eq("id", cloneId)
    return { ...clone, status: "error" } as AdClone
  }

  try {
    const adaptedLines = await adaptWithClaude(utterances, brain)
    await supabase
      .from("ad_clones")
      .update({
        status:        "ready",
        original_lines: originalLines,
        adapted_lines:  adaptedLines,
        updated_at:    new Date().toISOString(),
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
