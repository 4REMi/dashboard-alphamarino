"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { MetaAd, MetaAdDailyStat, TrendWindow } from "@/lib/types"
import type { MetricKey } from "@/lib/constants/paid-media-metrics"

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

export interface AssetMetaLinkStatus {
  anyActive: boolean
  totalSpend: number
  totalResults: number
  ads: { adId: string; status: string | null; campaignName: string | null }[]
}

// Vista inversa del link — desde el Creative Tracker, "¿este asset (o
// alguna de sus revisiones) está corriendo de verdad en Meta, y cuánto
// lleva gastado este ciclo?" No todo asset tiene por qué estar corriendo
// — la mayoría son candidatos para revisión del cliente que nunca se
// lanzan, así que esto solo marca los que SÍ tienen un link real.
export async function getAssetMetaLinkStatus(projectId: string, cycleId: string | null): Promise<Record<string, AssetMetaLinkStatus>> {
  const supabase = await createClient()

  const { data: links } = await supabase
    .from("creative_asset_meta_ads")
    .select("id, creative_asset_id, meta_ad_id")
    .eq("project_id", projectId)
  if (!links?.length) return {}

  const adIds = Array.from(new Set(links.map((l) => l.meta_ad_id)))
  const [adsRes, statsRes] = await Promise.all([
    supabase.from("meta_ads").select("ad_id, status, campaign_name").eq("project_id", projectId).in("ad_id", adIds),
    cycleId
      ? supabase.from("meta_ad_daily_stats").select("ad_id, spend, results").eq("project_id", projectId).eq("cycle_id", cycleId).in("ad_id", adIds)
      : Promise.resolve({ data: [] as { ad_id: string; spend: number | null; results: number | null }[] }),
  ])

  const adInfoById = new Map((adsRes.data ?? []).map((a) => [a.ad_id, a]))
  const totalsByAdId = new Map<string, { spend: number; results: number }>()
  for (const s of statsRes.data ?? []) {
    const cur = totalsByAdId.get(s.ad_id) ?? { spend: 0, results: 0 }
    cur.spend += s.spend ?? 0
    cur.results += s.results ?? 0
    totalsByAdId.set(s.ad_id, cur)
  }

  const result: Record<string, AssetMetaLinkStatus> = {}
  for (const l of links) {
    const adInfo = adInfoById.get(l.meta_ad_id)
    const totals = totalsByAdId.get(l.meta_ad_id) ?? { spend: 0, results: 0 }
    const entry = result[l.creative_asset_id] ?? { anyActive: false, totalSpend: 0, totalResults: 0, ads: [] }
    entry.anyActive = entry.anyActive || adInfo?.status === "ACTIVE"
    entry.totalSpend += totals.spend
    entry.totalResults += totals.results
    entry.ads.push({ adId: l.meta_ad_id, status: adInfo?.status ?? null, campaignName: adInfo?.campaign_name ?? null })
    result[l.creative_asset_id] = entry
  }
  return result
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
// Los cálculos puros (sumDays/deriveMetric/computeMetricsForAd/
// mergeDailyStatsByDate) viven en lib/utils/paid-media-calc.ts — un
// archivo "use server" solo puede exportar funciones async, así que ni
// esto ni relationship-map.ts los importan de aquí, sino directo de ahí.
import { computeMetricsForAd, type MetricPoint } from "@/lib/utils/paid-media-calc"

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
  // Filas diarias crudas de este ad — expuestas para poder re-agregar
  // correctamente a nivel campaña (ver mergeDailyStatsByDate más abajo).
  // Promediar métricas YA derivadas de varios ads sería matemáticamente
  // incorrecto (ej. un CTR combinado no es el promedio de dos CTR sin
  // pesar por impresiones) — por eso se necesita el dato crudo, no solo
  // el valor final que ve la tarjeta.
  dailyRows: MetaAdDailyStat[]
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
        dailyRows: statsByAd.get(ad.ad_id)!,
      }
    })
    .sort((a, b) => (b.metrics.spend.value ?? 0) - (a.metrics.spend.value ?? 0))
}
