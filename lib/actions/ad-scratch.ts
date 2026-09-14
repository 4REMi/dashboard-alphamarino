"use server"

import { createClient } from "@/lib/supabase/server"
import type { BrandBrain, ScratchAdIdea } from "@/lib/types"

// Ad Lab — crear estáticos DESDE CERO (sin anuncio de referencia).
//
// Deliberadamente NO es un solo tiro de "generar y ver qué sale": la
// ideación (barata, solo texto) vive separada de la generación de imagen
// (cara, vía Replicate) en scratch_ad_ideas — nada se genera hasta que el
// usuario aprueba una idea puntual. Una vez aprobada, se reusa el mismo
// motor de generación/revisión que ya existe para el clonado por
// referencia (image_clones, lib/actions/image-clone.ts) sin tocar su
// código — solo se le agrega un origen "scratch" sin saved_ad_id.

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

type BrainContext = Pick<BrandBrain, "name" | "industry" | "language" | "tone_of_voice" | "usps" | "key_benefits" | "pain_points" | "target_audience" | "ctas" | "brand_colors" | "logo_url" | "logo_square_url" | "logo_horizontal_url">

// ── Paso 1: ideación ──────────────────────────────────────────

export async function proposeScratchIdeas(input: {
  brandBrainId: string
  conceptId?: string | null
  brief?: string
}): Promise<ScratchAdIdea[]> {
  const { supabase, user } = await assertAuth()

  const brief = input.brief?.trim() || null
  if (!input.conceptId && !brief) {
    throw new Error("Elige un concepto o describe una dirección — la IA necesita algo que la dirija.")
  }

  const [{ data: brain }, { data: concept }, { data: prevIdeas }] = await Promise.all([
    supabase
      .from("brand_brains")
      .select("name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas, brand_colors, description")
      .eq("id", input.brandBrainId)
      .single(),
    input.conceptId
      ? supabase.from("creative_concepts")
          .select("name, angle_type, target_persona, pain_point, transformation, why_it_works, funnel_stage")
          .eq("id", input.conceptId)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("scratch_ad_ideas")
      .select("headline, copy_angle")
      .eq("brand_brain_id", input.brandBrainId)
      .eq(input.conceptId ? "concept_id" : "brief", input.conceptId ?? brief ?? "")
      .neq("status", "discarded")
      .order("created_at", { ascending: false })
      .limit(20),
  ])
  if (!brain) throw new Error("Brand Brain no encontrado")

  const brandBlock = `BRAND BRAIN — ${brain.name}:
- Industria: ${brain.industry ?? "—"}
- Idioma: ${brain.language ?? "español"}
- Tono de voz: ${brain.tone_of_voice ?? "—"}
- USPs: ${(brain.usps ?? []).join(", ") || "—"}
- Beneficios clave: ${(brain.key_benefits ?? []).join(", ") || "—"}
- Dolores del cliente: ${(brain.pain_points ?? []).join(", ") || "—"}
- Audiencia objetivo: ${brain.target_audience ?? "—"}
- CTAs: ${(brain.ctas ?? []).join(", ") || "—"}
- Colores de marca: ${(brain.brand_colors ?? []).map((c: { hex: string; label?: string }) => c.label ? `${c.label} (${c.hex})` : c.hex).join(", ") || "—"}
- Descripción: ${brain.description ?? "—"}`

  const conceptBlock = concept
    ? `\nCONCEPTO CREATIVO A SEGUIR — "${concept.name}":
- Ángulo: ${concept.angle_type ?? "—"}
- Persona objetivo: ${concept.target_persona ?? "—"}
- Dolor: ${concept.pain_point ?? "—"}
- Transformación: ${concept.transformation ?? "—"}
- Por qué conecta: ${concept.why_it_works ?? "—"}
- Etapa de funnel: ${concept.funnel_stage ?? "—"}\n
IMPORTANTE: las 4-5 ideas deben ejecutar este concepto específico, no inventar uno nuevo.`
    : `\nDIRECCIÓN LIBRE (sin concepto vinculado):\n"${brief}"`

  const prevBlock = (prevIdeas ?? []).length > 0
    ? `\nIdeas ya propuestas antes en esta combinación (${prevIdeas!.length}) — NO repitas el mismo headline/ángulo, propón variaciones genuinamente distintas:\n${prevIdeas!.map((p, i) => `${i + 1}. "${p.headline}" — ${p.copy_angle}`).join("\n")}`
    : ""

  const systemPrompt = `Eres un director creativo especializado en anuncios estáticos para performance marketing. Tu trabajo es proponer ideas de creativo estático DESDE CERO, sin ningún anuncio de referencia — cada idea debe poder generarse como una sola imagen publicitaria.

Debes devolver ÚNICAMENTE un array JSON válido con exactamente 5 objetos. Sin texto antes ni después. Sin markdown. Solo el JSON.

Cada objeto debe tener exactamente estos campos:
- headline: el titular/copy principal del anuncio (corto, directo, en el idioma de la marca)
- copy_angle: 1-2 frases explicando la lógica del mensaje — por qué este copy funcionaría para esta audiencia
- visual_description: descripción concreta de la composición visual (qué se ve, cómo se organiza, qué elementos gráficos/producto aparecen) — suficientemente específica para que un generador de imágenes la ejecute
- brand_elements_used: arreglo de strings describiendo qué elementos de marca usaría (ej. ["logo", "color primario", "USP: envío gratis"])

CRÍTICO — VALIDEZ DEL JSON: si necesitas citar una frase o palabra dentro de algún texto, usa comillas simples ('así') o guiones — NUNCA comillas dobles dentro de un valor de string, porque rompen el JSON. Ejemplo de lo que NO debes hacer: "visual_description": "una foto con el texto "oferta" en grande". Ejemplo correcto: "visual_description": "una foto con el texto 'oferta' en grande".`

  const userPrompt = `${brandBlock}${conceptBlock}${prevBlock}

Genera 5 ideas de creativo estático nuevas y distintas entre sí (varía el ángulo visual y de copy entre ellas, no propongas 5 variaciones del mismo layout).`

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""

  // The model occasionally leaves internal double-quotes unescaped inside a
  // string value (e.g. a "quoted phrase" in visual_description), which
  // breaks JSON.parse with a raw, unhelpful SyntaxError — never let that
  // propagate as-is, always surface a message the user can act on
  // ("intenta de nuevo" is genuinely the fix, since it's model variance).
  let drafts: { headline: string; copy_angle: string; visual_description: string; brand_elements_used: string[] }[]
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) throw new Error("Not an array")
    drafts = parsed
  } catch {
    try {
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) throw new Error("no array found")
      const parsed = JSON.parse(match[0])
      if (!Array.isArray(parsed)) throw new Error("Not an array")
      drafts = parsed
    } catch {
      throw new Error("La IA devolvió un formato inválido — intenta de nuevo, normalmente funciona al segundo intento.")
    }
  }

  const batchId = crypto.randomUUID()
  const { data: existingRounds } = await supabase
    .from("scratch_ad_ideas")
    .select("round")
    .eq("brand_brain_id", input.brandBrainId)
    .eq(input.conceptId ? "concept_id" : "brief", input.conceptId ?? brief ?? "")
    .order("round", { ascending: false })
    .limit(1)
  const nextRound = (existingRounds?.[0]?.round ?? 0) + 1

  const { data: inserted, error } = await supabase
    .from("scratch_ad_ideas")
    .insert(drafts.map((d) => ({
      brand_brain_id: input.brandBrainId,
      concept_id: input.conceptId || null,
      brief: input.conceptId ? null : brief,
      batch_id: batchId,
      round: nextRound,
      headline: d.headline,
      copy_angle: d.copy_angle,
      visual_description: d.visual_description,
      brand_elements_used: d.brand_elements_used ?? [],
      created_by: user.id,
    })))
    .select("*")
  if (error) throw error

  return (inserted ?? []) as ScratchAdIdea[]
}

