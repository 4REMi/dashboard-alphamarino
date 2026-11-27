// Recibe lo que la extensión captura del Ads Manager para una auditoría y lo
// guarda (tablas audit_*, migración 124). Lo llaman las rutas
// app/api/extension/audit/*, que ya autenticaron al usuario con
// withExtensionAuth (API key + permiso access_ad_lab).
//
// SIN "use server" a propósito: escribe con el cliente admin y descarga
// URLs; no debe ser un endpoint público. Ver docs/agent-guides/auditorias.md.

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { mirrorToStorage } from "@/lib/ad-lab/storage-mirror"
import { ExtensionError, NUMERIC_ID_RE, safeMetaUrl, str } from "@/lib/ad-lab/extension"
import { STORED_COUNTER_KEYS, type StoreEvent } from "@/lib/ad-audit/metrics"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const STORE_EVENTS: StoreEvent[] = ["landing_page_view", "add_to_cart", "initiate_checkout", "purchase"]

const metaId = (v: unknown, what: string): string => {
  const s = String(v ?? "").replace(/^act_/, "")
  if (!NUMERIC_ID_RE.test(s)) throw new ExtensionError(`${what} inválido`)
  return s
}
const date = (v: unknown): string | null => (typeof v === "string" && DATE_RE.test(v) ? v : null)
const arr = (v: unknown, max: number, what: string): unknown[] => {
  if (!Array.isArray(v)) return []
  if (v.length > max) throw new ExtensionError(`Demasiados ${what} en un envío (máximo ${max})`)
  return v
}
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})

// { action_type: número } saneado (todas las acciones de Meta, migración 128).
function numberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(obj(v)).slice(0, 300)) {
    const num = Number(n)
    if (/^[\w.:-]{1,120}$/.test(k) && Number.isFinite(num) && num !== 0) out[k] = num
  }
  return out
}

// promoted_object del conjunto: solo los campos que usa resolveResultSpec.
function promotedObject(v: unknown): Record<string, string> | null {
  const o = obj(v)
  const out: Record<string, string> = {}
  for (const k of ["custom_event_type", "custom_conversion_id", "pixel_id", "page_id", "application_id"]) {
    if (typeof o[k] === "string" || typeof o[k] === "number") out[k] = String(o[k]).slice(0, 80)
  }
  return Object.keys(out).length ? out : null
}

async function campaignByMetaId(metaCampaignId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from("audit_campaigns").select("id, account_id").eq("meta_campaign_id", metaCampaignId).maybeSingle()
  if (!data) throw new ExtensionError("Esa campaña no se ha iniciado en esta auditoría", 404)
  return data as { id: string; account_id: string }
}

// ── 1. Inicio: cuenta + campañas seleccionadas ────────────────────

export async function startAudit(profileId: string, raw: unknown) {
  const body = obj(raw)
  const acc = obj(body.account)
  const accountMetaId = metaId(acc.id, "ID de cuenta")
  const since = date(body.since)
  const until = date(body.until)
  if (!since || !until) throw new ExtensionError("Falta el período (since/until)")
  const campaigns = arr(body.campaigns, 50, "campañas").map(obj)
  if (campaigns.length === 0) throw new ExtensionError("No llegaron campañas")

  const admin = createAdminClient()
  const { data: existing } = await admin.from("audit_accounts").select("id").eq("meta_account_id", accountMetaId).maybeSingle()
  let accountId = existing?.id as string | undefined
  if (accountId) {
    await admin.from("audit_accounts").update({ name: str(acc.name, 200) ?? `act_${accountMetaId}`, currency: str(acc.currency, 8) }).eq("id", accountId)
  } else {
    const { data, error } = await admin.from("audit_accounts").insert({
      meta_account_id: accountMetaId,
      name: str(acc.name, 200) ?? `act_${accountMetaId}`,
      currency: str(acc.currency, 8),
      created_by: profileId,
    }).select("id").single()
    if (error) throw new ExtensionError(error.message, 500)
    accountId = data.id as string
  }

  const rows = campaigns.map((c) => ({
    account_id: accountId,
    meta_campaign_id: metaId(c.id, "ID de campaña"),
    name: str(c.name, 300) ?? String(c.id),
    objective: str(c.objective, 60),
    status: str(c.status, 40),
    period_since: since,
    period_until: until,
  }))
  const { data: saved, error } = await admin.from("audit_campaigns").upsert(rows, { onConflict: "meta_campaign_id" }).select("id, meta_campaign_id")
  if (error) throw new ExtensionError(error.message, 500)
  return { accountId, campaigns: Object.fromEntries((saved ?? []).map((c) => [c.meta_campaign_id, c.id])) }
}

// ── 2. Estructura de una campaña: conjuntos, anuncios, videos, curvas ─

