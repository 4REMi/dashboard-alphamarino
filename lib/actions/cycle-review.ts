"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { assertNoCycleOverlap } from "@/lib/utils/cycle-overlap"
import { getCreativeConcepts, getCreativeAssets } from "@/lib/actions/creatives"
import { getCreativePerformance } from "@/lib/actions/paid-media-performance"
import type { CreativeConcept, CreativeAsset, PaidMediaCycle } from "@/lib/types"

// Repaso de cierre de ciclo: el único camino para abrir el siguiente ciclo.
// Decide qué conceptos y assets continúan (se agregan a creative_*_cycles
// del ciclo nuevo — no se copian ni se mueven), cuáles terminan (Archived,
// con motivo opcional que alimenta al generador de conceptos), y la
// etiqueta manual Evergreen. Se puede corregir después (editCarryOver).

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (data?.role !== "admin" && data?.role !== "subadmin") throw new Error("Sin permiso")
  return supabase
}

export interface ReviewConcept {
  concept: CreativeConcept
  spend: number
  results: number
  running: boolean
}

export interface ReviewAsset {
  asset: CreativeAsset
  running: boolean
}

export interface CycleReviewData {
  cycle: PaidMediaCycle
  concepts: ReviewConcept[]
  // Solo versiones vigentes de cada pieza (las ya reemplazadas no se llevan).
  assets: ReviewAsset[]
  syncedSpend: number
  // Modo corrección: qué ya está en el ciclo siguiente.
  nextCycle: PaidMediaCycle | null
  nextConceptIds: string[]
  nextAssetIds: string[]
  // Si ya hay otro ciclo activo (datos viejos), el repaso traspasa a ese.
  otherActiveCycle: PaidMediaCycle | null
}

export async function getCycleReviewData(projectId: string, cycleId: string): Promise<CycleReviewData> {
  const supabase = await createClient()
  const { data: cycle, error } = await supabase.from("paid_media_cycles").select("*").eq("id", cycleId).single()
  if (error || !cycle) throw new Error("No se encontró el ciclo")

  const [concepts, assets, ads] = await Promise.all([
    getCreativeConcepts(projectId, cycleId),
    getCreativeAssets(projectId, cycleId),
    getCreativePerformance(projectId, cycleId),
  ])

  const spendByConcept = new Map<string, { spend: number; results: number; running: boolean }>()
  const runningAssetIds = new Set<string>()
  let syncedSpend = 0
  for (const ad of ads) {
    const spend = ad.metrics.spend.value ?? 0
    const results = ad.metrics.results.value ?? 0
    syncedSpend += spend
    const conceptIds = new Set(ad.linkedConcepts.map((l) => l.conceptId).filter(Boolean) as string[])
    for (const id of conceptIds) {
      const cur = spendByConcept.get(id) ?? { spend: 0, results: 0, running: false }
      cur.spend += spend
      cur.results += results
      cur.running = cur.running || ad.status === "ACTIVE"
      spendByConcept.set(id, cur)
    }
    if (ad.status === "ACTIVE") for (const l of ad.linkedConcepts) runningAssetIds.add(l.assetId)
  }

  const superseded = new Set(assets.map((a) => a.revises_asset_id).filter(Boolean) as string[])

  let nextCycle: PaidMediaCycle | null = null
  let nextConceptIds: string[] = []
  let nextAssetIds: string[] = []
  if (cycle.next_cycle_id) {
    const [{ data: next }, { data: nc }, { data: na }] = await Promise.all([
      supabase.from("paid_media_cycles").select("*").eq("id", cycle.next_cycle_id).maybeSingle(),
      supabase.from("creative_concept_cycles").select("concept_id").eq("cycle_id", cycle.next_cycle_id),
      supabase.from("creative_asset_cycles").select("asset_id").eq("cycle_id", cycle.next_cycle_id),
    ])
    nextCycle = next as PaidMediaCycle | null
    nextConceptIds = (nc ?? []).map((r) => r.concept_id as string)
    nextAssetIds = (na ?? []).map((r) => r.asset_id as string)
  }

  const { data: otherActive } = await supabase
    .from("paid_media_cycles").select("*").eq("project_id", projectId).eq("is_active", true).neq("id", cycleId).maybeSingle()

  return {
    otherActiveCycle: (otherActive as PaidMediaCycle | null) ?? null,
    cycle: cycle as PaidMediaCycle,
    concepts: concepts.map((c) => ({ concept: c, ...(spendByConcept.get(c.id) ?? { spend: 0, results: 0, running: false }) })),
    assets: assets.filter((a) => !superseded.has(a.id)).map((a) => ({ asset: a, running: runningAssetIds.has(a.id) })),
    syncedSpend,
    nextCycle,
    nextConceptIds,
    nextAssetIds,
  }
}

export interface ConceptDecision {
  conceptId: string
  continues: boolean
  evergreen: boolean
  reason?: string
}

