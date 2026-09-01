"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
  CreativeConcept, CreativeAsset, CreativeBrief, BriefContent,
  ConceptStatus, ProductionStatus, AssetVerdict, BrandBrain, AdCloneLine,
  AssetCopy,
} from "@/lib/types"
import { adaptWithClaude, aaiPost, aaiGet, writeScriptFromConcept } from "@/lib/actions/ad-clone"
import type { ScriptStructureKey } from "@/lib/constants/creatives"
import { formatCycleRange } from "@/lib/utils"

// ── helpers ──────────────────────────────────────────────────

async function touchProjectActivity(projectId: string) {
  const supabase = await createClient()
  await supabase.from("projects").update({ last_activity_at: new Date().toISOString() }).eq("id", projectId).then(() => {})
}

function revalidateProject(projectId: string) {
  touchProjectActivity(projectId).catch(() => {})
  revalidatePath(`/projects/${projectId}`)
}

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

// Assets (the finished creative — video/image) can be produced and uploaded
// by anyone assigned to the project, not just admin/subadmin — mirrors the
// RLS on creative_assets (042_creative_assets_project_member_write.sql).
// Concepts/briefs stay admin-only; this check is only for asset mutations.
async function assertCanManageAssets(projectId: string, role: string, userId: string) {
  if (isAdminOrSubadmin(role)) return
  const supabase = await createClient()
  const { data } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("profile_id", userId)
    .maybeSingle()
  if (!data) throw new Error("Permission denied")
}

// ── CONCEPTS (Ad Lab lookup) ─────────────────────────────────

export async function getConceptsByBrandBrain(
  brandBrainId: string,
  brandLineId?: string | null,
): Promise<Pick<CreativeConcept, "id" | "name" | "angle_type" | "target_persona" | "pain_point" | "transformation" | "why_it_works" | "funnel_stage" | "status" | "brand_line_id">[]> {
  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("brand_brain_id", brandBrainId)
    .limit(1)
    .maybeSingle()
  if (!project) return []

  let query = supabase
    .from("creative_concepts")
    .select("id, name, angle_type, target_persona, pain_point, transformation, why_it_works, funnel_stage, status, brand_line_id")
    .eq("project_id", project.id)
    .in("status", ["Active", "Evergreen"])
    .order("created_at", { ascending: false })

  if (brandLineId) {
    query = query.eq("brand_line_id", brandLineId)
  }

  const { data } = await query
  return data ?? []
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
      creator:profiles!created_by(id, full_name),
      brand_line:brand_lines!brand_line_id(id, name, color)
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
    target_persona:       (formData.get("target_persona") as string) ?? "",
    why_it_works:         (formData.get("why_it_works") as string) || null,
    pain_point:           (formData.get("pain_point") as string) || null,
    objection:            (formData.get("objection") as string) || null,
    transformation:       (formData.get("transformation") as string) || null,
    awareness_stage:      formData.get("awareness_stage") ? Number(formData.get("awareness_stage")) : null,
    funnel_stage:         (formData.get("funnel_stage") as string) || null,
    ref_links:            (formData.get("ref_links") as string) || null,
    insight:              (formData.get("insight") as string) || null,
    brand_line_id:        (formData.get("brand_line_id") as string) || null,
    status:               "Active",
    created_by:           userId,
  })
  if (error) throw error
  revalidateProject(projectId)
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
    target_persona:       (formData.get("target_persona") as string) ?? "",
    why_it_works:         (formData.get("why_it_works") as string) || null,
    pain_point:           (formData.get("pain_point") as string) || null,
    objection:            (formData.get("objection") as string) || null,
    transformation:       (formData.get("transformation") as string) || null,
    awareness_stage:      formData.get("awareness_stage") ? Number(formData.get("awareness_stage")) : null,
    funnel_stage:         (formData.get("funnel_stage") as string) || null,
    ref_links:            (formData.get("ref_links") as string) || null,
    insight:              (formData.get("insight") as string) || null,
    brand_line_id:        (formData.get("brand_line_id") as string) || null,
    status:               (formData.get("status") as ConceptStatus) ?? "Active",
  }).eq("id", id)
  if (error) throw error
  revalidateProject(projectId)
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
  revalidateProject(projectId)
}

export async function demoteConcept(id: string, projectId: string, cycleId?: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_concepts").update({
    status: "Active",
    ...(cycleId ? { cycle_id: cycleId } : {}),
  }).eq("id", id)
  if (error) throw error
  revalidateProject(projectId)
}

export async function deleteConcept(id: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_concepts").delete().eq("id", id)
  if (error) throw error
  revalidateProject(projectId)
}

export async function bulkDeleteConcepts(ids: string[], projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_concepts").delete().in("id", ids)
  if (error) throw error
  revalidateProject(projectId)
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
  const { role, userId } = await getRole()
  await assertCanManageAssets(projectId, role, userId)

  const { error } = await supabase.from("creative_assets").insert({
    project_id:     projectId,
    cycle_id:       (formData.get("cycle_id") as string) || null,
    concept_id:     (formData.get("concept_id") as string) || null,
    brief_id:       (formData.get("brief_id") as string) || null,
    asset_url:      (formData.get("asset_url") as string) || null,
    file_path:      (formData.get("file_path") as string) || null,
    thumbnail_path: (formData.get("thumbnail_path") as string) || null,
    file_type:      (formData.get("file_type") as string) || null,
    format:         (formData.get("format") as string) || null,
    platform:       (formData.get("platform") as string) || null,
    // Every new asset starts hidden from the client, regardless of whatever
    // the column's default happens to be — a project manager has to
    // deliberately publish it (toggleClientVisible) before the client sees
    // it. This is the review gate between "editor uploaded" and "client can see."
    client_visible: false,
  })
  if (error) throw error

  revalidateProject(projectId)
}