export async function saveCampaignStructure(raw: unknown) {
  const body = obj(raw)
  const campaign = await campaignByMetaId(metaId(body.campaignId, "ID de campaña"))
  const admin = createAdminClient()

  // Conjuntos
  const adsets = arr(body.adsets, 500, "conjuntos").map(obj).map((s) => ({
    campaign_id: campaign.id,
    meta_adset_id: metaId(s.id, "ID de conjunto"),
    name: str(s.name, 300) ?? String(s.id),
    status: str(s.status, 40),
    optimization_goal: str(s.optimization_goal, 60),
    promoted_object: promotedObject(s.promoted_object),
  }))
  const adsetIds = new Map<string, string>()
  if (adsets.length) {
    const { data, error } = await admin.from("audit_adsets").upsert(adsets, { onConflict: "meta_adset_id" }).select("id, meta_adset_id")
    if (error) throw new ExtensionError(error.message, 500)
    for (const s of data ?? []) adsetIds.set(s.meta_adset_id, s.id)
  }

  // Videos (solo datos; la copia del archivo va en /media)
  const videos = arr(body.videos, 500, "videos").map(obj).map((v) => ({
    meta_video_id: metaId(v.id, "ID de video"),
    account_id: campaign.account_id,
    picture_url: safeMetaUrl(v.picture),
    duration_sec: Number.isFinite(Number(v.duration)) ? Number(v.duration) : null,
  }))
  if (videos.length) {
    // ignoreDuplicates: no pisar storage_url de un video ya copiado.
    const { error } = await admin.from("audit_videos").upsert(videos, { onConflict: "meta_video_id", ignoreDuplicates: true })
    if (error) throw new ExtensionError(error.message, 500)
    for (const v of videos) {
      await admin.from("audit_videos").update({ picture_url: v.picture_url, duration_sec: v.duration_sec }).eq("meta_video_id", v.meta_video_id)
    }
  }

  // Anuncios
  const ads = arr(body.ads, 1000, "anuncios").map(obj).map((a) => {
    const format = a.format === "video" || a.format === "image" ? a.format : "other"
    const videoId = a.video_id ? metaId(a.video_id, "ID de video") : null
    return {
      campaign_id: campaign.id,
      adset_id: adsetIds.get(String(a.adset_id)) ?? null,
      meta_ad_id: metaId(a.id, "ID de anuncio"),
      name: str(a.name, 300) ?? String(a.id),
      status: str(a.status, 40),
      format,
      meta_video_id: videoId,
      image_url: safeMetaUrl(a.image_url),
      landing_url: typeof a.landing_url === "string" && /^https?:\/\//.test(a.landing_url) ? a.landing_url.slice(0, 1000) : null,
      body: str(a.body, 5000),
      created_time: typeof a.created_time === "string" ? a.created_time : null,
    }
  })
  // Todo video al que apunta un anuncio debe existir (FK), aunque la
  // extensión no haya podido leer sus datos.
  const referenced = [...new Set(ads.map((a) => a.meta_video_id).filter(Boolean))] as string[]
  if (referenced.length) {
    await admin.from("audit_videos").upsert(
      referenced.map((id) => ({ meta_video_id: id, account_id: campaign.account_id })),
      { onConflict: "meta_video_id", ignoreDuplicates: true },
    )
  }

  const adIds = new Map<string, string>()
  if (ads.length) {
    const { data, error } = await admin.from("audit_ads").upsert(ads, { onConflict: "meta_ad_id" }).select("id, meta_ad_id")
    if (error) throw new ExtensionError(error.message, 500)
    for (const a of data ?? []) adIds.set(a.meta_ad_id, a.id)
  }

  // Curvas de retención del período
  const since = date(body.since)
  const until = date(body.until)
  // Datos del período por anuncio: curva de retención (videos) y alcance,
  // frecuencia y tiempo promedio de reproducción (no se suman por día).
  const optNum = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v))
  const curves = arr(body.retention, 1000, "curvas").map(obj)
    .filter((r) => adIds.has(String(r.ad_id)))
    .map((r) => ({
      ad_id: adIds.get(String(r.ad_id))!,
      period_since: since,
      period_until: until,
      curve: Array.isArray(r.curve) ? (r.curve as unknown[]).slice(0, 30).map((x) => Math.max(0, Math.min(100, Number(x) || 0))) : null,
      reach: optNum(r.reach),
      frequency: optNum(r.frequency),
      avg_watch_sec: optNum(r.avg_watch_sec),
    }))
  if (curves.length) {
    const { error } = await admin.from("audit_ad_retention").upsert(curves, { onConflict: "ad_id" })
    if (error) throw new ExtensionError(error.message, 500)
  }

  const missing = arr(body.missing_events, 10, "eventos").filter((e): e is StoreEvent => STORE_EVENTS.includes(e as StoreEvent))
  await admin.from("audit_campaigns").update({ captured_at: new Date().toISOString(), missing_events: missing }).eq("id", campaign.id)

  // Qué media falta copiar (videos sin archivo, imágenes sin copia)
  const videoIds = [...new Set(ads.map((a) => a.meta_video_id).filter(Boolean))] as string[]
  const { data: pendingVideos } = videoIds.length
    ? await admin.from("audit_videos").select("meta_video_id").in("meta_video_id", videoIds).is("storage_url", null)
    : { data: [] }
  const { data: pendingImages } = adIds.size
    ? await admin.from("audit_ads").select("meta_ad_id").in("meta_ad_id", [...adIds.keys()]).is("cached_image_url", null).not("image_url", "is", null)
    : { data: [] }

  return {
    ads: adIds.size,
    videosToMirror: (pendingVideos ?? []).map((v) => v.meta_video_id),
    imagesToMirror: (pendingImages ?? []).map((a) => a.meta_ad_id),
  }
}

