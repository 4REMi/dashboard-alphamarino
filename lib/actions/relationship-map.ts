"use server"

import { getManualCampaigns, type ManualCampaign } from "@/lib/actions/manual-campaigns"
import { createClient } from "@/lib/supabase/server"
import { getCreativeConcepts, getCreativeAssets } from "@/lib/actions/creatives"
import { getCreativePerformance, type AdPerformanceCard } from "@/lib/actions/paid-media-performance"
import { mergeDailyStatsByDate, computeMetricsForAd, withMetaReach, resultsTypeOf, metricsFromLifetime, type MetricPoint, type LifetimeTotals } from "@/lib/utils/paid-media-calc"
import { METRIC_DEFS, type MetricKey } from "@/lib/constants/paid-media-metrics"
import type { TrendWindow, CreativeConcept } from "@/lib/types"

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
  brandLine: { id: string; name: string; color: string } | null
  // Concepto completo — para el botón "Ver concepto" (mecanismo, ángulo,
  // etc.) sin tener que ir enumerando campo por campo cada vez que se
  // agregue uno nuevo al detalle.
  full: CreativeConcept
}

export interface RelationshipAssetNode {
  id: string
  conceptId: string | null
  thumbUrl: string | null
  // Archivo real (no la miniatura) — el que se reproduce/agranda, igual
  // que en Ad Lab: video con controles, imagen a tamaño completo.
  fileUrl: string | null
  fileType: string | null
  format: string | null
  platform: string | null
  clientVisible: boolean
  clientStatus: string | null
}

export interface RelationshipCampaignNode {
  campaignId: string
  campaignName: string | null
  // Agregado — nunca resumido, todas las métricas con dato (el bloque
  // colapsado ya es lo que se ve por default).
  aggregate: Record<MetricKey, MetricPoint>
  ads: AdPerformanceCard[]
  // Ventana de tendencia que se usó para calcular `aggregate` — el
  // override de la campaña si existe, si no el default de la cuenta. Se
  // expone para que el mapa pueda mostrar/editar el override sin tener
  // que resolverlo de nuevo del lado del cliente.
  trendWindow: TrendWindow
  hasOverride: boolean
  // Totales "Máximo" (toda la vida, como Ads Manager) de la campaña y de
  // cada uno de sus ads — null si todavía no se ha sincronizado con esto.
  lifetime: Record<MetricKey, MetricPoint> | null
  adLifetime: Record<string, Record<MetricKey, MetricPoint> | null>
}

export interface RelationshipMapData {
  concepts: RelationshipConceptNode[]
  assets: RelationshipAssetNode[]
  campaigns: RelationshipCampaignNode[]
  // asset → campaña (deduplicado — si un asset tiene 2 ads en la misma
  // campaña, es una sola línea, no dos).
  assetCampaignEdges: { assetId: string; campaignId: string }[]
  // Mismas métricas elegidas en Contexto de Cuenta — el mapa las respeta
  // igual que el grid, en vez de mostrar todas.
  displayMetrics: MetricKey[]
  // Para que "vs. inicio del ciclo" diga la fecha real de inicio.
  cycleStartDate: string | null
  // Moneda de la cuenta publicitaria (USD, MXN...) — todos los montos
  // vienen en ella.
  currency: string | null
  // Campañas manuales (TikTok, Pinterest… sin integración) del ciclo.
  manualCampaigns: ManualCampaign[]
}

function assetThumbUrl(a: { thumbnail_path: string | null; file_path: string | null; asset_url: string | null }): string | null {
  if (a.thumbnail_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.thumbnail_path}`
  if (a.file_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.file_path}`
  return a.asset_url
}