export async function updateAsset(
  id: string,
  projectId: string,
  formData: FormData
): Promise<void> {
  const supabase = await createClient()
  const { role, userId } = await getRole()
  await assertCanManageAssets(projectId, role, userId)

  const { error } = await supabase.from("creative_assets").update({
    concept_id:     (formData.get("concept_id") as string) || null,
    brief_id:       (formData.get("brief_id") as string) || null,
    asset_url:      (formData.get("asset_url") as string) || null,
    file_path:      (formData.get("file_path") as string) || null,
    thumbnail_path: (formData.get("thumbnail_path") as string) || null,
    file_type:      (formData.get("file_type") as string) || null,
    format:         (formData.get("format") as string) || null,
    platform:       (formData.get("platform") as string) || null,
  }).eq("id", id)
  if (error) throw error
  revalidateProject(projectId)
}

export async function deleteAsset(id: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role, userId } = await getRole()
  await assertCanManageAssets(projectId, role, userId)

  const { error } = await supabase.from("creative_assets").delete().eq("id", id)
  if (error) throw error
  revalidateProject(projectId)
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
  revalidateProject(projectId)
}

// ── BRIEFS ──────────────────────────────────────────────────

export async function createBrief(
  projectId: string,
  conceptId: string,
  brandBrainId: string,
  attachedAdIds: string[] = [],
  attachedBoardIds: string[] = [],
  brandLineId?: string,
  title?: string,
): Promise<CreativeBrief> {
  const supabase = await createClient()
  const { userId, role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { data, error } = await supabase.from("creative_briefs").insert({
    project_id: projectId,
    concept_id: conceptId,
    brand_brain_id: brandBrainId,
    brand_line_id: brandLineId || null,
    attached_ad_ids: attachedAdIds,
    attached_board_ids: attachedBoardIds,
    title: title?.trim() || null,
    created_by: userId,
  }).select("*").single()
  if (error) throw error
  revalidateProject(projectId)
  return data as CreativeBrief
}

export async function updateBriefTitle(briefId: string, projectId: string, title: string): Promise<void> {
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")
  const supabase = await createClient()
  const { data: brief, error } = await supabase
    .from("creative_briefs")
    .update({ title: title.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", briefId)
    .select("share_token")
    .single()
  if (error) throw error
  revalidateProject(projectId)
  if (brief?.share_token) revalidatePath(`/share/brief/${brief.share_token}`)
}

// Names one script inside a brief's adapted_script (e.g. "Ana testimonial",
// "Bajada de precio") — briefs can hold several tropicalizations of the
// same concept, and they all read as the same generic "Guión #N" without
// this, everywhere the brief's scripts are listed.
export async function updateScriptTitle(briefId: string, projectId: string, scriptKey: string, title: string): Promise<void> {
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")
  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from("creative_briefs")
    .select("script_titles")
    .eq("id", briefId)
    .single()
  if (fetchError) throw fetchError

  const titles = { ...(existing?.script_titles as Record<string, string> | null ?? {}) }
  const trimmed = title.trim()
  if (trimmed) titles[scriptKey] = trimmed
  else delete titles[scriptKey]

  const { data: brief, error } = await supabase
    .from("creative_briefs")
    .update({ script_titles: titles, updated_at: new Date().toISOString() })
    .eq("id", briefId)
    .select("share_token")
    .single()
  if (error) throw error
  revalidateProject(projectId)
  if (brief?.share_token) revalidatePath(`/share/brief/${brief.share_token}`)
}

export async function updateBriefNotes(briefId: string, projectId: string, notes: string): Promise<void> {
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")
  const supabase = await createClient()
  const { data: brief, error } = await supabase
    .from("creative_briefs")
    .update({ important_notes: notes.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", briefId)
    .select("share_token")
    .single()
  if (error) throw error
  revalidateProject(projectId)
  if (brief?.share_token) revalidatePath(`/share/brief/${brief.share_token}`)
}

// Quick Create, step 1 — writes N script variants from scratch using only the
// concept's own strategy fields (no reference ad, no transcription, no
// brief_content). Pure generation: nothing is persisted here. The structure
// is always chosen explicitly by the user, never inferred from angle_type.
export async function generateScriptDrafts(
  conceptId: string,
  brandBrainId: string,
  structureKey: ScriptStructureKey,
  variantCount = 3,
): Promise<AdCloneLine[][]> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { data: concept } = await supabase
    .from("creative_concepts")
    .select("name, angle_type, target_persona, pain_point, why_it_works, objection, transformation, funnel_stage, brand_line_id")
    .eq("id", conceptId)
    .single()
  if (!concept) throw new Error("Concept not found")

  const { data: brain } = await supabase
    .from("brand_brains")
    .select("name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas")
    .eq("id", brandBrainId)
    .single()
  if (!brain) throw new Error("Brand Brain not found")

  const lineData = concept.brand_line_id
    ? (await supabase.from("brand_lines").select("name, description, usps, pain_points, keywords").eq("id", concept.brand_line_id).single()).data
    : null

  const variantSeeds = [
    "opción 1 — hook directo, ve al grano",
    "opción 2 — hook narrativo, abre con una escena o pregunta",
    "opción 3 — hook contrastante, abre con una afirmación inesperada",
  ]

  const results = await Promise.allSettled(
    Array.from({ length: Math.min(variantCount, variantSeeds.length) }, (_, i) =>
      writeScriptFromConcept(concept as any, brain as any, structureKey, lineData, variantSeeds[i])
    )
  )

  const drafts: AdCloneLine[][] = []
  results.forEach((r, i) => {
    if (r.status === "fulfilled") drafts.push(r.value)
    else console.error(`Quick Create variant ${i + 1} failed:`, r.reason)
  })

  if (drafts.length === 0) throw new Error("No se pudo generar ningún guión")
  return drafts
}

// Quick Create, step 2 — only called once the user reviews the drafts and
// decides which ones to keep. Creates the brief and persists the kept drafts.
export async function saveScriptDrafts(
  projectId: string,
  conceptId: string,
  brandBrainId: string,
  drafts: AdCloneLine[][],
): Promise<CreativeBrief> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")
  if (drafts.length === 0) throw new Error("No hay guiones para guardar")

  const { data: concept } = await supabase
    .from("creative_concepts")
    .select("brand_line_id")
    .eq("id", conceptId)
    .single()

  const brief = await createBrief(projectId, conceptId, brandBrainId, [], [], concept?.brand_line_id ?? undefined)

  const scripts: Record<string, unknown> = {}
  drafts.forEach((lines, i) => { scripts[`gen_${i + 1}`] = lines })

  await supabase.from("creative_briefs").update({
    adapted_script: scripts,
    updated_at: new Date().toISOString(),
  }).eq("id", brief.id)

  revalidateProject(projectId)
  const { data: fresh } = await supabase.from("creative_briefs").select("*, brand_brain:brand_brains!brand_brain_id(id, name, industry)").eq("id", brief.id).single()
  return fresh as CreativeBrief
}

// Manual script entry — no AI involved. The admin pastes/writes the full
// script as a single free-text block, stored as one AdCloneLine so it slots
// into the same adapted_script shape (and the same share-page / editable
// script UI) as AI-generated scripts.
export async function saveManualScript(
  projectId: string,
  conceptId: string,
  brandBrainId: string,
  scriptText: string,
): Promise<CreativeBrief> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")
  const text = scriptText.trim()
  if (!text) throw new Error("El guión no puede estar vacío")

  const { data: concept } = await supabase
    .from("creative_concepts")
    .select("brand_line_id")
    .eq("id", conceptId)
    .single()

  const brief = await createBrief(projectId, conceptId, brandBrainId, [], [], concept?.brand_line_id ?? undefined)

  const line: AdCloneLine = { speaker: null, original: "", adapted: text }
  await supabase.from("creative_briefs").update({
    adapted_script: { manual: [line] },
    updated_at: new Date().toISOString(),
  }).eq("id", brief.id)

  revalidateProject(projectId)
  const { data: fresh } = await supabase.from("creative_briefs").select("*, brand_brain:brand_brains!brand_brain_id(id, name, industry)").eq("id", brief.id).single()
  return fresh as CreativeBrief
}

// Appends one more manual script to a brief that already exists, instead of
// creating a new brief — lets an admin build up several script options
// (manual and/or AI) under a single share link over time.
export async function addManualScriptToBrief(
  briefId: string,
  projectId: string,
  scriptText: string,
): Promise<CreativeBrief> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")
  const text = scriptText.trim()
  if (!text) throw new Error("El guión no puede estar vacío")

  const { data: existing } = await supabase.from("creative_briefs").select("adapted_script").eq("id", briefId).single()
  if (!existing) throw new Error("Brief not found")
  const scripts = normalizeScriptMap(existing.adapted_script)
  const key = nextScriptKey(scripts, "manual")

  const line: AdCloneLine = { speaker: null, original: "", adapted: text }
  scripts[key] = [line]

  await supabase.from("creative_briefs").update({
    adapted_script: scripts,
    updated_at: new Date().toISOString(),
  }).eq("id", briefId)

  revalidateProject(projectId)
  const { data: fresh } = await supabase.from("creative_briefs").select("*, brand_brain:brand_brains!brand_brain_id(id, name, industry)").eq("id", briefId).single()
  return fresh as CreativeBrief
}

// Same idea as addManualScriptToBrief, but for one or more AI-generated
// drafts (Quick Create's kept variants) appended to an existing brief.
export async function addScriptDraftsToBrief(
  briefId: string,
  projectId: string,
  drafts: AdCloneLine[][],
): Promise<CreativeBrief> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")
  if (drafts.length === 0) throw new Error("No hay guiones para guardar")

  const { data: existing } = await supabase.from("creative_briefs").select("adapted_script").eq("id", briefId).single()
  if (!existing) throw new Error("Brief not found")
  const scripts = normalizeScriptMap(existing.adapted_script)

  drafts.forEach((lines) => { scripts[nextScriptKey(scripts, "gen")] = lines })

  await supabase.from("creative_briefs").update({
    adapted_script: scripts,
    updated_at: new Date().toISOString(),
  }).eq("id", briefId)

  revalidateProject(projectId)
  const { data: fresh } = await supabase.from("creative_briefs").select("*, brand_brain:brand_brains!brand_brain_id(id, name, industry)").eq("id", briefId).single()
  return fresh as CreativeBrief
}