async function applyDecisions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  nextCycleId: string,
  decisions: ConceptDecision[],
  assetIds: string[],
  cycleAssetIds: string[],
) {
  for (const d of decisions) {
    if (d.continues) {
      const { error } = await supabase.from("creative_concepts").update({ status: d.evergreen ? "Evergreen" : "Active" }).eq("id", d.conceptId)
      if (error) throw error
    } else {
      const { data: current } = await supabase.from("creative_concepts").select("insight").eq("id", d.conceptId).single()
      const reason = d.reason?.trim()
      const insight = reason ? [current?.insight, `Terminó al cierre de ciclo: ${reason}`].filter(Boolean).join("\n") : current?.insight ?? null
      const { error } = await supabase.from("creative_concepts").update({ status: "Archived", insight }).eq("id", d.conceptId)
      if (error) throw error
    }
  }

  const continuing = decisions.filter((d) => d.continues).map((d) => d.conceptId)
  const stopping = decisions.filter((d) => !d.continues).map((d) => d.conceptId)
  const droppedAssets = cycleAssetIds.filter((id) => !assetIds.includes(id))

  if (continuing.length) {
    const { error } = await supabase.from("creative_concept_cycles").upsert(
      continuing.map((id) => ({ concept_id: id, cycle_id: nextCycleId, project_id: projectId })),
      { onConflict: "concept_id,cycle_id", ignoreDuplicates: true },
    )
    if (error) throw error
  }
  if (stopping.length) {
    const { error } = await supabase.from("creative_concept_cycles").delete().eq("cycle_id", nextCycleId).in("concept_id", stopping)
    if (error) throw error
  }
  if (assetIds.length) {
    const { error } = await supabase.from("creative_asset_cycles").upsert(
      assetIds.map((id) => ({ asset_id: id, cycle_id: nextCycleId, project_id: projectId })),
      { onConflict: "asset_id,cycle_id", ignoreDuplicates: true },
    )
    if (error) throw error
  }
  if (droppedAssets.length) {
    const { error } = await supabase.from("creative_asset_cycles").delete().eq("cycle_id", nextCycleId).in("asset_id", droppedAssets)
    if (error) throw error
  }
}

export async function completeCycleReview(input: {
  projectId: string
  cycleId: string
  summary: { real_spend: number | null; roas_real: number | null; cpa_real: number | null; real_results: number | null }
  decisions: ConceptDecision[]
  assetIds: string[]
  nextCycle: { start: string; end: string } | null
}): Promise<void> {
  const supabase = await assertAdmin()
  const { projectId, cycleId } = input

  const { data: cycle } = await supabase.from("paid_media_cycles").select("id, next_cycle_id").eq("id", cycleId).eq("project_id", projectId).single()
  if (!cycle) throw new Error("No se encontró el ciclo")
  if (cycle.next_cycle_id) throw new Error("Este ciclo ya tiene su repaso hecho — corrígelo desde el historial.")

  // Caso de datos viejos: ya hay otro ciclo activo (abierto antes de que
  // existiera el repaso). Lo que continúa se traspasa a ese en vez de abrir
  // uno nuevo.
  const { data: otherActive } = await supabase
    .from("paid_media_cycles").select("id").eq("project_id", projectId).eq("is_active", true).neq("id", cycleId).maybeSingle()

  let next: { id: string }
  if (otherActive) {
    next = otherActive
  } else {
    if (!input.nextCycle || !/^\d{4}-\d{2}-\d{2}$/.test(input.nextCycle.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.nextCycle.end)) {
      throw new Error("Fechas del siguiente ciclo inválidas")
    }
    await assertNoCycleOverlap(supabase, projectId, input.nextCycle.start, input.nextCycle.end)
    // Primero se abre el siguiente (si falla, no cambió nada), luego se
    // cierra este apuntando al nuevo. Si algo falla después, lo que
    // continúa se puede corregir desde el historial (editCarryOver).
    const { data: opened, error: openError } = await supabase.from("paid_media_cycles").insert({
      project_id: projectId,
      cycle_month: input.nextCycle.start,
      start_date: input.nextCycle.start,
      end_date: input.nextCycle.end,
      is_active: true,
    }).select("id").single()
    if (openError || !opened) throw openError ?? new Error("No se pudo abrir el siguiente ciclo")
    next = opened
  }

  const { error: closeError } = await supabase.from("paid_media_cycles")
    .update({ ...input.summary, is_active: false, review_pending: false, next_cycle_id: next.id })
    .eq("id", cycleId)
  if (closeError) throw closeError

  const { data: cycleAssets } = await supabase.from("creative_asset_cycles").select("asset_id").eq("cycle_id", cycleId)
  await applyDecisions(supabase, projectId, next.id, input.decisions, input.assetIds, (cycleAssets ?? []).map((r) => r.asset_id as string))
  revalidatePath(`/projects/${projectId}`)
}

// Corregir después: cambia qué continúa en el ciclo siguiente de un ciclo
// ya repasado. Solo toca lo que venía de este ciclo.
export async function editCarryOver(input: {
  projectId: string
  cycleId: string
  decisions: ConceptDecision[]
  assetIds: string[]
}): Promise<void> {
  const supabase = await assertAdmin()
  const { data: cycle } = await supabase.from("paid_media_cycles").select("next_cycle_id").eq("id", input.cycleId).eq("project_id", input.projectId).single()
  if (!cycle?.next_cycle_id) throw new Error("Este ciclo todavía no tiene repaso de cierre.")
  const { data: cycleAssets } = await supabase.from("creative_asset_cycles").select("asset_id").eq("cycle_id", input.cycleId)
  await applyDecisions(supabase, input.projectId, cycle.next_cycle_id, input.decisions, input.assetIds, (cycleAssets ?? []).map((r) => r.asset_id as string))
  revalidatePath(`/projects/${input.projectId}`)
}