// ── 3. Conteos diarios (en tandas, para no pasar el límite de 4.5 MB) ─

export async function saveDailyRows(raw: unknown) {
  const body = obj(raw)
  const campaign = await campaignByMetaId(metaId(body.campaignId, "ID de campaña"))
  const rows = arr(body.rows, 5000, "filas diarias").map(obj)
  if (rows.length === 0) return { saved: 0 }

  const admin = createAdminClient()
  const metaAdIds = [...new Set(rows.map((r) => String(r.ad_id)))]
  const { data: ads } = await admin.from("audit_ads").select("id, meta_ad_id").eq("campaign_id", campaign.id).in("meta_ad_id", metaAdIds)
  const adIds = new Map((ads ?? []).map((a) => [a.meta_ad_id as string, a.id as string]))

  const clean = rows
    .filter((r) => adIds.has(String(r.ad_id)) && date(r.date))
    .map((r) => {
      const row: Record<string, unknown> = { ad_id: adIds.get(String(r.ad_id)), date: r.date }
      for (const k of STORED_COUNTER_KEYS) row[k] = Math.max(0, Number(r[k]) || 0)
      // Todas las acciones del día (resultado por conjunto, migración 128).
      if (r.actions !== undefined) row.actions = numberMap(r.actions)
      if (r.action_values !== undefined) row.action_values = numberMap(r.action_values)
      return row
    })
  if (clean.length) {
    const { error } = await admin.from("audit_ad_daily").upsert(clean, { onConflict: "ad_id,date" })
    if (error) throw new ExtensionError(error.message, 500)
  }
  return { saved: clean.length }
}

// ── 4. Media: copiar videos e imágenes a Storage ──────────────────
// Los enlaces de Meta caducan en horas: la extensión llama esto en cuanto
// captura. Pocos por llamada (cada video se descarga completo).

export async function mirrorAuditMedia(raw: unknown) {
  const body = obj(raw)
  const admin = createAdminClient()
  const results: { id: string; ok: boolean; error?: string }[] = []

  for (const v of arr(body.videos, 4, "videos").map(obj)) {
    const id = metaId(v.id, "ID de video")
    const source = safeMetaUrl(v.source)
    if (!source) { results.push({ id, ok: false, error: "Sin URL del video" }); continue }
    const path = `audits/videos/${id}.mp4`
    const url = await mirrorToStorage(admin, source, path, 200, 120_000)
    await admin.from("audit_videos").update(
      url ? { storage_path: path, storage_url: url, mirrored_at: new Date().toISOString(), mirror_error: null }
          : { mirror_error: "No se pudo copiar el video" },
    ).eq("meta_video_id", id)
    results.push(url ? { id, ok: true } : { id, ok: false, error: "No se pudo copiar el video" })
  }

  for (const img of arr(body.images, 12, "imágenes").map(obj)) {
    const id = metaId(img.ad_id, "ID de anuncio")
    const { data: ad } = await admin.from("audit_ads").select("id, image_url").eq("meta_ad_id", id).maybeSingle()
    const source = safeMetaUrl(img.url) ?? (ad?.image_url as string | null)
    if (!ad || !source) { results.push({ id, ok: false, error: "Sin imagen" }); continue }
    const url = await mirrorToStorage(admin, source, `audits/images/${id}.jpg`, 20)
    if (url) await admin.from("audit_ads").update({ cached_image_url: url }).eq("id", ad.id)
    results.push(url ? { id, ok: true } : { id, ok: false, error: "No se pudo copiar la imagen" })
  }
  return { results }
}

// ── 5. Fin ────────────────────────────────────────────────────────

export async function finishAudit(profileId: string, raw: unknown) {
  const body = obj(raw)
  const accountMetaId = metaId(body.accountId, "ID de cuenta")
  const admin = createAdminClient()
  const { data } = await admin.from("audit_accounts")
    .update({ last_captured_at: new Date().toISOString(), last_captured_by: profileId })
    .eq("meta_account_id", accountMetaId).select("id").maybeSingle()
  revalidatePath("/ad-lab/auditorias")
  return { accountId: data?.id ?? null }
}