// A brief's adapted_script can be null, a legacy flat AdCloneLine[] (pre
// multi-reference briefs), or the current Record<string, AdCloneLine[]> —
// normalize to the record shape so appends have a stable place to write to.
function normalizeScriptMap(raw: unknown): Record<string, AdCloneLine[]> {
  if (!raw) return {}
  if (Array.isArray(raw)) return { _single: raw as AdCloneLine[] }
  return { ...(raw as Record<string, AdCloneLine[]>) }
}

// Finds the next unused "<prefix>_N" key so repeated appends never clobber
// an earlier script (or the legacy "manual"/"gen_N" keys with no suffix).
function nextScriptKey(scripts: Record<string, AdCloneLine[]>, prefix: "manual" | "gen"): string {
  let n = 1
  while (scripts[`${prefix}_${n}`] !== undefined || (n === 1 && scripts[prefix] !== undefined)) n++
  return `${prefix}_${n}`
}

// Next.js redacts the message of any error thrown out of a Server Action in
// production builds — the client only ever sees a generic
// "An error occurred in the Server Components render" + digest, no matter
// what the thrown Error says. So this never throws: every failure path is
// caught here and returned as { error } data instead, which reaches the
// client verbatim. The real error is still console.error'd for the platform's
// server logs (matched by the digest, if you ever need to cross-reference).
export async function generateBriefContent(briefId: string): Promise<BriefContent | { error: string }> {
  const supabase = await createClient()
  try {
    const { role } = await getRole()
    if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

    const { data: brief } = await supabase
      .from("creative_briefs")
      .select("*, concept:creative_concepts!concept_id(*)")
      .eq("id", briefId)
      .single()
    if (!brief) throw new Error("Brief not found")

    const { data: brain } = await supabase
      .from("brand_brains")
      .select("name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas, description")
      .eq("id", brief.brand_brain_id)
      .single()
    if (!brain) throw new Error("Brand Brain not found")

    let brandLineBlock = ""
    if (brief.brand_line_id) {
      const { data: line } = await supabase
        .from("brand_lines")
        .select("name, description, usps, pain_points, keywords")
        .eq("id", brief.brand_line_id)
        .single()
      if (line) {
        brandLineBlock = `\nLÍNEA DE PRODUCTO/SERVICIO — ${line.name}:
- Descripción: ${line.description ?? "—"}
- USPs específicos: ${(line.usps ?? []).join(", ") || "—"}
- Dolores específicos: ${(line.pain_points ?? []).join(", ") || "—"}
- Keywords: ${(line.keywords ?? []).join(", ") || "—"}
El brief debe enfocarse en este producto/servicio específico.`
      }
    }

    let referenceSummary = ""
    if (brief.attached_ad_ids?.length > 0) {
      const { data: ads } = await supabase
        .from("saved_ads")
        .select("page_name, body, format, hook")
        .in("id", brief.attached_ad_ids)
      if (ads?.length) {
        referenceSummary += "\nReferencias de ads guardados:\n" + ads.map((a, i) =>
          `${i + 1}. ${a.page_name ?? "Ad"}: ${a.body?.slice(0, 200) ?? "sin copy"}${a.format ? ` [${a.format}]` : ""}`
        ).join("\n")
      }
    }

    const c = brief.concept as Record<string, unknown>

    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const usps = (brain.usps ?? []).join(", ") || "—"
    const benefits = (brain.key_benefits ?? []).join(", ") || "—"
    const pains = (brain.pain_points ?? []).join(", ") || "—"
    const ctas = (brain.ctas ?? []).join(", ") || "—"

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `Eres un director creativo senior especializado en performance marketing. Tu trabajo es crear briefs creativos enriquecidos que un editor de video, diseñador gráfico o creator pueda usar directamente para producir un asset publicitario.

Responde ÚNICAMENTE con un JSON válido con estos campos exactos. Sin markdown ni texto extra:
{
  "summary": "Resumen del brief en 2-3 oraciones",
  "strategy_rationale": "Por qué esta combinación de concepto + marca funciona",
  "key_messages": ["3-5 mensajes clave que el asset debe comunicar"],
  "tone_direction": "Dirección de tono y voz específica para esta pieza",
  "visual_direction": "Dirección visual: estilo, colores, mood, referencias",
  "reference_insights": "Qué tomar de las referencias adjuntas (si las hay)",
  "do_list": ["3-5 cosas que SÍ hacer"],
  "dont_list": ["3-5 cosas que NO hacer"],
  "suggested_formats": ["Formatos de ad recomendados para este concepto"]
}`,
      messages: [{
        role: "user",
        content: `Genera un brief creativo enriquecido combinando este concepto con el Brand Brain.

CONCEPTO CREATIVO:
- Nombre: ${c.name ?? "—"}
- Ángulo: ${c.angle_type ?? "—"} (${c.organizing_principle ?? "—"})
- Persona objetivo: ${c.target_persona ?? "—"}
- Producto/Servicio: ${c.product_service ?? "—"}
- Pain Point: ${c.pain_point ?? "—"}
- Por qué funciona: ${c.why_it_works ?? "—"}
- Objeción a superar: ${c.objection ?? "—"}
- Transformación: ${c.transformation ?? "—"}
- Funnel Stage: ${c.funnel_stage ?? "—"}
- Awareness Stage: ${c.awareness_stage ?? "—"}/5

BRAND BRAIN:
- Marca: ${brain.name}
- Industria: ${brain.industry ?? "—"}
- Idioma: ${brain.language ?? "español"}
- Tono de voz: ${brain.tone_of_voice ?? "—"}
- USPs: ${usps}
- Beneficios clave: ${benefits}
- Dolores del cliente: ${pains}
- Audiencia objetivo: ${brain.target_audience ?? "—"}
- CTAs: ${ctas}
- Descripción: ${brain.description ?? "—"}
${brandLineBlock}${referenceSummary}

El brief debe ser accionable: un editor o diseñador que lo lea debe poder empezar a producir sin preguntar nada.`,
      }],
    })

    const text = message.content[0].type === "text" ? message.content[0].text : ""
    let parsed: BriefContent
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
      else throw new Error("AI returned invalid JSON")
    }

    await supabase.from("creative_briefs").update({
      brief_content: parsed,
      updated_at: new Date().toISOString(),
    }).eq("id", briefId)

    // Tropicalize video scripts for each video reference. Videos are processed
    // IN PARALLEL (not sequentially) — with several references, sequential
    // transcription could push total runtime past the serverless function's
    // execution limit, silently killing the whole request mid-loop before the
    // final adapted_script write ever ran. Each video also gets its own polling
    // budget instead of an unbounded do/while, so one slow/stuck AssemblyAI job
    // can't stall — or starve — the rest.
    if (brief.attached_ad_ids?.length > 0) {
      try {
        const { data: ads } = await supabase
          .from("saved_ads")
          .select("id, video_url, cached_video_url, format")
          .in("id", brief.attached_ad_ids)
        const videoAds = ads?.filter((a: any) => a.format === "video" || a.cached_video_url || a.video_url) ?? []

        if (videoAds.length > 0) {
          const lineData = brief.brand_line_id
            ? (await supabase.from("brand_lines").select("name, description, usps, pain_points, keywords").eq("id", brief.brand_line_id).single()).data
            : null

          const POLL_INTERVAL_MS = 3000
          const MAX_POLL_ATTEMPTS = 40 // ~120s ceiling per video

          async function transcribeAndAdapt(videoAd: { id: string; video_url: string | null; cached_video_url: string | null }) {
            const videoUrl = videoAd.cached_video_url || videoAd.video_url
            if (!videoUrl) return null

            try {
              const transcript = await aaiPost("/transcript", {
                audio_url: videoUrl,
                language_detection: true,
              })

              let result: { status: string; text?: string } = { status: "queued" }
              let attempts = 0
              while (result.status !== "completed" && result.status !== "error") {
                if (attempts >= MAX_POLL_ATTEMPTS) {
                  console.error(`Brief tropicalization timed out for ad ${videoAd.id} after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s (last status: ${result.status})`)
                  return null
                }
                await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
                result = await aaiGet(`/transcript/${transcript.id}`)
                attempts++
              }

              if (result.status === "error") {
                console.error(`Brief tropicalization: AssemblyAI returned an error for ad ${videoAd.id}`)
                return null
              }

              if (result.text?.trim()) {
                const lines = await adaptWithClaude(result.text, brain as any, lineData, c as any)
                return { id: videoAd.id, lines }
              }
              return null
            } catch (e) {
              console.error(`Brief tropicalization failed for ad ${videoAd.id}:`, e)
              return null
            }
          }

          const results = await Promise.allSettled(videoAds.map(transcribeAndAdapt))
          const scripts: Record<string, any[]> = {}
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) scripts[r.value.id] = r.value.lines
          }

          if (Object.keys(scripts).length > 0) {
            await supabase.from("creative_briefs").update({
              adapted_script: scripts,
              updated_at: new Date().toISOString(),
            }).eq("id", briefId)
          }
        }
      } catch (e) {
        console.error("Brief tropicalization failed:", e)
      }
    }

    revalidateProject(brief.project_id)
    return parsed
  } catch (e) {
    console.error("generateBriefContent failed:", e)
    const error = e instanceof Error ? e.message : "Error desconocido generando el contenido del brief"
    return { error }
  }
}