export async function getScratchIdeas(brandBrainId: string, conceptId?: string | null, brief?: string | null): Promise<ScratchAdIdea[]> {
  const { supabase } = await assertAuth()
  let query = supabase
    .from("scratch_ad_ideas")
    .select("*")
    .eq("brand_brain_id", brandBrainId)
    .neq("status", "discarded")
    .order("round", { ascending: true })
    .order("created_at", { ascending: true })

  query = conceptId ? query.eq("concept_id", conceptId) : query.eq("brief", brief ?? "")

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ScratchAdIdea[]
}

export async function updateScratchIdea(
  ideaId: string,
  patch: { headline?: string; copy_angle?: string; visual_description?: string },
): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("scratch_ad_ideas")
    .update({
      ...(patch.headline !== undefined ? { edited_headline: patch.headline } : {}),
      ...(patch.copy_angle !== undefined ? { edited_copy_angle: patch.copy_angle } : {}),
      ...(patch.visual_description !== undefined ? { edited_visual_description: patch.visual_description } : {}),
      status: "edited",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ideaId)
  if (error) throw error
}

export async function discardScratchIdea(ideaId: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("scratch_ad_ideas")
    .update({ status: "discarded", updated_at: new Date().toISOString() })
    .eq("id", ideaId)
  if (error) throw error
}

