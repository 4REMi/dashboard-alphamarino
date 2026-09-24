"use server"

import { createClient } from "@/lib/supabase/server"
import { getCreativeConcepts, getCreativeAssets } from "@/lib/actions/creatives"
import { getCreativePerformance, type AdPerformanceCard } from "@/lib/actions/paid-media-performance"
import { mergeDailyStatsByDate, computeMetricsForAd, type MetricPoint } from "@/lib/utils/paid-media-calc"
import { METRIC_DEFS, type MetricKey } from "@/lib/constants/paid-media-metrics"
import type { TrendWindow } from "@/lib/types"

// Mapa de nodos concepto → asset → campaña, generado 100% a partir de
// datos que ya existen (sin tabla ni migración nueva) — de solo lectura,
// para visualizar la relación many-to-many que una tabla esconde: un
// mismo asset puede correr en varias campañas, y una campaña puede
// alimentarse de varios conceptos a la vez. La campaña es el nodo (no el
// ad individual) porque es la dimensión transversal real — dos assets de
// conceptos distintos que comparten campaña deben convergir en el MISMO
// bloque, no en dos tarjetas sueltas sin ninguna conexión visual entre
// ellas.
export interface RelationshipConceptNode {
  id: string
  name: string | null
  angleType: string | null
  targetPersona: string | null
  funnelStage: string | null
  status: string
}

export interface RelationshipAssetNode {
  id: string
  conceptId: string | null
  thumbUrl: string | null
  fileType: string | null
  format: string | null
  platform: string | null
}

export interface RelationshipCampaignNode {
  campaignId: string
  campaignName: string | null
  // Agregado — nunca resumido, todas las métricas con dato (el bloque
  // colapsado ya es lo que se ve por default).
  aggregate: Record<MetricKey, MetricPoint>
  ads: AdPerformanceCard[]
}

export interface RelationshipMapData {
  concepts: RelationshipConceptNode[]
  assets: RelationshipAssetNode[]
  campaigns: RelationshipCampaignNode[]
  // asset → campaña (deduplicado — si un asset tiene 2 ads en la misma
  // campaña, es una sola línea, no dos).
  assetCampaignEdges: { assetId: string; campaignId: string }[]
}

function assetThumbUrl(a: { thumbnail_path: string | null; file_path: string | null; asset_url: string | null }): string | null {
  if (a.thumbnail_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.thumbnail_path}`
  if (a.file_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.file_path}`
  return a.asset_url
}

export async function getRelationshipMap(projectId: string, cycleId: string | null): Promise<RelationshipMapData> {
  const supabase = await createClient()

  const [concepts, assets, ads, contextRes] = await Promise.all([
    getCreativeConcepts(projectId, cycleId),
    getCreativeAssets(projectId, cycleId),
    cycleId ? getCreativePerformance(projectId, cycleId) : Promise.resolve([] as AdPerformanceCard[]),
    supabase.from("paid_media_context").select("trend_window, campaign_trend_overrides").eq("project_id", projectId).maybeSingle(),
  ])

  const defaultWindow: TrendWindow = (contextRes.data?.trend_window as TrendWindow) ?? "previous_day"
  const campaignOverrides = (contextRes.data?.campaign_trend_overrides ?? {}) as Record<string, TrendWindow>

  const assetIds = new Set(assets.map((a) => a.id))
  // asset → ad, resuelto desde el mismo link que ya trae cada ad
  // (ad.linkedConcepts[].assetId) — solo ads trazables a un asset de
  // este ciclo entran al mapa; un ad huérfano es cosa del grid de
  // Creativos, no de esta vista relacional.
  const assetAdPairs = ads.flatMap((ad) =>
    ad.linkedConcepts.filter((l) => assetIds.has(l.assetId)).map((l) => ({ assetId: l.assetId, adId: ad.ad_id }))
  )
  const linkedAdIds = new Set(assetAdPairs.map((p) => p.adId))
  const relevantAds = ads.filter((ad) => linkedAdIds.has(ad.ad_id))

  // Agrupar por campaña — el bloque visual real.
  const adsByCampaign = new Map<string, AdPerformanceCard[]>()
  for (const ad of relevantAds) {
    const key = ad.campaign_id ?? `sin-campaña-${ad.ad_id}` // un ad sin campaign_id (raro) no se fusiona con nada
    if (!adsByCampaign.has(key)) adsByCampaign.set(key, [])
    adsByCampaign.get(key)!.push(ad)
  }

  const campaigns: RelationshipCampaignNode[] = Array.from(adsByCampaign.entries()).map(([campaignId, campaignAds]) => {
    const window = campaignOverrides[campaignId] || defaultWindow
    const merged = mergeDailyStatsByDate(campaignAds.flatMap((ad) => ad.dailyRows))
    return {
      campaignId,
      campaignName: campaignAds[0].campaign_name,
      aggregate: computeMetricsForAd(merged, window),
      ads: campaignAds,
    }
  })

  const adIdToCampaignId = new Map(relevantAds.map((ad) => [ad.ad_id, ad.campaign_id ?? `sin-campaña-${ad.ad_id}`]))
  const assetCampaignEdges = Array.from(
    new Set(assetAdPairs.map((p) => `${p.assetId}::${adIdToCampaignId.get(p.adId)}`))
  ).map((key) => {
    const [assetId, campaignId] = key.split("::")
    return { assetId, campaignId }
  })

  return {
    concepts: concepts.map((c) => ({
      id: c.id,
      name: c.name,
      angleType: c.angle_type,
      targetPersona: c.target_persona,
      funnelStage: c.funnel_stage,
      status: c.status,
    })),
    assets: assets.map((a) => ({
      id: a.id,
      conceptId: a.concept_id,
      thumbUrl: assetThumbUrl(a),
      fileType: a.file_type,
      format: a.format,
      platform: a.platform,
    })),
    campaigns,
    assetCampaignEdges,
  }
}
