"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { syncMetaAds } from "@/lib/actions/meta"
import type { PaidMediaCycle } from "@/lib/types"

// Reparación de ciclos mal capturados (fechas traslapadas, huecos, ciclos
// duplicados). Todo el cambio corre en una sola función de Postgres
// (apply_cycle_repair, migración 099) para que sea atómico, deje snapshot
// y se pueda deshacer. Aquí solo se arma el estado para la vista previa y
// se re-sincroniza Meta después.

export interface RepairCycleStats {
  concepts: number
  assets: number
  days: number
  spend: number
}

export interface RepairState {
  cycles: PaidMediaCycle[]
  stats: Record<string, RepairCycleStats>
  // Gasto total por día (todas las ads), para calcular qué se mueve.
  dailySpend: Record<string, number>
  cycleStartDay: number | null
  lastRepair: {
    id: string
    reason: string
    created_at: string
    undone_at: string | null
    undoable: boolean
    blockedReason: string | null
  } | null
}

export interface RepairPlan {
  cycles: { id: string | null; start_date: string; end_date: string; is_active: boolean; summary_from: string | null }[]
  merges: { from_id: string; into_id: string }[]
  deletes: string[]
  summary_text: string
}

const stateKey = (c: { id: string; start_date: string; end_date: string; is_active: boolean }) =>
  `${c.id}|${c.start_date}|${c.end_date}|${c.is_active}`

export async function getCycleRepairState(projectId: string): Promise<RepairState> {
  const supabase = await createClient()
  const [{ data: cycles }, { data: cc }, { data: ac }, { data: project }, { data: repair }] = await Promise.all([
    supabase.from("paid_media_cycles").select("*").eq("project_id", projectId).order("start_date"),
    supabase.from("creative_concept_cycles").select("cycle_id").eq("project_id", projectId),
    supabase.from("creative_asset_cycles").select("cycle_id").eq("project_id", projectId),
    supabase.from("projects").select("paid_media_cycle_start_day").eq("id", projectId).maybeSingle(),
    supabase.from("cycle_repairs").select("id, reason, created_at, undone_at, after_state")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])

  // Las métricas diarias pueden ser miles de filas: se paginan.
  const daily: { cycle_id: string | null; date: string; spend: number | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("meta_ad_daily_stats").select("cycle_id, date, spend")
      .eq("project_id", projectId).order("date").range(from, from + 999)
    daily.push(...((data ?? []) as typeof daily))
    if (!data || data.length < 1000) break
  }

  const stats: Record<string, RepairCycleStats> = {}
  const get = (id: string) => (stats[id] ??= { concepts: 0, assets: 0, days: 0, spend: 0 })
  for (const c of cycles ?? []) get(c.id)
  for (const r of cc ?? []) get(r.cycle_id as string).concepts++
  for (const r of ac ?? []) get(r.cycle_id as string).assets++

  const dailySpend: Record<string, number> = {}
  const daysByCycle = new Map<string, Set<string>>()
  for (const r of daily) {
    const spend = Number(r.spend ?? 0)
    dailySpend[r.date] = (dailySpend[r.date] ?? 0) + spend
    if (!r.cycle_id) continue
    get(r.cycle_id).spend += spend
    const set = daysByCycle.get(r.cycle_id) ?? new Set()
    set.add(r.date)
    daysByCycle.set(r.cycle_id, set)
  }
  for (const [id, set] of daysByCycle) get(id).days = set.size

  let lastRepair: RepairState["lastRepair"] = null
  if (repair) {
    let blockedReason: string | null = null
    if (repair.undone_at) blockedReason = "Ya se deshizo."
    else {
      const now = (cycles ?? []).map(stateKey).sort().join(",")
      const after = ((repair.after_state ?? []) as PaidMediaCycle[]).map(stateKey).sort().join(",")
      if (now !== after) blockedReason = "Los ciclos cambiaron después de la reparación (se abrió, cerró o editó un ciclo)."
    }
    lastRepair = {
      id: repair.id, reason: repair.reason, created_at: repair.created_at, undone_at: repair.undone_at,
      undoable: !blockedReason, blockedReason,
    }
  }

  return {
    cycles: (cycles ?? []) as PaidMediaCycle[],
    stats,
    dailySpend,
    cycleStartDay: project?.paid_media_cycle_start_day ?? null,
    lastRepair,
  }
}

export async function applyCycleRepair(projectId: string, plan: RepairPlan, reason: string): Promise<{ syncErrors: string[] }> {
  const supabase = await createClient()
  const { data: before } = await supabase.from("paid_media_cycles").select("id, start_date, end_date, is_active").eq("project_id", projectId)
  const beforeKeys = new Set((before ?? []).map(stateKey))

  const { error } = await supabase.rpc("apply_cycle_repair", { p_project: projectId, p_plan: plan, p_reason: reason })
  if (error) throw new Error(error.message)

  // Ciclos nuevos o con fechas distintas: se re-sincronizan con Meta para
  // que su alcance (deduplicado por rango) y sus métricas queden bien. Si
  // falla, la reparación ya quedó — solo se avisa.
  const { data: after } = await supabase.from("paid_media_cycles").select("id, start_date, end_date, is_active").eq("project_id", projectId)
  const changed = (after ?? []).filter((c) => !beforeKeys.has(stateKey(c)))
  const syncErrors: string[] = []
  const [{ data: integration }, { data: context }] = await Promise.all([
    supabase.from("project_integrations").select("account_id").eq("project_id", projectId).eq("platform", "meta").maybeSingle(),
    supabase.from("paid_media_context").select("synced_campaign_ids").eq("project_id", projectId).maybeSingle(),
  ])
  if (integration?.account_id) {
    const campaignIds = (context?.synced_campaign_ids as string[] | null) ?? undefined
    for (const c of changed) {
      try {
        const r = await syncMetaAds(projectId, c.id, campaignIds?.length ? campaignIds : undefined)
        if (r.error) syncErrors.push(`${c.start_date}: ${r.error}`)
      } catch (err) {
        syncErrors.push(`${c.start_date}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  revalidatePath(`/projects/${projectId}`)
  return { syncErrors }
}

export async function undoCycleRepair(projectId: string, repairId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("undo_cycle_repair", { p_repair: repairId })
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}