// ── Paso 3: generación (solo para ideas aprobadas) ────────────

function buildScratchGenerationPrompt(
  idea: { headline: string; copy_angle: string; visual_description: string; brand_elements_used: string[] },
  brain: BrainContext,
  additionalContext: string,
): string {
  const colors = (brain.brand_colors ?? []).map((c) => c.hex)
  const colorBlock = colors.length > 0
    ? `COLORS\nPrimary: ${colors[0]}${colors.length > 1 ? `\nSecondary: ${colors.slice(1).join(", ")}` : ""}`
    : ""

  const extraLine = additionalContext.trim()
    ? `\n\n---\n\nADDITIONAL INSTRUCTIONS\n${additionalContext.trim()}`
    : ""

  return [
    `You are a visual designer creating a brand-new static ad image from scratch — there is no reference ad to copy the structure of. Design a complete, polished ad layout that executes the creative idea below.`,
    `---`,
    `BRAND\nName: ${brain.name}${brain.industry ? `\nIndustry: ${brain.industry}` : ""}${brain.tone_of_voice ? `\nTone: ${brain.tone_of_voice}` : ""}`,
    colorBlock,
    `---\n\nCREATIVE IDEA\nHeadline (render this text in the ad, in ${brain.language ?? "español"}): "${idea.headline}"\nCopy angle: ${idea.copy_angle}\nVisual composition: ${idea.visual_description}\nBrand elements to include: ${idea.brand_elements_used.join(", ") || "logo and brand colors"}`,
    extraLine,
  ].filter(Boolean).join("\n\n")
}

export async function approveScratchIdeasAndGenerate(
  ideaIds: string[],
  config: { aspectRatio: string; numImages: number; additionalContext: string },
): Promise<{ cloneIds: string[] }> {
  const { supabase, user } = await assertAuth()
  if (ideaIds.length === 0) return { cloneIds: [] }

  const { data: ideas, error } = await supabase
    .from("scratch_ad_ideas")
    .select("*")
    .in("id", ideaIds)
  if (error) throw error
  if (!ideas || ideas.length === 0) return { cloneIds: [] }

  const cloneIds: string[] = []
  for (const idea of ideas as ScratchAdIdea[]) {
    const { data: clone, error: cloneError } = await supabase
      .from("image_clones")
      .insert({
        saved_ad_id: null,
        source: "scratch",
        scratch_idea_id: idea.id,
        brand_brain_id: idea.brand_brain_id,
        concept_id: idea.concept_id,
        status: "ready",
        created_by: user.id,
      })
      .select("id")
      .single()
    if (cloneError) throw cloneError

    await supabase
      .from("scratch_ad_ideas")
      .update({ status: "approved", image_clone_id: clone.id, updated_at: new Date().toISOString() })
      .eq("id", idea.id)

    await generateScratchImage(clone.id, idea, config)
    cloneIds.push(clone.id)
  }

  return { cloneIds }
}