export async function getBrief(briefId: string): Promise<CreativeBrief | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("creative_briefs")
    .select("*, brand_brain:brand_brains!brand_brain_id(id, name, industry)")
    .eq("id", briefId)
    .single()
  return (data as CreativeBrief) ?? null
}

export async function getBriefsForConcept(conceptId: string): Promise<CreativeBrief[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_briefs")
    .select("*, brand_brain:brand_brains!brand_brain_id(id, name, industry)")
    .eq("concept_id", conceptId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as CreativeBrief[]
}

export async function getBriefsForProject(projectId: string): Promise<CreativeBrief[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_briefs")
    .select("*, concept:creative_concepts!concept_id(id, name, angle_type, target_persona), brand_brain:brand_brains!brand_brain_id(id, name, industry), brand_line:brand_lines!brand_line_id(id, name, color)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as CreativeBrief[]
}

// Client-portal-safe: only the fields a client is allowed to see (no brief_content,
// no attached_ad_ids/references — those stay editor-only in getBriefByToken).
export async function getClientScriptsForProject(
  projectId: string,
): Promise<Pick<CreativeBrief, "id" | "concept_id" | "adapted_script" | "script_reviews">[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("creative_briefs")
    .select("id, concept_id, adapted_script, script_reviews")
    .eq("project_id", projectId)
    .not("adapted_script", "is", null)
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as any
}

export async function getBriefByToken(token: string): Promise<(CreativeBrief & { attached_ads?: any[] }) | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("creative_briefs")
    .select(`
      *,
      concept:creative_concepts!concept_id(id, name, angle_type, organizing_principle, target_persona, pain_point, why_it_works, objection, transformation, funnel_stage, awareness_stage, product_service),
      brand_brain:brand_brains!brand_brain_id(id, name, industry, language, logo_url, description, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas)
    `)
    .eq("share_token", token)
    .single()
  if (!data) return null

  const brief = data as CreativeBrief & { attached_ads?: any[] }

  if (brief.attached_ad_ids && brief.attached_ad_ids.length > 0) {
    const { data: ads } = await supabase
      .from("saved_ads")
      .select("id, page_name, cached_image_url, image_url, cached_video_url, video_url, format, body")
      .in("id", brief.attached_ad_ids)
    brief.attached_ads = ads ?? []
  }

  return brief
}

export async function deleteBrief(id: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_briefs").delete().eq("id", id)
  if (error) throw error
  revalidateProject(projectId)
}

export async function updateBriefScript(
  briefId: string,
  adId: string,
  lines: { speaker: string | null; original: string; adapted: string }[]
): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { data: brief } = await supabase
    .from("creative_briefs")
    .select("adapted_script, script_reviews, project_id, share_token")
    .eq("id", briefId)
    .single()
  if (!brief) throw new Error("Brief not found")

  const currentScript = brief.adapted_script
  const isLegacyArray = Array.isArray(currentScript)
  const updatedScript = isLegacyArray
    ? lines
    : { ...((currentScript as Record<string, unknown>) ?? {}), [adId]: lines }

  // Editing the lines invalidates whatever approval/changes-requested state
  // applied to the old version — the client needs to see and re-review the
  // new one, not keep looking at a stale "cambios pedidos" that's already
  // been addressed (or a stale "aprobado" for lines that changed since).
  const reviewKey = isLegacyArray ? "_single" : adId
  const currentReviews = (brief.script_reviews as Record<string, unknown>) ?? {}
  const updatedReviews = {
    ...currentReviews,
    [reviewKey]: { client_status: "pending_review", client_feedback: null },
  }

  const { error } = await supabase
    .from("creative_briefs")
    .update({ adapted_script: updatedScript, script_reviews: updatedReviews, updated_at: new Date().toISOString() })
    .eq("id", briefId)
  if (error) throw error

  if (brief.project_id) revalidateProject(brief.project_id as string)
  revalidatePath(`/share/brief/${brief.share_token}`)
  if (brief.project_id) revalidatePath(`/share/concepts/${brief.project_id}`)
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
  cycleId: string,
  brandBrainId?: string,
  brandLineId?: string,
): Promise<AIDraftConcept[]> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  // Fetch context: Brand Brain (preferred) + Brand Line + paid_media_context (fallback) + previous concepts + cycle
  const [brainRes, lineRes, contextRes, conceptsRes, cycleRes] = await Promise.all([
    brandBrainId
      ? supabase.from("brand_brains").select("name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas, description").eq("id", brandBrainId).single()
      : Promise.resolve({ data: null }),
    brandLineId
      ? supabase.from("brand_lines").select("name, description, usps, pain_points, keywords").eq("id", brandLineId).single()
      : Promise.resolve({ data: null }),
    supabase.from("paid_media_context").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("creative_concepts")
      .select("angle_type, target_persona, pain_point, status, insight, awareness_stage")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("paid_media_cycles").select("*").eq("id", cycleId).single(),
  ])

  const brain    = brainRes.data as Record<string, any> | null
  const line     = lineRes.data as Record<string, any> | null
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

