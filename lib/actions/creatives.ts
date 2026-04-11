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
    organizing_principle: (formData.get("organizing_principle") as string) || null,
    angle_type:           (formData.get("angle_type") as string) || null,
    target_persona:       (formData.get("target_persona") as string) ?? "",
    pain_or_desire:       (formData.get("pain_or_desire") as string) ?? "",
    emotional_insight:    (formData.get("emotional_insight") as string) || null,
    central_tension:      (formData.get("central_tension") as string) || null,
    awareness_stage:      formData.get("awareness_stage") ? Number(formData.get("awareness_stage")) : null,
    mechanism:            (formData.get("mechanism") as string) || null,
    ref_links:            (formData.get("ref_links") as string) || null,
    proposed_hook:        (formData.get("proposed_hook") as string) || null,
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
    organizing_principle: (formData.get("organizing_principle") as string) || null,
    angle_type:           (formData.get("angle_type") as string) || null,
    target_persona:       (formData.get("target_persona") as string) ?? "",
    pain_or_desire:       (formData.get("pain_or_desire") as string) ?? "",
    emotional_insight:    (formData.get("emotional_insight") as string) || null,
    central_tension:      (formData.get("central_tension") as string) || null,
    awareness_stage:      formData.get("awareness_stage") ? Number(formData.get("awareness_stage")) : null,
    mechanism:            (formData.get("mechanism") as string) || null,
    ref_links:            (formData.get("ref_links") as string) || null,
    proposed_hook:        (formData.get("proposed_hook") as string) || null,
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
      concept:creative_concepts!concept_id(id, angle_type, target_persona)
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

  const { error } = await supabase.from("creative_assets").update({
    concept_id:        (formData.get("concept_id") as string) || null,
    format:            (formData.get("format") as string) || null,
    platform:          (formData.get("platform") as string) || null,
    variant:           (formData.get("variant") as string) || null,
    iteration:         (formData.get("iteration") as string) || null,
    hook:              (formData.get("hook") as string) || null,
    copy:              (formData.get("copy") as string) || null,
    cta:               (formData.get("cta") as string) || null,
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

// ── AI GENERATION ────────────────────────────────────────────

export interface AIDraftConcept {
  organizing_principle: string
  angle_type: string
  target_persona: string
  pain_or_desire: string
  emotional_insight: string
  central_tension: string
  awareness_stage: number
  mechanism: string
  proposed_hook: string
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
      .select("angle_type, target_persona, pain_or_desire, status, insight, proposed_hook, awareness_stage")
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
- target_persona: descripción concisa del buyer persona objetivo
- pain_or_desire: el dolor o deseo central que activa el ad
- emotional_insight: la tensión interna del buyer persona
- central_tension: el conflicto que el ad resuelve
- awareness_stage: número del 1 al 5
- mechanism: por qué este ángulo funciona psicológicamente para esta persona
- proposed_hook: hook inicial de alto impacto (primera línea del ad)

Ángulos disponibles: Problem Agitation, Mechanism Reveal, Enemy Framing, Before/After Transformation, Social Proof, Contrarian, Direct Desire, Fear of Missing Out, Authority, Curiosity Gap`

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
  `${i + 1}. Ángulo: ${c.angle_type ?? "—"} | Persona: ${c.target_persona} | Dolor/Deseo: ${c.pain_or_desire} | Status: ${c.status}${c.insight ? ` | Insight: ${c.insight}` : ""}`
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
    target_persona:       d.target_persona,
    pain_or_desire:       d.pain_or_desire,
    emotional_insight:    d.emotional_insight,
    central_tension:      d.central_tension,
    awareness_stage:      d.awareness_stage,
    mechanism:            d.mechanism,
    proposed_hook:        d.proposed_hook,
    status:               "Active",
    created_by:           userId,
  }))

  const { error } = await supabase.from("creative_concepts").insert(rows)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}