function assetFileUrl(a: { file_path: string | null; asset_url: string | null }): string | null {
  if (a.file_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.file_path}`
  return a.asset_url
}

export interface RelationshipMapPosition { nodeId: string; x: number; y: number }

// Recuerda dónde arrastró el usuario cada nodo la última vez, por
// proyecto + ciclo (los node_id no son comparables entre ciclos distintos
// — cada ciclo tiene su propio set de campañas/assets). Solo se guardan
// las posiciones que el usuario tocó; el resto sigue viniendo del layout
// calculado en buildGraph.
export async function getRelationshipMapPositions(projectId: string, cycleId: string | null): Promise<RelationshipMapPosition[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("relationship_map_positions")
    .select("node_id, x, y")
    .eq("project_id", projectId)
    .eq("cycle_id", cycleId ?? "none")
  return (data ?? []).map((p) => ({ nodeId: p.node_id, x: p.x, y: p.y }))
}

export async function saveRelationshipMapPosition(projectId: string, cycleId: string | null, nodeId: string, x: number, y: number): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("relationship_map_positions")
    .upsert({ project_id: projectId, cycle_id: cycleId ?? "none", node_id: nodeId, x, y, updated_at: new Date().toISOString() }, { onConflict: "project_id,cycle_id,node_id" })
  if (error) throw error
}

export interface RelationshipMapNote { id: string; x: number; y: number; text: string }

// Anotaciones sueltas del mapa — mismo espíritu que los Sticky Note de
// Ad Nodes, pero acá no ejecutan nada, solo dejan una nota visual (ej.
// "estas 3 campañas son remanentes del ciclo pasado"). CRUD completo,
// a diferencia de las posiciones de nodos generados (que solo se mueven,
// nunca se crean/borran desde aquí).
export async function getRelationshipMapNotes(projectId: string, cycleId: string | null): Promise<RelationshipMapNote[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("relationship_map_notes")
    .select("id, x, y, text")
    .eq("project_id", projectId)
    .eq("cycle_id", cycleId ?? "none")
  return data ?? []
}

export async function createRelationshipMapNote(projectId: string, cycleId: string | null, x: number, y: number): Promise<RelationshipMapNote> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from("relationship_map_notes")
    .insert({ project_id: projectId, cycle_id: cycleId ?? "none", x, y, text: "", created_by: user?.id ?? null })
    .select("id, x, y, text")
    .single()
  if (error) throw error
  return data
}

export async function updateRelationshipMapNoteText(noteId: string, text: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from("relationship_map_notes").update({ text, updated_at: new Date().toISOString() }).eq("id", noteId)
  if (error) throw error
}

export async function updateRelationshipMapNotePosition(noteId: string, x: number, y: number): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from("relationship_map_notes").update({ x, y, updated_at: new Date().toISOString() }).eq("id", noteId)
  if (error) throw error
}

export async function deleteRelationshipMapNote(noteId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from("relationship_map_notes").delete().eq("id", noteId)
  if (error) throw error
}

export async function getRelationshipMap(projectId: string, cycleId: string | null): Promise<RelationshipMapData> {
  const supabase = await createClient()

  const [concepts, assets, ads, contextRes, reachRes, cycleRes, lifetimeRes, integrationRes, manualCampaigns] = await Promise.all([
    getCreativeConcepts(projectId, cycleId),
    getCreativeAssets(projectId, cycleId),
    cycleId ? getCreativePerformance(projectId, cycleId) : Promise.resolve([] as AdPerformanceCard[]),
    supabase.from("paid_media_context").select("trend_window, campaign_trend_overrides, display_metrics").eq("project_id", projectId).maybeSingle(),
    supabase.from("meta_cycle_reach").select("object_id, reach, frequency").eq("project_id", projectId).eq("cycle_id", cycleId ?? "").eq("level", "campaign"),
    cycleId ? supabase.from("paid_media_cycles").select("start_date").eq("id", cycleId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("meta_lifetime_stats").select("*").eq("project_id", projectId),
    supabase.from("project_integrations").select("currency").eq("project_id", projectId).eq("platform", "meta").maybeSingle(),
    getManualCampaigns(projectId, cycleId),
  ])
  const lifetimeByKey = new Map(
    ((lifetimeRes.data ?? []) as (LifetimeTotals & { level: string; object_id: string })[])
      .map((r) => [`${r.level}:${r.object_id}`, r])
  )
  const reachByCampaignId = new Map((reachRes.data ?? []).map((r) => [r.object_id as string, r as { reach: number | null; frequency: number | null }]))

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
      aggregate: withMetaReach(computeMetricsForAd(merged, window), reachByCampaignId.get(campaignId), resultsTypeOf(merged)),
      ads: campaignAds,
      trendWindow: window,
      hasOverride: !!campaignOverrides[campaignId],
      lifetime: lifetimeByKey.has(`campaign:${campaignId}`) ? metricsFromLifetime(lifetimeByKey.get(`campaign:${campaignId}`)!) : null,
      adLifetime: Object.fromEntries(campaignAds.map((ad) => {
        const row = lifetimeByKey.get(`ad:${ad.ad_id}`)
        return [ad.ad_id, row ? metricsFromLifetime(row) : null]
      })),
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
      brandLine: c.brand_line ? { id: c.brand_line.id, name: c.brand_line.name, color: c.brand_line.color } : null,
      full: c,
    })),
    assets: assets.map((a) => ({
      id: a.id,
      conceptId: a.concept_id,
      thumbUrl: assetThumbUrl(a),
      fileUrl: assetFileUrl(a),
      fileType: a.file_type,
      format: a.format,
      platform: a.platform,
      clientVisible: !!a.client_visible,
      clientStatus: a.client_status ?? null,
    })),
    campaigns,
    assetCampaignEdges,
    displayMetrics: ((contextRes.data?.display_metrics as string[] | null) ?? ["spend", "cost_per_result"])
      .filter((k): k is MetricKey => k in METRIC_DEFS),
    cycleStartDate: (cycleRes.data as { start_date: string } | null)?.start_date ?? null,
    currency: (integrationRes.data?.currency as string | null) ?? null,
    manualCampaigns,
  }
}