Ángulos disponibles (usar EXACTAMENTE estos nombres): Desired Outcome, Objection, Feature / Benefit, Use Case, Consequence, Misconception, Education, Acceptance, Failed Solutions, Identity`

  const brandBlock = brain ? `BRAND BRAIN — ${brain.name}:
- Industria: ${brain.industry ?? "—"}
- Idioma: ${brain.language ?? "español"}
- Tono de voz: ${brain.tone_of_voice ?? "—"}
- USPs: ${(brain.usps ?? []).join(", ") || "—"}
- Beneficios clave: ${(brain.key_benefits ?? []).join(", ") || "—"}
- Dolores del cliente: ${(brain.pain_points ?? []).join(", ") || "—"}
- Audiencia objetivo: ${brain.target_audience ?? "—"}
- CTAs: ${(brain.ctas ?? []).join(", ") || "—"}
- Descripción: ${brain.description ?? "—"}` : null

  const contextBlock = ctx ? `Contexto de cuenta (Paid Media):
- Plataformas: ${ctx.platforms?.join(", ") ?? "No especificadas"}
- Objetivo principal: ${ctx.main_objective ?? "No especificado"}
- Presupuesto mensual de pauta: ${ctx.monthly_ad_budget ? `$${ctx.monthly_ad_budget}` : "No especificado"}
- ROAS objetivo: ${ctx.target_roas ?? "—"}
- CPA objetivo: ${ctx.target_cpa ?? "—"}
- CPL objetivo: ${ctx.target_cpl ?? "—"}
- Leads objetivo/mes: ${ctx.target_leads_per_month ?? "—"}
- Notas de cuenta: ${ctx.account_notes ?? "No especificadas"}` : null

  const lineBlock = line ? `\nLÍNEA DE PRODUCTO/SERVICIO — ${line.name}:
