"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { aaiPost, aaiGet } from "@/lib/actions/ad-clone"
import { describeVideo, type VideoDescription } from "@/lib/ai/video-understanding"
import { parseAiJson } from "@/lib/utils/ai-json"

// Embudo "Subir y clasificar": un video suelto (sin brief) se transcribe,
// la IA lo "ve" (Gemini) y Claude lo compara contra los conceptos del
// proyecto → 3 coincidencias o un concepto nuevo pre-llenado. La persona
// decide. El asset entra como borrador (no visible para el cliente).

const ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/`
const ANGULOS = ["Desired Outcome", "Objection", "Feature / Benefit", "Use Case", "Consequence", "Misconception", "Education", "Acceptance", "Failed Solutions", "Identity"]

export interface ConceptDraft {
  name: string
  angle_type: string
  organizing_principle: "Pain-First" | "Desire-First"
  target_persona: string
  pain_point: string
  why_it_works: string
  transformation: string
  funnel_stage: "TOF" | "MOF" | "BOF"
  brand_line_id: string | null
}
export interface Classification {
  assetId: string
  transcript: string | null
  video: VideoDescription | null
  provider: string | null
  summary: string
  matches: { concept_id: string; name: string; confidence: number; reason: string }[]
  new_concept: ConceptDraft
}

async function requireManager(projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (me?.role !== "admin" && me?.role !== "subadmin") {
    const { data } = await supabase.from("project_members").select("project_id").eq("project_id", projectId).eq("profile_id", user.id).maybeSingle()
    if (!data) throw new Error("Sin permiso")
  }
  return user.id
}

async function transcribe(url: string): Promise<string | null> {
  try {
    const t = await aaiPost("/transcript", { audio_url: url, language_detection: true })
    let r: { status: string; text?: string } = { status: "queued" }
    for (let i = 0; i < 40 && r.status !== "completed" && r.status !== "error"; i++) {
      await new Promise((x) => setTimeout(x, 3000))
      r = await aaiGet(`/transcript/${t.id}`)
    }
    return r.status === "completed" ? (r.text?.trim() || null) : null
  } catch (e) { console.error("[classify] transcripción:", e); return null }
}

export async function classifyAsset(projectId: string, assetId: string, lineId: string | null = null): Promise<Classification> {
  await requireManager(projectId)
  const db = createAdminClient()
  const { data: asset } = await db.from("creative_assets").select("id, project_id, file_type, file_path, asset_url").eq("id", assetId).single()
  if (!asset || asset.project_id !== projectId) throw new Error("Asset no encontrado")
  const url = asset.file_path ? ASSET_BASE + asset.file_path : asset.asset_url
  if (!url) throw new Error("El asset no tiene archivo")

  const [{ data: project }, { data: concepts }, transcriptAndVideo] = await Promise.all([
    db.from("projects").select("name, brand_brain_id").eq("id", projectId).single(),
    db.from("creative_concepts").select("id, name, angle_type, organizing_principle, target_persona, pain_point, why_it_works, transformation, funnel_stage, brand_line_id, status").eq("project_id", projectId).neq("status", "Archived").limit(80),
    Promise.all([transcribe(url), describeVideo(url)]),
  ])
  const [transcript, { description: video, provider }] = transcriptAndVideo
  const { data: lines } = project?.brand_brain_id ? await db.from("brand_lines").select("id, name, description").eq("brand_brain_id", project.brand_brain_id) : { data: [] }
  if (!transcript && !video) throw new Error("No se pudo transcribir ni analizar el video. Revisa que tenga audio o inténtalo de nuevo.")

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `Eres estratega creativo de una agencia de paid media. Clasificas un video publicitario contra los CONCEPTOS existentes de un proyecto (un concepto = una hipótesis creativa: ángulo + persona + dolor/deseo).
Reglas:
- "matches": hasta 3 conceptos existentes donde el video encaje, con confidence 0-100 honesto (más de 70 solo si el mensaje central y la persona coinciden de verdad) y una razón de una frase.
- "new_concept": SIEMPRE propón uno nuevo como alternativa, basado en lo que el video realmente dice y muestra. angle_type debe ser EXACTAMENTE uno de: ${ANGULOS.join(", ")}. funnel_stage: TOF, MOF o BOF. organizing_principle: Pain-First o Desire-First. brand_line_id: el id de la línea que mejor aplique o null.
- "summary": una frase de qué es el video.
Responde SOLO JSON: {"summary":"","matches":[{"concept_id":"","confidence":0,"reason":""}],"new_concept":{"name":"","angle_type":"","organizing_principle":"","target_persona":"","pain_point":"","why_it_works":"","transformation":"","funnel_stage":"","brand_line_id":null}}`,
    messages: [{
      role: "user",
      content: `PROYECTO: ${project?.name ?? ""}
