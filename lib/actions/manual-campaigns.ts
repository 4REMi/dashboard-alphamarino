"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { totalsForRange, isoToday, isoAddDays, STALE_DAYS, type ManualSnapshot, type ManualTotals } from "@/lib/utils/manual-campaign-calc"

// Campañas manuales (TikTok, Pinterest… sin integración). Viven en el
// proyecto, no en un ciclo: aparecen en cada ciclo que se traslapa con
// sus fechas, y lo del ciclo se calcula de las capturas acumuladas.
// Internas — el portal del cliente no las muestra.

export type ManualCampaignStatus = "active" | "paused" | "ended"

export interface ManualCampaign {
  id: string
  project_id: string
  channel: string
  name: string
  status: ManualCampaignStatus
  result_type: string | null
  start_date: string
  end_date: string | null
  assetIds: string[]
  snapshots: ManualSnapshot[]
  // Lo del ciclo pedido (null si no hay capturas en él).
  cycleTotals: ManualTotals | null
  cycleAsOf: string | null
  lastSnapshotDate: string | null
  // Activa y sin captura en los últimos STALE_DAYS días.
  stale: boolean
}

async function user() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, userId: user.id }
}

export async function getManualCampaigns(projectId: string, cycleId: string | null): Promise<ManualCampaign[]> {
  const supabase = await createClient()
  let cycle: { start_date: string; end_date: string } | null = null
  if (cycleId) {
    const { data } = await supabase.from("paid_media_cycles").select("start_date, end_date").eq("id", cycleId).maybeSingle()
    cycle = data
  }
  let q = supabase.from("manual_campaigns")
    .select("*, assets:manual_campaign_assets(asset_id), snapshots:manual_campaign_snapshots(id, as_of, spend, impressions, clicks, results)")
    .eq("project_id", projectId)
    .order("created_at")
  if (cycle) q = q.lte("start_date", cycle.end_date).or(`end_date.is.null,end_date.gte.${cycle.start_date}`)
  const { data, error } = await q
  // Sin la migración 101 todavía: simplemente no hay campañas manuales.
  if (error) return []

  const staleBefore = isoAddDays(isoToday(), -STALE_DAYS)
  return (data ?? []).map((c) => {
    const snapshots = ((c.snapshots ?? []) as ManualSnapshot[]).map((s) => ({
      ...s, spend: Number(s.spend), results: s.results === null ? null : Number(s.results),
      impressions: s.impressions === null ? null : Number(s.impressions), clicks: s.clicks === null ? null : Number(s.clicks),
    })).sort((a, b) => (a.as_of < b.as_of ? 1 : -1))
    const { totals, asOf } = totalsForRange(snapshots, cycle?.start_date ?? null, cycle?.end_date ?? null)
    const lastSnapshotDate = snapshots[0]?.as_of ?? null
    return {
      id: c.id, project_id: c.project_id, channel: c.channel, name: c.name, status: c.status,
      result_type: c.result_type, start_date: c.start_date, end_date: c.end_date,
      assetIds: ((c.assets ?? []) as { asset_id: string }[]).map((a) => a.asset_id),
      snapshots,
      cycleTotals: totals,
      cycleAsOf: asOf,
      lastSnapshotDate,
      stale: c.status === "active" && (!lastSnapshotDate || lastSnapshotDate < staleBefore),
    }
  })
}

export interface ManualCampaignInput {
  channel: string
  name: string
  status: ManualCampaignStatus
  result_type: string | null
  start_date: string
  end_date: string | null
}

function clean(input: ManualCampaignInput): ManualCampaignInput {
  if (!input.channel.trim() || !input.name.trim()) throw new Error("Canal y nombre son obligatorios")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) throw new Error("Fecha de inicio inválida")
  if (input.end_date && input.end_date < input.start_date) throw new Error("La fecha de fin es anterior al inicio")
  return {
    ...input, channel: input.channel.trim(), name: input.name.trim(), result_type: input.result_type?.trim() || null,
    end_date: input.status === "ended" ? (input.end_date || isoToday()) : input.end_date || null,
  }
}

export async function createManualCampaign(projectId: string, input: ManualCampaignInput, assetIds: string[]): Promise<string> {
  const { supabase, userId } = await user()
  const { data, error } = await supabase.from("manual_campaigns").insert({ ...clean(input), project_id: projectId, created_by: userId }).select("id").single()
  if (error) throw new Error(error.message)
  if (assetIds.length) {
    const { error: e } = await supabase.from("manual_campaign_assets").insert(assetIds.map((id) => ({ campaign_id: data.id, asset_id: id })))
    if (e) throw new Error(e.message)
  }
  revalidatePath(`/projects/${projectId}`)
  return data.id
}

export async function updateManualCampaign(projectId: string, id: string, input: ManualCampaignInput, assetIds?: string[]): Promise<void> {
  const { supabase } = await user()
  const { error } = await supabase.from("manual_campaigns").update(clean(input)).eq("id", id).eq("project_id", projectId)
  if (error) throw new Error(error.message)
  if (assetIds) {
    await supabase.from("manual_campaign_assets").delete().eq("campaign_id", id)
    if (assetIds.length) {
      const { error: e } = await supabase.from("manual_campaign_assets").insert(assetIds.map((a) => ({ campaign_id: id, asset_id: a })))
      if (e) throw new Error(e.message)
    }
  }
  revalidatePath(`/projects/${projectId}`)
}

// Terminar sin editar todo el formulario (ej. desde el repaso de cierre).
export async function endManualCampaign(projectId: string, id: string, endDate: string): Promise<void> {
  const { supabase } = await user()
  const { error } = await supabase.from("manual_campaigns").update({ status: "ended", end_date: endDate }).eq("id", id).eq("project_id", projectId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteManualCampaign(projectId: string, id: string): Promise<void> {
  const { supabase } = await user()
  const { error } = await supabase.from("manual_campaigns").delete().eq("id", id).eq("project_id", projectId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

// Una captura por día: si ya hay una de esa fecha, se reemplaza.
export async function saveManualSnapshot(projectId: string, campaignId: string, snap: {
  as_of: string; spend: number; impressions: number | null; clicks: number | null; results: number | null
}): Promise<void> {
  const { supabase, userId } = await user()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snap.as_of)) throw new Error("Fecha inválida")
  if (!(snap.spend >= 0)) throw new Error("La inversión es obligatoria")
  const { error } = await supabase.from("manual_campaign_snapshots")
    .upsert({ ...snap, campaign_id: campaignId, created_by: userId }, { onConflict: "campaign_id,as_of" })
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteManualSnapshot(projectId: string, snapshotId: string): Promise<void> {
  const { supabase } = await user()
  const { error } = await supabase.from("manual_campaign_snapshots").delete().eq("id", snapshotId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}