- Descripción: ${line.description ?? "—"}
- USPs específicos: ${(line.usps ?? []).join(", ") || "—"}
- Dolores específicos: ${(line.pain_points ?? []).join(", ") || "—"}
- Keywords: ${(line.keywords ?? []).join(", ") || "—"}

IMPORTANTE: Todos los conceptos deben enfocarse específicamente en "${line.name}". Los pain points, USPs y transformaciones deben ser relevantes para este producto/servicio en particular, no para la marca en general.` : ""

  const userPrompt = `${brandBlock ?? contextBlock ?? "Sin contexto de marca disponible."}
${brandBlock && contextBlock ? `\n${contextBlock}` : ""}${lineBlock}

Ciclo actual: ${cycle?.start_date && cycle?.end_date ? formatCycleRange(cycle.start_date, cycle.end_date) : "Activo"}

Historial de conceptos previos (${prevConcepts.length} conceptos):
${prevConcepts.length === 0 ? "Sin historial — cliente nuevo." : prevConcepts.map((c, i) =>
  `${i + 1}. Ángulo: ${c.angle_type ?? "—"} | Persona: ${c.target_persona} | Pain Point: ${c.pain_point} | Status: ${c.status}${c.insight ? ` | Insight: ${c.insight}` : ""}`
).join("\n")}