// Duplicado deliberado del tramo final de generateImages()
// (lib/actions/image-clone.ts:685-716) en vez de refactorizar esa función
// para aceptar un origen sin imagen — evita arriesgar el flujo de clonado
// por referencia que ya está en producción por una función que de por sí
// necesita su propio prompt (buildScratchGenerationPrompt) e imágenes de
// entrada (solo assets de marca, nunca un anuncio ajeno).
async function generateScratchImage(
  cloneId: string,
  idea: Pick<ScratchAdIdea, "headline" | "copy_angle" | "visual_description" | "brand_elements_used" | "edited_headline" | "edited_copy_angle" | "edited_visual_description">,
  config: { aspectRatio: string; numImages: number; additionalContext: string },
): Promise<void> {
  const { supabase } = await assertAuth()

  const { data: clone } = await supabase
    .from("image_clones")
    .select("brand_brain:brand_brains(id, name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas, brand_colors, logo_url, logo_square_url, logo_horizontal_url), reference_image_urls")
    .eq("id", cloneId)
    .single()

  const brain = clone?.brand_brain as unknown as BrainContext | null
  const logoUrl = brain?.logo_square_url ?? brain?.logo_url ?? brain?.logo_horizontal_url ?? null
  const userUploads: string[] = clone?.reference_image_urls ?? []
  const inputImages = [...(logoUrl ? [logoUrl] : []), ...userUploads].slice(0, 8)
  if (inputImages.length === 0) throw new Error("Esta marca no tiene logo ni assets de referencia — sube al menos una imagen antes de generar.")

  const effectiveIdea = {
    headline: idea.edited_headline ?? idea.headline,
    copy_angle: idea.edited_copy_angle ?? idea.copy_angle,
    visual_description: idea.edited_visual_description ?? idea.visual_description,
    brand_elements_used: idea.brand_elements_used,
  }
  const prompt = buildScratchGenerationPrompt(
    effectiveIdea,
    brain ?? { name: "Marca", industry: null, language: null, tone_of_voice: null, usps: [], key_benefits: [], pain_points: [], target_audience: null, ctas: [], brand_colors: [], logo_url: null, logo_square_url: null, logo_horizontal_url: null },
    config.additionalContext,
  )

  await supabase
    .from("image_clones")
    .update({ aspect_ratio: config.aspectRatio, num_images: config.numImages, status: "generating" })
    .eq("id", cloneId)

  const REPLICATE_MODEL = "google/nano-banana-pro"
  const token = process.env.REPLICATE_KEY
  if (!token) throw new Error("REPLICATE_KEY no configurado")

  async function submitOne(): Promise<string> {
    const res = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: {
          prompt,
          image_input: inputImages,
          aspect_ratio: config.aspectRatio,
          resolution: "2K",
          output_format: "jpg",
          safety_filter_level: "block_only_high",
        },
      }),
      cache: "no-store",
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { detail?: string }).detail ?? `Replicate error ${res.status}`)
    }
    const data = await res.json() as { id: string }
    return data.id
  }

  try {
    const ids: string[] = []
    for (let i = 0; i < config.numImages; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 300))
      ids.push(await submitOne())
    }
    await supabase
      .from("image_clones")
      .update({
        fal_request_id: JSON.stringify(ids),
        generation_input: {
          prompt, image_input: inputImages, aspect_ratio: config.aspectRatio,
          resolution: "2K", output_format: "jpg", safety_filter_level: "block_only_high",
        },
        retry_count: 0,
      })
      .eq("id", cloneId)
  } catch (err) {
    await supabase.from("image_clones").update({ status: "error", error_message: String(err) }).eq("id", cloneId)
    throw err
  }
}
