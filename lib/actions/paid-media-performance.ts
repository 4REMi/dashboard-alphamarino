"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { MetaAd, MetaAdDailyStat, TrendWindow } from "@/lib/types"
import { METRIC_DEFS, type MetricKey } from "@/lib/constants/paid-media-metrics"

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

// Lista liviana de assets del proyecto para el picker "Vincular a
// concepto" de cada tarjeta — solo lo que se necesita mostrar en ese modal
// chico, no el objeto CreativeAsset completo.
export async function getProjectAssetsForLinking(projectId: string): Promise<{
  id: string; concept_name: string | null; target_persona: string | null
  thumb_url: string | null; file_type: string | null
}[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_assets")
    .select("id, asset_url, file_path, thumbnail_path, file_type, concept:creative_concepts(name, target_persona)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) return []
  return (data ?? []).map((a) => {
    const concept = a.concept as unknown as { name: string | null; target_persona: string | null } | null
    const thumb = a.thumbnail_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.thumbnail_path}`
      : a.asset_url
    return {
      id: a.id,
      concept_name: concept?.name ?? null,
      target_persona: concept?.target_persona ?? null,
      thumb_url: thumb ?? null,
      file_type: a.file_type,
    }
  })
}

// ── Vincular un creative_asset (con su concept_id, y por lo tanto su
// persona/ángulo) a un ad real de Meta — nunca bloqueante, se hace desde
// la propia tarjeta del creativo cuando alguien lo decida. ────────────
export async function linkAssetToMetaAd(projectId: string, creativeAssetId: string, metaAdId: string): Promise<void> {
  const { supabase, user } = await assertAuth()
  const { error } = await supabase.from("creative_asset_meta_ads").insert({
    project_id: projectId,
    creative_asset_id: creativeAssetId,
    meta_ad_id: metaAdId,
    linked_by: user.id,
  })
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function unlinkAssetFromMetaAd(projectId: string, linkId: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("creative_asset_meta_ads").delete().eq("id", linkId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ── Agregación para el grid creative-first ──────────────────────────────

interface DayTotals {
  spend: number
  impressions: number
  clicks: number
  results: number
  purchase_value: number
}

function sumDays(stats: MetaAdDailyStat[]): DayTotals {
  return stats.reduce((acc, s) => ({
    spend:          acc.spend + (s.spend ?? 0),
    impressions:    acc.impressions + (s.impressions ?? 0),
    clicks:         acc.clicks + (s.clicks ?? 0),
    results:        acc.results + (s.results ?? 0),
    purchase_value: acc.purchase_value + (s.purchase_value ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, results: 0, purchase_value: 0 })
}

function deriveMetric(key: MetricKey, t: DayTotals): number | null {
  switch (key) {
    case "spend":    return t.spend || null
    case "results":  return t.results || null
    case "ctr":      return t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null
    case "cpc":      return t.clicks > 0 ? t.spend / t.clicks : null
    case "cpm":      return t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null
    case "cost_per_result": return t.results > 0 ? t.spend / t.results : null
    case "roas":     return t.spend > 0 ? t.purchase_value / t.spend : null
  }
}

function pctChange(latest: number | null, compare: number | null): number | null {
  if (latest === null || compare === null || compare === 0) return null
  return ((latest - compare) / Math.abs(compare)) * 100
}

export interface MetricPoint {
  value: number | null
  trendPct: number | null
  higherIsBetter: boolean
}

export interface AdPerformanceCard {
  ad_id: string
  ad_name: string | null
  ad_set_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  status: string | null
  thumbnail_url: string | null
  image_url: string | null
  video_url: string | null
  metrics: Record<MetricKey, MetricPoint>
  linkedConcepts: { linkId: string; assetId: string; conceptId: string | null; conceptName: string | null; targetPersona: string | null }[]
}

// Calcula la tendencia de un ad según la ventana elegida (por proyecto, o
// el override puntual de esta campaña) — comparando valores DIARIOS
// (nunca acumulados), para que el % refleje un movimiento real y no solo
// "lleva más días corriendo".
function computeMetricsForAd(dailyRows: MetaAdDailyStat[], window: TrendWindow): Record<MetricKey, MetricPoint> {
  const sorted = [...dailyRows].sort((a, b) => a.date < b.date ? -1 : 1)
  const cycleTotals = sumDays(sorted)
  const lastDay = sorted[sorted.length - 1]
  const lastDayTotals = lastDay ? sumDays([lastDay]) : null

  let compareTotals: DayTotals | null = null
  if (lastDayTotals) {
    if (window === "previous_day") {
      const prevDay = sorted[sorted.length - 2]
      compareTotals = prevDay ? sumDays([prevDay]) : null
    } else if (window === "baseline") {
      const firstDay = sorted[0]
      compareTotals = (firstDay && firstDay !== lastDay) ? sumDays([firstDay]) : null
    } else {
      // cycle_avg — promedio de los demás días (sin contar el último)
      const otherDays = sorted.slice(0, -1)
      if (otherDays.length > 0) {
        const t = sumDays(otherDays)
        compareTotals = {
          spend: t.spend / otherDays.length,
          impressions: t.impressions / otherDays.length,
          clicks: t.clicks / otherDays.length,
          results: t.results / otherDays.length,
          purchase_value: t.purchase_value / otherDays.length,
        }
      }
    }
  }

  const result = {} as Record<MetricKey, MetricPoint>
  for (const key of Object.keys(METRIC_DEFS) as MetricKey[]) {
    const value = deriveMetric(key, cycleTotals)
    const latestDayValue = lastDayTotals ? deriveMetric(key, lastDayTotals) : null
    const compareValue = compareTotals ? deriveMetric(key, compareTotals) : null
    result[key] = { value, trendPct: pctChange(latestDayValue, compareValue), higherIsBetter: METRIC_DEFS[key].higherIsBetter }
  }
  return result
}

// Resuelve todo internamente (ads + stats del ciclo + preferencias de la
// cuenta) — un solo call desde el server component o desde el cliente al
// sincronizar, sin que cada caller tenga que orquestar 3 fetches.
export async function getCreativePerformance(projectId: string, cycleId: string): Promise<AdPerformanceCard[]> {
  const supabase = await createClient()

  const [adsRes, statsRes, contextRes] = await Promise.all([
    supabase.from("meta_ads").select("*").eq("project_id", projectId),
    supabase.from("meta_ad_daily_stats").select("*").eq("project_id", projectId).eq("cycle_id", cycleId).order("date", { ascending: true }),
    supabase.from("paid_media_context").select("trend_window, campaign_trend_overrides").eq("project_id", projectId).maybeSingle(),
  ])

  const ads: MetaAd[] = adsRes.data ?? []
  const dailyStats: MetaAdDailyStat[] = statsRes.data ?? []
  const defaultWindow: TrendWindow = (contextRes.data?.trend_window as TrendWindow) ?? "previous_day"
  const campaignOverrides = (contextRes.data?.campaign_trend_overrides ?? {}) as Record<string, TrendWindow>

  const statsByAd = new Map<string, MetaAdDailyStat[]>()
  for (const s of dailyStats) {
    if (!statsByAd.has(s.ad_id)) statsByAd.set(s.ad_id, [])
    statsByAd.get(s.ad_id)!.push(s)
  }

  const adIdsWithData = ads.filter((a) => statsByAd.has(a.ad_id))
  if (adIdsWithData.length === 0) return []

  const { data: links } = await supabase
    .from("creative_asset_meta_ads")
    .select("id, meta_ad_id, creative_asset:creative_assets(id, concept_id, concept:creative_concepts(id, name, target_persona))")
    .eq("project_id", projectId)
    .in("meta_ad_id", adIdsWithData.map((a) => a.ad_id))

  const linksByAdId = new Map<string, AdPerformanceCard["linkedConcepts"]>()
  for (const l of links ?? []) {
    const asset = l.creative_asset as unknown as { id: string; concept_id: string | null; concept: { id: string; name: string | null; target_persona: string | null } | null } | null
    if (!asset) continue
    if (!linksByAdId.has(l.meta_ad_id)) linksByAdId.set(l.meta_ad_id, [])
    linksByAdId.get(l.meta_ad_id)!.push({
      linkId: l.id,
      assetId: asset.id,
      conceptId: asset.concept_id,
      conceptName: asset.concept?.name ?? null,
      targetPersona: asset.concept?.target_persona ?? null,
    })
  }

  return adIdsWithData
    .map((ad): AdPerformanceCard => {
      const window = (ad.campaign_id && campaignOverrides[ad.campaign_id]) || defaultWindow
      return {
        ad_id: ad.ad_id,
        ad_name: ad.ad_name,
        ad_set_name: ad.ad_set_name,
        campaign_id: ad.campaign_id,
        campaign_name: ad.campaign_name,
        status: ad.status,
        thumbnail_url: ad.thumbnail_url,
        image_url: ad.image_url,
        video_url: ad.video_url,
        metrics: computeMetricsForAd(statsByAd.get(ad.ad_id)!, window),
        linkedConcepts: linksByAdId.get(ad.ad_id) ?? [],
      }
    })
    .sort((a, b) => (b.metrics.spend.value ?? 0) - (a.metrics.spend.value ?? 0))
}
