"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { cycleMemberIds } from "@/lib/actions/creatives"
import type { MetaAd, MetaAdDailyStat, TrendWindow } from "@/lib/types"
import type { MetricKey } from "@/lib/constants/paid-media-metrics"

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

export interface LinkableAsset {
  id: string
  conceptName: string | null
  targetPersona: string | null
  format: string | null
  platform: string | null
  fileType: string | null
  // thumbUrl = lo que se ve en la lista (chico); fileUrl = el archivo real,
  // para poder reproducir el video o agrandar la imagen antes de decidir
  // — el problema concreto que hacía imposible distinguir variantes casi
  // idénticas en el picker viejo.
  thumbUrl: string | null
  fileUrl: string | null
  // Si ya está vinculado a otro ad, se marca en vez de escondérselo al
  // usuario — un asset puede correr en más de un ad a propósito (misma
  // pieza en distintas campañas), pero vincularlo dos veces por accidente
  // sin darse cuenta de que ya estaba vinculado es justo lo que este
  // aviso previene.
  linkedToAdName: string | null
}

// Lista de assets para el picker de vinculación asset↔ad — acotada al
// ciclo actual en vez de TODOS los assets del proyecto alguna vez
// subidos, que es lo que hacía este picker inservible en cuentas con
// historial largo.
export async function getLinkableAssets(projectId: string, cycleId: string | null): Promise<LinkableAsset[]> {
  const supabase = await createClient()

  let query = supabase
    .from("creative_assets")
    .select(`
      id, format, platform, file_type, asset_url, file_path, thumbnail_path,
      concept:creative_concepts(name, target_persona)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(300)

  if (cycleId) {
    const memberIds = await cycleMemberIds("asset", cycleId)
    query = memberIds
      ? query.in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"])
      : query.eq("cycle_id", cycleId)
  }

  const { data, error } = await query
  if (error) return []

  const { data: existingLinks } = await supabase
    .from("creative_asset_meta_ads")
    .select("creative_asset_id, meta_ad:meta_ads(ad_name)")
    .eq("project_id", projectId)
  const linkedAdNameByAssetId = new Map<string, string | null>(
    (existingLinks ?? []).map((l) => [l.creative_asset_id, (l.meta_ad as unknown as { ad_name: string | null } | null)?.ad_name ?? null])
  )

  return (data ?? []).map((a): LinkableAsset => {
    const concept = a.concept as unknown as { name: string | null; target_persona: string | null } | null
    const fileUrl = a.file_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.file_path}`
      : a.asset_url
    const thumbUrl = a.thumbnail_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.thumbnail_path}`
      : fileUrl
    return {
      id: a.id,
      conceptName: concept?.name ?? null,
      targetPersona: concept?.target_persona ?? null,
      format: a.format,
      platform: a.platform,
      fileType: a.file_type,
      thumbUrl,
      fileUrl,
      linkedToAdName: linkedAdNameByAssetId.get(a.id) ?? null,
    }
  })
}

// Cuándo se sincronizó este ciclo por última vez (manual o automático) —
// para la leyenda junto al botón "Sincronizar".
export async function getLastMetaSync(projectId: string, cycleId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("meta_ad_daily_stats")
    .select("synced_at")
    .eq("project_id", projectId)
    .eq("cycle_id", cycleId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.synced_at ?? null
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
import { computeMetricsForAd, withMetaReach, resultsTypeOf, type MetricPoint } from "@/lib/utils/paid-media-calc"

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
  // Media a mostrar, YA con la preferencia resuelta: si el ad está
  // vinculado a un asset del dashboard, ese archivo (no expira, no
  // depende de que Meta lo siga sirviendo) gana sobre lo que trajo el
  // sync. Sin vínculo, sigue siendo thumbnail_url/image_url/video_url de
  // arriba tal cual.
  displayThumbnailUrl: string | null
  displayImageUrl: string | null
  displayVideoUrl: string | null
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

  const [adsRes, statsRes, contextRes, reachRes] = await Promise.all([
    supabase.from("meta_ads").select("*").eq("project_id", projectId),
    supabase.from("meta_ad_daily_stats").select("*").eq("project_id", projectId).eq("cycle_id", cycleId).order("date", { ascending: true }),
    supabase.from("paid_media_context").select("trend_window, campaign_trend_overrides").eq("project_id", projectId).maybeSingle(),
    supabase.from("meta_cycle_reach").select("object_id, reach, frequency").eq("project_id", projectId).eq("cycle_id", cycleId).eq("level", "ad"),
  ])
  const reachByAdId = new Map((reachRes.data ?? []).map((r) => [r.object_id as string, r as { reach: number | null; frequency: number | null }]))

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
    .select(`
      id, meta_ad_id,
      creative_asset:creative_assets(
        id, concept_id, file_type, asset_url, file_path, thumbnail_path,
        concept:creative_concepts(id, name, target_persona)
      )
    `)
    .eq("project_id", projectId)
    .in("meta_ad_id", adIdsWithData.map((a) => a.ad_id))

  type LinkedAsset = {
    id: string; concept_id: string | null
    file_type: string | null; asset_url: string | null; file_path: string | null; thumbnail_path: string | null
    concept: { id: string; name: string | null; target_persona: string | null } | null
  }

  function assetFileUrl(a: LinkedAsset): string | null {
    if (a.file_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.file_path}`
    return a.asset_url
  }
  function assetThumbUrl(a: LinkedAsset): string | null {
    if (a.thumbnail_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${a.thumbnail_path}`
    return assetFileUrl(a)
  }

  const linksByAdId = new Map<string, AdPerformanceCard["linkedConcepts"]>()
  // Solo el PRIMER asset vinculado decide qué media mostrar — un ad
  // vinculado a más de un asset es un caso raro (edición retroactiva), y
  // no hay una forma no ambigua de elegir entre varios de todos modos.
  const linkedAssetByAdId = new Map<string, LinkedAsset>()
  for (const l of links ?? []) {
    const asset = l.creative_asset as unknown as LinkedAsset | null
    if (!asset) continue
    if (!linksByAdId.has(l.meta_ad_id)) linksByAdId.set(l.meta_ad_id, [])
    linksByAdId.get(l.meta_ad_id)!.push({
      linkId: l.id,
      assetId: asset.id,
      conceptId: asset.concept_id,
      conceptName: asset.concept?.name ?? null,
      targetPersona: asset.concept?.target_persona ?? null,
    })
    if (!linkedAssetByAdId.has(l.meta_ad_id)) linkedAssetByAdId.set(l.meta_ad_id, asset)
  }

  return adIdsWithData
    .map((ad): AdPerformanceCard => {
      const window = (ad.campaign_id && campaignOverrides[ad.campaign_id]) || defaultWindow
      const linkedAsset = linkedAssetByAdId.get(ad.ad_id)
      const isLinkedVideo = linkedAsset?.file_type === "video"
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
        displayThumbnailUrl: linkedAsset ? assetThumbUrl(linkedAsset) : ad.thumbnail_url,
        displayImageUrl: linkedAsset && !isLinkedVideo ? assetFileUrl(linkedAsset) : ad.image_url,
        displayVideoUrl: linkedAsset && isLinkedVideo ? assetFileUrl(linkedAsset) : ad.video_url,
        metrics: withMetaReach(computeMetricsForAd(statsByAd.get(ad.ad_id)!, window), reachByAdId.get(ad.ad_id), resultsTypeOf(statsByAd.get(ad.ad_id)!)),
        linkedConcepts: linksByAdId.get(ad.ad_id) ?? [],
        dailyRows: statsByAd.get(ad.ad_id)!,
      }
    })
    .sort((a, b) => (b.metrics.spend.value ?? 0) - (a.metrics.spend.value ?? 0))
}
