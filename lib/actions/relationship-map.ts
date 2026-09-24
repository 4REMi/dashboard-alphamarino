"use server"

import { getCreativeConcepts, getCreativeAssets } from "@/lib/actions/creatives"
import { getCreativePerformance, type AdPerformanceCard } from "@/lib/actions/paid-media-performance"

// Mapa de nodos concepto → asset → ad, generado 100% a partir de datos
// que ya existen (sin tabla ni migración nueva) — de solo lectura, para
// visualizar la relación many-to-many que una tabla esconde: un mismo
// asset puede correr en varias campañas, y viceversa.
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

export interface RelationshipMapData {
  concepts: RelationshipConceptNode[]
  assets: RelationshipAssetNode[]
  ads: AdPerformanceCard[]
  // asset → ad — el mismo link de creative_asset_meta_ads, ya resuelto
  // dentro de getCreativePerformance (ad.linkedConcepts[].assetId).
  assetAdEdges: { assetId: string; adId: string }[]
}

function assetThumbUrl(a: { thumbnail_path: string | null; file_path: string | null; asset_url: string | null }): string | null {
  if (a.thumbnail_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.thumbnail_path}`
  if (a.file_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.file_path}`
  return a.asset_url
}

export async function getRelationshipMap(projectId: string, cycleId: string | null): Promise<RelationshipMapData> {
  const [concepts, assets, ads] = await Promise.all([
    getCreativeConcepts(projectId, cycleId),
    getCreativeAssets(projectId, cycleId),
    cycleId ? getCreativePerformance(projectId, cycleId) : Promise.resolve([] as AdPerformanceCard[]),
  ])

  const assetIds = new Set(assets.map((a) => a.id))
  const assetAdEdges = ads.flatMap((ad) =>
    ad.linkedConcepts
      .filter((l) => assetIds.has(l.assetId))
      .map((l) => ({ assetId: l.assetId, adId: ad.ad_id }))
  )
  // Solo ads que de verdad se pueden trazar hacia un asset de este ciclo —
  // un ad huérfano (nunca vinculado) es cosa del grid de Creativos, no de
  // este mapa relacional.
  const linkedAdIds = new Set(assetAdEdges.map((e) => e.adId))
  const relevantAds = ads.filter((ad) => linkedAdIds.has(ad.ad_id))

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
    ads: relevantAds,
    assetAdEdges,
  }
}
