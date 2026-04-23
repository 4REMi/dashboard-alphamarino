"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { CreativeConcept, CreativeAsset, ConceptStatus, ProductionStatus, AssetVerdict } from "@/lib/types"

// ── helpers ──────────────────────────────────────────────────

async function getRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  return { userId: user.id, role: data?.role ?? "employee" }
}

function isAdminOrSubadmin(role: string) {
  return role === "admin" || role === "subadmin"
}

// ── CONCEPTS ─────────────────────────────────────────────────

export async function getCreativeConcepts(
  projectId: string,
  cycleId?: string | null
): Promise<CreativeConcept[]> {
  const supabase = await createClient()
  const { role } = await getRole()

  let query = supabase
    .from("creative_concepts")
    .select(`
      *,
      parent:creative_concepts!parent_concept_id(id, angle_type, status, insight),
      creator:profiles!created_by(id, full_name)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })

  if (cycleId) {
    // Show concepts for this cycle OR evergreen concepts (cycle_id IS NULL + status = Evergreen)
    query = query.or(`cycle_id.eq.${cycleId},and(cycle_id.is.null,status.eq.Evergreen)`)
  } else {
    // No cycle specified: show only Evergreen
    query = query.is("cycle_id", null).eq("status", "Evergreen")
  }

  const { data, error } = await query
  if (error) throw error

  // Strip insight from non-admins
  return (data ?? []).map((c) => ({
    ...c,
    insight: isAdminOrSubadmin(role) ? c.insight : null,
  })) as CreativeConcept[]
}

export async function createConcept(projectId: string, formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { userId, role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const cycleId = formData.get("cycle_id") as string | null

  const { error } = await supabase.from("creative_concepts").insert({
    project_id:           projectId,
    cycle_id:             cycleId || null,
    parent_concept_id:    (formData.get("parent_concept_id") as string) || null,
    name:                 (formData.get("name") as string) || null,
    organizing_principle: (formData.get("organizing_principle") as string) || null,
    product_service:      (formData.get("product_service") as string) || null,
    angle_type:           (formData.get("angle_type") as string) || null,
    mechanic_primary:     (formData.get("mechanic_primary") as string) || null,
    mechanic_secondary:   (formData.get("mechanic_secondary") as string) || null,
    target_persona:       (formData.get("target_persona") as string) ?? "",
    why_it_works:         (formData.get("why_it_works") as string) || null,
    pain_point:           (formData.get("pain_point") as string) || null,
    objection:            (formData.get("objection") as string) || null,
    transformation:       (formData.get("transformation") as string) || null,
    awareness_stage:      formData.get("awareness_stage") ? Number(formData.get("awareness_stage")) : null,
    funnel_stage:         (formData.get("funnel_stage") as string) || null,
    ref_links:            (formData.get("ref_links") as string) || null,
    insight:              (formData.get("insight") as string) || null,
    status:               "Active",
    created_by:           userId,
  })
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function updateConcept(
  id: string,
  projectId: string,
  formData: FormData
): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_concepts").update({
    name:                 (formData.get("name") as string) || null,
    organizing_principle: (formData.get("organizing_principle") as string) || null,
    product_service:      (formData.get("product_service") as string) || null,
    angle_type:           (formData.get("angle_type") as string) || null,
    mechanic_primary:     (formData.get("mechanic_primary") as string) || null,
    mechanic_secondary:   (formData.get("mechanic_secondary") as string) || null,
    target_persona:       (formData.get("target_persona") as string) ?? "",
    why_it_works:         (formData.get("why_it_works") as string) || null,
    pain_point:           (formData.get("pain_point") as string) || null,
    objection:            (formData.get("objection") as string) || null,
    transformation:       (formData.get("transformation") as string) || null,
    awareness_stage:      formData.get("awareness_stage") ? Number(formData.get("awareness_stage")) : null,
    funnel_stage:         (formData.get("funnel_stage") as string) || null,
    ref_links:            (formData.get("ref_links") as string) || null,
    insight:              (formData.get("insight") as string) || null,
    status:               (formData.get("status") as ConceptStatus) ?? "Active",
  }).eq("id", id)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function promoteConcept(id: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_concepts").update({
    status:   "Evergreen",
    cycle_id: null,
  }).eq("id", id)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function demoteConcept(id: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_concepts").update({
    status: "Active",
  }).eq("id", id)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteConcept(id: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_concepts").delete().eq("id", id)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ── ASSETS ───────────────────────────────────────────────────

export async function getCreativeAssets(
  projectId: string,
  cycleId?: string | null
): Promise<CreativeAsset[]> {
  const supabase = await createClient()
  const { role } = await getRole()

  let query = supabase
    .from("creative_assets")
    .select(`
      *,
      concept:creative_concepts!concept_id(id, name, angle_type, target_persona)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })

  if (cycleId) {
    query = query.eq("cycle_id", cycleId)
  }

  const { data, error } = await query
  if (error) throw error

  // Strip performance + verdict columns for employees
  return (data ?? []).map((a) => {
    if (isAdminOrSubadmin(role)) return a as CreativeAsset
    return {
      ...a,
      ctr: null, cpc: null, cpm: null, roas: null, cpa: null,
      spend: null, results: null, results_type: null,
      verdict: null, verdict_notes: null,
    } as CreativeAsset
  })
}