Genera 5 conceptos creativos nuevos. ${brandBlock ? "Usa el Brand Brain como fuente principal de contexto sobre la marca, su audiencia, sus dolores y su tono." : ""} Evita repetir combinaciones de ángulo+persona+dolor que ya existen en el historial. Si hay conceptos con status "Archived" y un insight negativo, aprende de ellos para no repetir el mismo error. Si hay conceptos "Winner" o "Evergreen", úsalos como referencia de qué tipo de mensaje resuena con este cliente.`

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

// ── Asset copy bank ──────────────────────────────────────────
//
// A per-asset bank of hook/copy/cta variants generated from the asset's
// concept strategy (not from the asset's image/video content — that was
// considered and dropped as unnecessary cost when the concept's strategic
// fields already fully determine the copy). Refining a variant (shorter/
// longer/richer) adds a new bank entry rather than overwriting, so the
// bank accumulates options to compare and reuse.

async function generateCopyText(prompt: string): Promise<{ hook: string; copy: string; cta: string }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    system: `Eres un copywriter de performance marketing experto en Meta Ads, TikTok Ads y Google Ads.
Responde ÚNICAMENTE con un JSON válido: {"hook": "...", "copy": "...", "cta": "..."}. Sin markdown, sin texto adicional.`,
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""
  let parsed: { hook?: string; copy?: string; cta?: string }
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("AI returned invalid JSON")
    parsed = JSON.parse(match[0])
  }
  return { hook: parsed.hook ?? "", copy: parsed.copy ?? "", cta: parsed.cta ?? "" }
}

export async function getAssetCopies(assetId: string): Promise<AssetCopy[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("asset_copies")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as AssetCopy[]
}

// First generation for an asset — pulls the asset's own concept/format/
// platform, no extra input needed from the caller.
export async function generateCopyForAsset(assetId: string): Promise<AssetCopy> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { data: asset, error: assetError } = await supabase
    .from("creative_assets")
    .select("id, project_id, concept_id, format, platform")
    .eq("id", assetId)
    .single()
  if (assetError) throw assetError
  if (!asset.concept_id) throw new Error("Este asset no está ligado a ningún concepto")

  const { data: concept, error: conceptError } = await supabase
    .from("creative_concepts")
    .select("angle_type, organizing_principle, target_persona, pain_point, why_it_works, objection, transformation, awareness_stage, product_service")
    .eq("id", asset.concept_id)
    .single()
  if (conceptError) throw conceptError

  const prompt = `Escribe hook, copy y CTA para este asset publicitario, en español.

Ángulo estratégico: ${concept.angle_type ?? "—"} (${concept.organizing_principle ?? "—"})
Persona objetivo: ${concept.target_persona ?? "—"}
${concept.product_service ? `Producto / Servicio: ${concept.product_service}` : ""}
Pain Point: ${concept.pain_point ?? "—"}
${concept.why_it_works ? `Por qué funciona: ${concept.why_it_works}` : ""}
${concept.objection ? `Objeción a superar: ${concept.objection}` : ""}
${concept.transformation ? `Transformación prometida: ${concept.transformation}` : ""}
Awareness stage: ${concept.awareness_stage ?? "—"}/5
Plataforma: ${asset.platform ?? "No especificada"}
Formato: ${asset.format ?? "No especificado"}