SUBIDO DESDE LA LÍNEA: ${lineId ? (lines ?? []).find((l) => l.id === lineId)?.name ?? "—" : "General"} (úsala como línea por defecto del concepto nuevo salvo que el video sea claramente de otra)
LÍNEAS DE PRODUCTO: ${JSON.stringify((lines ?? []).map((l) => ({ id: l.id, name: l.name, description: l.description })))}
CONCEPTOS EXISTENTES: ${JSON.stringify((concepts ?? []).map((c) => ({ id: c.id, name: c.name, angle: c.angle_type, persona: c.target_persona, pain: c.pain_point, transformation: c.transformation, funnel: c.funnel_stage, line: c.brand_line_id })))}

TRANSCRIPCIÓN: ${transcript ?? "(sin voz o no disponible)"}

LO QUE SE VE Y SE OYE: ${video ? JSON.stringify(video) : "(no disponible — clasifica solo con la transcripción)"}`,
    }],
  })
  const parsed = parseAiJson<{ summary: string; matches: { concept_id: string; confidence: number; reason: string }[]; new_concept: ConceptDraft }>(msg, "classifyAsset")
  const byId = new Map((concepts ?? []).map((c) => [c.id, c]))
  const matches = (parsed.matches ?? []).filter((m) => byId.has(m.concept_id)).slice(0, 3)
    .map((m) => ({ ...m, name: byId.get(m.concept_id)!.name ?? "Concepto", confidence: Math.max(0, Math.min(100, Math.round(m.confidence))) }))
  const nc = parsed.new_concept
  const new_concept: ConceptDraft = {
    ...nc,
    angle_type: ANGULOS.includes(nc.angle_type) ? nc.angle_type : "Desired Outcome",
    funnel_stage: (["TOF", "MOF", "BOF"] as const).includes(nc.funnel_stage) ? nc.funnel_stage : "TOF",
    organizing_principle: nc.organizing_principle === "Pain-First" ? "Pain-First" : "Desire-First",
    brand_line_id: (lines ?? []).some((l) => l.id === nc.brand_line_id) ? nc.brand_line_id : lineId,
  }

  const analysis = { summary: parsed.summary, video, provider, matches, new_concept, analyzed_at: new Date().toISOString() }
  const { error } = await db.from("creative_assets").update({ transcript, ai_analysis: analysis }).eq("id", assetId)
  if (error && !/transcript|ai_analysis/.test(error.message)) console.error("[classify] guardar análisis:", error.message)
  return { assetId, transcript, video, provider, summary: parsed.summary, matches, new_concept }
}

export async function assignAssetToConcept(projectId: string, assetId: string, conceptId: string): Promise<void> {
  await requireManager(projectId)
  const db = createAdminClient()
  const { data: c } = await db.from("creative_concepts").select("project_id").eq("id", conceptId).single()
  if (c?.project_id !== projectId) throw new Error("Concepto no válido")
  const { error } = await db.from("creative_assets").update({ concept_id: conceptId }).eq("id", assetId).eq("project_id", projectId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function createConceptFromAsset(projectId: string, assetId: string, draft: ConceptDraft, cycleId: string | null): Promise<string> {
  const userId = await requireManager(projectId)
  const db = createAdminClient()
  const { data, error } = await db.from("creative_concepts").insert({
    project_id: projectId, cycle_id: cycleId, name: draft.name, angle_type: draft.angle_type, organizing_principle: draft.organizing_principle,
    target_persona: draft.target_persona ?? "", pain_point: draft.pain_point || null, why_it_works: draft.why_it_works || null,
    transformation: draft.transformation || null, funnel_stage: draft.funnel_stage, brand_line_id: draft.brand_line_id, status: "Active", created_by: userId,
  }).select("id").single()
  if (error) throw new Error(error.message)
  if (cycleId) await db.from("creative_concept_cycles").insert({ concept_id: data.id, cycle_id: cycleId }).then(() => {}, () => {})
  await db.from("creative_assets").update({ concept_id: data.id }).eq("id", assetId).eq("project_id", projectId)
  revalidatePath(`/projects/${projectId}`)
  return data.id as string
}

// Registra un archivo ya subido a Storage como asset borrador sin concepto
// (la clasificación decide después a qué concepto va). Regresa su id.
export async function registerUploadedAsset(projectId: string, input: { file_path: string; thumbnail_path: string | null; file_type: "video" | "image"; cycle_id: string | null }): Promise<string> {
  await requireManager(projectId)
  if (!input.file_path.startsWith(`${projectId}/`)) throw new Error("Ruta inválida")
  const db = createAdminClient()
  const { data, error } = await db.from("creative_assets").insert({
    project_id: projectId, cycle_id: input.cycle_id, concept_id: null, file_path: input.file_path, thumbnail_path: input.thumbnail_path,
    file_type: input.file_type, client_visible: false,
  }).select("id").single()
  if (error) throw new Error(error.message)
  if (input.cycle_id) await db.from("creative_asset_cycles").insert({ asset_id: data.id, cycle_id: input.cycle_id }).then(() => {}, () => {})
  return data.id as string
}