export async function createAsset(projectId: string, formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const fmStr = formData.get("format_meta") as string | null
  const { error } = await supabase.from("creative_assets").insert({
    project_id:        projectId,
    cycle_id:          (formData.get("cycle_id") as string) || null,
    concept_id:        (formData.get("concept_id") as string) || null,
    format:            (formData.get("format") as string) || null,
    platform:          (formData.get("platform") as string) || null,
    variant:           (formData.get("variant") as string) || null,
    iteration:         (formData.get("iteration") as string) || null,
    hook:              (formData.get("hook") as string) || null,
    copy:              (formData.get("copy") as string) || null,
    cta:               (formData.get("cta") as string) || null,
    format_meta:       fmStr ? JSON.parse(fmStr) : null,
    asset_url:         (formData.get("asset_url") as string) || null,
    production_status: (formData.get("production_status") as ProductionStatus) ?? "Pending",
    ctr:          formData.get("ctr")   ? Number(formData.get("ctr"))   : null,
    cpc:          formData.get("cpc")   ? Number(formData.get("cpc"))   : null,
    cpm:          formData.get("cpm")   ? Number(formData.get("cpm"))   : null,
    roas:         formData.get("roas")  ? Number(formData.get("roas"))  : null,
    cpa:          formData.get("cpa")   ? Number(formData.get("cpa"))   : null,
    spend:        formData.get("spend") ? Number(formData.get("spend")) : null,
    results:      formData.get("results") ? Number(formData.get("results")) : null,
    results_type: (formData.get("results_type") as string) || null,
    verdict:      (formData.get("verdict") as AssetVerdict) || null,
    verdict_notes:(formData.get("verdict_notes") as string) || null,
  })
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function updateAsset(
  id: string,
  projectId: string,
  formData: FormData
): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const fmStrU = formData.get("format_meta") as string | null
  const { error } = await supabase.from("creative_assets").update({
    concept_id:        (formData.get("concept_id") as string) || null,
    format:            (formData.get("format") as string) || null,
    platform:          (formData.get("platform") as string) || null,
    variant:           (formData.get("variant") as string) || null,
    iteration:         (formData.get("iteration") as string) || null,
    hook:              (formData.get("hook") as string) || null,
    copy:              (formData.get("copy") as string) || null,
    cta:               (formData.get("cta") as string) || null,
    format_meta:       fmStrU ? JSON.parse(fmStrU) : null,
    asset_url:         (formData.get("asset_url") as string) || null,
    production_status: (formData.get("production_status") as ProductionStatus) ?? "Pending",
    ctr:          formData.get("ctr")   ? Number(formData.get("ctr"))   : null,
    cpc:          formData.get("cpc")   ? Number(formData.get("cpc"))   : null,
    cpm:          formData.get("cpm")   ? Number(formData.get("cpm"))   : null,
    roas:         formData.get("roas")  ? Number(formData.get("roas"))  : null,
    cpa:          formData.get("cpa")   ? Number(formData.get("cpa"))   : null,
    spend:        formData.get("spend") ? Number(formData.get("spend")) : null,
    results:      formData.get("results") ? Number(formData.get("results")) : null,
    results_type: (formData.get("results_type") as string) || null,
    verdict:      (formData.get("verdict") as AssetVerdict) || null,
    verdict_notes:(formData.get("verdict_notes") as string) || null,
  }).eq("id", id)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteAsset(id: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_assets").delete().eq("id", id)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function toggleClientVisible(
  assetId: string,
  projectId: string,
  visible: boolean
): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_assets").update({
    client_visible: visible,
    client_status:  visible ? "pending_review" : null,
    client_feedback: null,
  }).eq("id", assetId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ── AI GENERATION ────────────────────────────────────────────

export interface AIDraftConcept {
  organizing_principle: string
  angle_type: string
  name: string
  target_persona: string
  product_service: string
  pain_point: string
  why_it_works: string
  objection: string
  transformation: string
  awareness_stage: number
  funnel_stage: string
}

export async function generateCreativeConcepts(
  projectId: string,
  cycleId: string
): Promise<AIDraftConcept[]> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  // Fetch context: paid media context + previous concepts with insights
  const [contextRes, conceptsRes, cycleRes] = await Promise.all([
    supabase.from("paid_media_context").select("*").eq("project_id", projectId).single(),
    supabase.from("creative_concepts")
      .select("angle_type, target_persona, pain_point, status, insight, awareness_stage")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("paid_media_cycles").select("*").eq("id", cycleId).single(),
  ])

  const ctx      = contextRes.data
  const prevConcepts = conceptsRes.data ?? []
  const cycle    = cycleRes.data

  const systemPrompt = `Eres un estratega de publicidad digital especializado en Creative Strategy para performance marketing. Tu trabajo es generar hipótesis de conceptos creativos para anuncios basados en el contexto de la cuenta y el historial estratégico del cliente.

Debes devolver ÚNICAMENTE un array JSON válido con exactamente 5 objetos. Sin texto antes ni después. Sin markdown. Solo el JSON.

Cada objeto debe tener exactamente estos campos:
- organizing_principle: "Pain-First" o "Desire-First"
- angle_type: uno de los 10 ángulos disponibles
- name: nombre corto del concepto (3-6 palabras, en español)
- target_persona: descripción concisa del buyer persona objetivo
- product_service: el producto o servicio que se promueve en este concepto
- pain_point: el dolor o problema concreto que activa este anuncio
- why_it_works: por qué este ángulo resuena emocionalmente con esta persona
- objection: la objeción principal que el ad debe superar
- transformation: el cambio o resultado que el ad promete
- awareness_stage: número del 1 al 5
- funnel_stage: "TOF", "MOF" o "BOF"

Ángulos disponibles: Desired Outcome, Objection, Feature/Benefit, Use Case, Consequence, Misconception, Education, Acceptance, Failed Solutions, Identity`

  const userPrompt = `Contexto de la cuenta:
- Plataformas: ${ctx?.platforms?.join(", ") ?? "No especificadas"}
- Objetivo principal: ${ctx?.main_objective ?? "No especificado"}
- Presupuesto mensual de pauta: ${ctx?.monthly_ad_budget ? `$${ctx.monthly_ad_budget}` : "No especificado"}
- ROAS objetivo: ${ctx?.target_roas ?? "—"}
- CPA objetivo: ${ctx?.target_cpa ?? "—"}
- CPL objetivo: ${ctx?.target_cpl ?? "—"}
- Leads objetivo/mes: ${ctx?.target_leads_per_month ?? "—"}
- Notas de cuenta (buyer persona, restricciones, briefing): ${ctx?.account_notes ?? "No especificadas"}

Ciclo actual: ${cycle?.cycle_month ? new Date(cycle.cycle_month).toLocaleDateString("es-MX", { month: "long", year: "numeric" }) : "Activo"}

Historial de conceptos previos (${prevConcepts.length} conceptos):
${prevConcepts.length === 0 ? "Sin historial — cliente nuevo." : prevConcepts.map((c, i) =>
  `${i + 1}. Ángulo: ${c.angle_type ?? "—"} | Persona: ${c.target_persona} | Pain Point: ${c.pain_point} | Status: ${c.status}${c.insight ? ` | Insight: ${c.insight}` : ""}`
).join("\n")}

Genera 5 conceptos creativos nuevos. Evita repetir combinaciones de ángulo+persona+dolor que ya existen en el historial. Si hay conceptos con status "Archived" y un insight negativo, aprende de ellos para no repetir el mismo error. Si hay conceptos "Winner" o "Evergreen", úsalos como referencia de qué tipo de mensaje resuena con este cliente.`

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""

  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) throw new Error("Not an array")
    return parsed as AIDraftConcept[]
  } catch {
    // Try to extract JSON array from text if it has extra content
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0]) as AIDraftConcept[]
    throw new Error("AI returned invalid JSON")
  }
}