hook: máx 15 palabras, gancho de alto impacto. copy: cuerpo del ad, 2-4 frases. cta: máx 6 palabras.
El copy debe sentirse auténtico y específico para la persona descrita — no genérico.`

  const generated = await generateCopyText(prompt)

  const { data: inserted, error: insertError } = await supabase
    .from("asset_copies")
    .insert({ asset_id: assetId, ...generated, source: "generated" })
    .select("*")
    .single()
  if (insertError) throw insertError
  revalidatePath(`/projects/${asset.project_id}`)
  return inserted as AssetCopy
}

const REFINEMENT_INSTRUCTIONS: Record<"shorter" | "longer" | "richer", string> = {
  shorter: "Reescribe esta versión de forma MÁS CORTA — reduce el copy a la mitad manteniendo el mensaje central, hook y cta también más concisos.",
  longer:  "Reescribe esta versión de forma MÁS LARGA — expande el copy con más detalle, contexto o prueba social, sin perder el ángulo original.",
  richer:  "Reescribe esta versión MÁS ENRIQUECIDA — con lenguaje más vívido, sensorial y persuasivo, manteniendo el mismo mensaje y CTA.",
}

export async function refineAssetCopy(
  copyId: string,
  refinement: "shorter" | "longer" | "richer",
): Promise<AssetCopy> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { data: parent, error: parentError } = await supabase
    .from("asset_copies")
    .select("asset_id, hook, copy, cta")
    .eq("id", copyId)
    .single()
  if (parentError) throw parentError

  const { data: asset, error: assetError } = await supabase
    .from("creative_assets")
    .select("project_id")
    .eq("id", parent.asset_id)
    .single()
  if (assetError) throw assetError

  const prompt = `${REFINEMENT_INSTRUCTIONS[refinement]}

VERSIÓN ACTUAL:
hook: ${parent.hook ?? "—"}
copy: ${parent.copy ?? "—"}
cta: ${parent.cta ?? "—"}`

  const generated = await generateCopyText(prompt)

  const { data: inserted, error: insertError } = await supabase
    .from("asset_copies")
    .insert({ asset_id: parent.asset_id, ...generated, source: refinement, parent_copy_id: copyId })
    .select("*")
    .single()
  if (insertError) throw insertError
  revalidatePath(`/projects/${asset.project_id}`)
  return inserted as AssetCopy
}

export async function deleteAssetCopy(copyId: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")
  const { error } = await supabase.from("asset_copies").delete().eq("id", copyId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// Bulk insert confirmed AI draft concepts
export async function confirmAIDrafts(
  projectId: string,
  cycleId: string,
  drafts: AIDraftConcept[],
  brandLineId?: string,
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
    brand_line_id:        brandLineId || null,
    status:               "Active",
    created_by:           userId,
  }))

  const { error } = await supabase.from("creative_concepts").insert(rows)
  if (error) throw error
  revalidateProject(projectId)
}

// ── AI AUTOFILL ─────────────────────────────────────────────

export async function autofillConcept(
  idea: string,
  brandBrainId?: string,
  brandLineId?: string,
): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const [brainRes, lineRes] = await Promise.all([
    brandBrainId
      ? supabase.from("brand_brains").select("name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, description").eq("id", brandBrainId).single()
      : Promise.resolve({ data: null }),
    brandLineId
      ? supabase.from("brand_lines").select("name, description, usps, pain_points, keywords").eq("id", brandLineId).single()
      : Promise.resolve({ data: null }),
  ])

  const brain = brainRes.data as Record<string, any> | null
  const line = lineRes.data as Record<string, any> | null

  const systemPrompt = `Eres un estratega de publicidad digital. A partir de una idea escrita en lenguaje natural, rellena los campos de un concepto creativo para performance marketing.

Devuelve ÚNICAMENTE un objeto JSON válido con estos campos (todos strings):
- name: nombre corto del concepto (3-6 palabras)
- organizing_principle: "Pain-First" o "Desire-First"
- target_persona: descripción del buyer persona
- angle_type: EXACTAMENTE uno de: Desired Outcome, Objection, Feature / Benefit, Use Case, Consequence, Misconception, Education, Acceptance, Failed Solutions, Identity
- awareness_stage: número del 1 al 5 (como string)
- funnel_stage: "TOF", "MOF" o "BOF"
- pain_point: el dolor concreto
- objection: la objeción principal
- why_it_works: por qué resuena
- transformation: el cambio prometido

Sin markdown, sin texto extra. Solo el JSON.`

  let context = ""
  if (brain) {
    context += `MARCA: ${brain.name}
- Industria: ${brain.industry ?? "—"}
- Tono: ${brain.tone_of_voice ?? "—"}
- USPs: ${(brain.usps ?? []).join(", ") || "—"}
- Dolores: ${(brain.pain_points ?? []).join(", ") || "—"}
- Audiencia: ${brain.target_audience ?? "—"}
- Descripción: ${brain.description ?? "—"}\n`
  }
  if (line) {
    context += `LÍNEA DE PRODUCTO/SERVICIO: ${line.name}
- Descripción: ${line.description ?? "—"}
- USPs: ${(line.usps ?? []).join(", ") || "—"}
- Dolores: ${(line.pain_points ?? []).join(", ") || "—"}
- Keywords: ${(line.keywords ?? []).join(", ") || "—"}\n`
  }

  const userPrompt = `${context ? context + "\n" : ""}IDEA DEL USUARIO: "${idea}"

Genera el concepto creativo basado en esta idea.`

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""

  try {
    const parsed = JSON.parse(text)
    return parsed as Record<string, string>
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0]) as Record<string, string>
    throw new Error("AI returned invalid JSON")
  }
}