// Generate hook / copy / CTA + format_meta for a single asset from its parent concept
export async function generateAssetCopy(
  projectId: string,
  conceptId: string,
  format: string | null,  // sub-type: "VO + B-roll" | "UGC" | "Static" | "Carousel" | "Other"
  platform: string | null,
  language = "es",
  copyLength = "~150 palabras"
): Promise<{ hook: string; copy: string; cta: string; format_meta: Record<string, unknown> }> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const [conceptRes, ctxRes] = await Promise.all([
    supabase.from("creative_concepts")
      .select("angle_type, organizing_principle, target_persona, pain_point, why_it_works, objection, transformation, awareness_stage, product_service, mechanic_primary, mechanic_secondary")
      .eq("id", conceptId)
      .single(),
    supabase.from("paid_media_context")
      .select("main_objective, account_notes, platforms")
      .eq("project_id", projectId)
      .single(),
  ])

  const c   = conceptRes.data
  const ctx = ctxRes.data
  if (!c) throw new Error("Concept not found")

  // Per sub-type instructions for hook/copy/cta + format_meta fields
  const subTypeGuides: Record<string, string> = {
    "VO + B-roll": `Genera estos campos:
- hook: primera línea spoken (máx 15 palabras, impacto inmediato — lo que se dice al inicio del video)
- copy: guión de narración en 3-4 frases que fluyen del hook
- cta: texto spoken o overlay (máx 5 palabras)
- format_meta.vo_script: guión completo de voz en off listo para grabar (${copyLength}, tono conversacional y persuasivo)
- format_meta.broll_notes: array JSON de 6-8 strings, cada uno es una escena de B-roll concreta y visualizable (ej: "Manos tecleando en laptop mientras aparecen notificaciones de venta"). Devuelve SOLO el array, sin numeración ni viñetas dentro de cada string.`,

    "UGC": `Genera estos campos:
- hook: línea de apertura que el creator dice a cámara (máx 15 palabras, patrón de pattern interrupt)
- copy: cuerpo del ad copy escrito para el creator (${copyLength})
- cta: llamada a la acción al final del video (máx 6 palabras)
- format_meta.talent_brief: briefing completo y listo para enviar al creator (incluye: tono de voz, 3 key points obligatorios que debe mencionar, 2 cosas a evitar, estilo de edición sugerido)`,

    "Static": `Genera estos campos:
- hook: headline de máx 7 palabras (lo más llamativo de la imagen)
- copy: body copy (máx 125 caracteres, complementa el visual sin repetirlo)
- cta: texto del botón (máx 4 palabras)
- format_meta.visual_description: descripción de arte concreta (qué muestra la imagen, jerarquía visual, colores sugeridos, elementos clave, estilo fotográfico o ilustración)
- format_meta.size_ratio: "1:1"`,

    "Carousel": `Genera estos campos:
- hook: titular del primer slide que detiene el scroll (máx 8 palabras)
- copy: copy general del carousel (introducción o descripción del set)
- cta: texto del último slide y botón (máx 4 palabras)
- format_meta.slide_count: 5
- format_meta.slides_brief: estructura slide por slide en formato "Slide N: [título] — [descripción visual + texto]" (slide 1 = problema/hook, slides 2-4 = desarrollo/prueba/beneficios, slide 5 = CTA)`,

    "Other": `Genera estos campos:
- hook: línea de apertura de alto impacto
- copy: cuerpo del ad copy (3-4 frases)
- cta: llamada a la acción clara y directa
- format_meta.production_notes: notas de dirección creativa y producción para el equipo`,
  }

  const guideForSubType = subTypeGuides[format ?? ""] ?? subTypeGuides["Other"]

  const langLabel = language === "es" ? "Español" : language === "en" ? "English" : language

  const systemPrompt = `Eres un copywriter de performance marketing experto en Meta Ads, TikTok Ads y Google Ads. Escribes copy que convierte basándote en el ángulo estratégico y el perfil psicológico del buyer persona.

Responde ÚNICAMENTE con un JSON válido con estos campos: hook, copy, cta, format_meta (objeto). Sin markdown, sin texto adicional.`

  // Build mechanic instruction block
  const mechanicBlock = c.mechanic_primary ? `
MECÁNICA CREATIVA — esta es la arquitectura estructural del ad. No es el hook ni el formato visual; es el movimiento cognitivo/emocional que hace que el viewer sienta o concluya algo.

Mecánica primaria: ${c.mechanic_primary}
La ejecución del copy, el guión y el b-roll deben reflejar esta mecánica como principio arquitectónico. No la menciones explícitamente — aplícala.
${c.mechanic_secondary ? `\nMecánica secundaria: ${c.mechanic_secondary}\nÚsala como capa adicional de profundidad emocional o credibilidad, sin eclipsar la primaria.` : ""}` : ""

  const userPrompt = `Escribe el copy y brief de producción para este asset publicitario.

IDIOMA DEL ANUNCIO: ${langLabel} — todo el copy (hook, copy, cta, vo_script, talent_brief, slides_brief, etc.) debe estar escrito en ${langLabel}. Los nombres de los campos del JSON permanecen en inglés; solo el contenido va en ${langLabel}.

Ángulo estratégico: ${c.angle_type ?? "—"} (${c.organizing_principle ?? "—"})
Persona objetivo: ${c.target_persona}
${c.product_service ? `Producto / Servicio: ${c.product_service}` : ""}
Pain Point: ${c.pain_point ?? "—"}
${c.why_it_works ? `Por qué funciona: ${c.why_it_works}` : ""}
${c.objection ? `Objeción a superar: ${c.objection}` : ""}
${c.transformation ? `Transformación prometida: ${c.transformation}` : ""}
Awareness stage: ${c.awareness_stage ?? "—"}/5
Plataforma: ${platform ?? "No especificada"}
Sub-tipo de asset: ${format ?? "No especificado"}
Objetivo de campaña: ${ctx?.main_objective ?? "No especificado"}
${ctx?.account_notes ? `Briefing adicional: ${ctx.account_notes}` : ""}
${mechanicBlock}
Instrucciones por sub-tipo:
${guideForSubType}

El copy debe sentirse auténtico y específico para la persona descrita — no genérico. Respeta el ángulo y la tensión del concepto.`

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""

  try {
    const parsed = JSON.parse(text)
    return {
      hook: parsed.hook ?? "",
      copy: parsed.copy ?? "",
      cta: parsed.cta ?? "",
      format_meta: parsed.format_meta ?? {},
    }
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return {
        hook: parsed.hook ?? "",
        copy: parsed.copy ?? "",
        cta: parsed.cta ?? "",
        format_meta: parsed.format_meta ?? {},
      }
    }
    throw new Error("AI returned invalid JSON")
  }
}

// Bulk insert confirmed AI draft concepts
export async function confirmAIDrafts(
  projectId: string,
  cycleId: string,
  drafts: AIDraftConcept[]
): Promise<void> {
  const supabase = await createClient()
  const { userId, role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const rows = drafts.map((d) => ({
    project_id:           projectId,
    cycle_id:             cycleId,
    organizing_principle: d.organizing_principle,
    angle_type:           d.angle_type,
    name:                 d.name || null,
    target_persona:       d.target_persona,
    product_service:      d.product_service || null,
    pain_point:           d.pain_point,
    why_it_works:         d.why_it_works || null,
    objection:            d.objection || null,
    transformation:       d.transformation || null,
    awareness_stage:      d.awareness_stage,
    funnel_stage:         d.funnel_stage || null,
    status:               "Active",
    created_by:           userId,
  }))

  const { error } = await supabase.from("creative_concepts").insert(rows)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}
