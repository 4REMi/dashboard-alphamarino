// Backend de la extensión de Chrome "Alpha Marino — Guardar anuncios"
// (carpeta extension/ en la raíz del repo). Lo usan las rutas
// app/api/extension/*. Ver docs/agent-guides/extension-chrome.md.
//
// SIN "use server" a propósito: escribe con el cliente admin y descarga
// URLs, así que NO debe ser un endpoint público. Las rutas autentican con
// la API key personal (admk_…) o un token OAuth del MCP — mismo
// verifyMcpToken que /api/mcp — y solo entonces llaman aquí con el
// profileId ya resuelto.

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyMcpToken } from "@/lib/mcp/auth"
import { runTrusted } from "@/lib/trusted-context"
import { can } from "@/lib/permissions"
import { mirrorToStorage } from "@/lib/ad-lab/storage-mirror"
import { getMetaAdById } from "@/lib/actions/meta"
import type { Profile } from "@/lib/types"

const META_BASE = "https://graph.facebook.com/v21.0"
const MAX_ADS_PER_REQUEST = 25
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_ID_RE = /^\d{5,25}$/

export class ExtensionError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

// ── Auth ──────────────────────────────────────────────────────────

/**
 * Corre `fn` dentro de un contexto de confianza del MCP con el perfil del
 * token ya fijado (así getMetaAdById, que exige sesión o contexto de
 * confianza, funciona) y solo si ese perfil tiene acceso a Ad Lab.
 */
export async function withExtensionAuth<T>(req: Request, fn: (profileId: string) => Promise<T>): Promise<T> {
  const header = req.headers.get("authorization") ?? ""
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : ""
  if (!token) throw new ExtensionError("Falta la API key", 401)

  return runTrusted("mcp", async () => {
    const info = await verifyMcpToken(req, token)
    const profileId = info?.extra?.profileId as string | undefined
    if (!profileId) throw new ExtensionError("API key inválida o revocada", 401)

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, permissions")
      .eq("id", profileId)
      .maybeSingle()
    if (!profile || !can(profile as Pick<Profile, "role" | "permissions">, "access_ad_lab")) {
      throw new ExtensionError("Tu usuario no tiene acceso a Ad Lab", 403)
    }
    return fn(profileId)
  })
}

export async function getExtensionProfile(profileId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from("profiles").select("id, full_name, email").eq("id", profileId).maybeSingle()
  return { id: profileId, name: (data?.full_name as string | null) ?? (data?.email as string | null) ?? "" }
}

// ── Boards ────────────────────────────────────────────────────────

export interface ExtensionBoard {
  id: string
  name: string
  ad_count: number
}

export async function listBoardsForExtension(): Promise<ExtensionBoard[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ad_boards")
    .select("id, name, ad_count")
    .order("created_at", { ascending: false })
  if (error) throw new ExtensionError(error.message, 500)
  return (data ?? []).map((b) => ({ id: b.id, name: b.name, ad_count: b.ad_count ?? 0 }))
}

export async function createBoardForExtension(profileId: string, name: string): Promise<ExtensionBoard> {
  const clean = name.trim().slice(0, 120)
  if (!clean) throw new ExtensionError("El board necesita nombre")
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ad_boards")
    .insert({ name: clean, created_by: profileId })
    .select("id, name")
    .single()
  if (error) throw new ExtensionError(error.message, 500)
  revalidatePath("/ad-lab/boards")
  return { id: data.id, name: data.name, ad_count: 0 }
}

async function assertBoard(boardId: string) {
  if (!UUID_RE.test(boardId)) throw new ExtensionError("Board inválido")
  const admin = createAdminClient()
  const { data } = await admin.from("ad_boards").select("id").eq("id", boardId).maybeSingle()
  if (!data) throw new ExtensionError("Ese board ya no existe", 404)
}

async function addToBoard(boardId: string, savedAdId: string, profileId: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from("board_ads")
    .upsert({ board_id: boardId, saved_ad_id: savedAdId, added_by: profileId }, { onConflict: "board_id,saved_ad_id" })
  if (error) throw new Error(error.message)
}

function revalidateBoards(boardId: string) {
  revalidatePath("/ad-lab")
  revalidatePath("/ad-lab/boards")
  revalidatePath(`/ad-lab/boards/${boardId}`)
}

// ── Resultado por anuncio ─────────────────────────────────────────

export interface SaveResult {
  id: string            // ad id (Ads Manager) o ad_archive_id (Ad Library)
  ok: boolean
  name?: string
  savedAdId?: string
  hasVideo?: boolean
  warning?: string      // guardado, pero con algo incompleto (ej. sin video)
  error?: string
  via?: "session" | "system_user"   // Ads Manager: con qué acceso se leyó
}

function extOf(url: string, fallback: string) {
  const ext = url.split("?")[0].split(".").pop() ?? ""
  return /^[a-z0-9]{2,4}$/i.test(ext) ? ext.toLowerCase() : fallback
}

// ── URLs de media aceptadas ───────────────────────────────────────
// Solo se descargan URLs https del CDN de Meta, para que las rutas no
// sirvan para que el servidor pida cualquier URL (SSRF).

const META_CDN_HOSTS = [/\.fbcdn\.net$/i, /\.cdninstagram\.com$/i, /(^|\.)facebook\.com$/i]

function safeMetaUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== "https:") return null
    return META_CDN_HOSTS.some((re) => re.test(u.hostname)) ? u.toString() : null
  } catch {
    return null
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

// ── Ads Manager ───────────────────────────────────────────────────
// No se captura el video de la página (Ads Manager lo reproduce por
// streaming, blob:). En su lugar:
//   1. La extensión pide el creativo a la Graph API con la sesión del
//      usuario en el Ads Manager (su token se queda en el navegador) y
//      manda aquí solo las URLs del MP4/imagen originales → funciona con
//      cualquier cuenta que esa persona vea (auditorías de prospectos).
//   2. Si eso no trae media, respaldo con META_SYSTEM_USER_TOKEN
//      (getMetaAdById) — solo cuentas asignadas al usuario de sistema.

async function fetchAdContext(adId: string): Promise<{ account: string | null; campaign: string | null }> {
  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) return { account: null, campaign: null }
  try {
    const url = new URL(`${META_BASE}/${adId}`)
    url.searchParams.set("fields", "account_id,campaign{name},adset{name}")
    url.searchParams.set("access_token", token)
    const res = await fetch(url.toString(), { cache: "no-store" })
    const json = await res.json()
    if (json.error) return { account: null, campaign: null }
    let account: string | null = json.account_id ? `act_${json.account_id}` : null
    if (json.account_id) {
      const aUrl = new URL(`${META_BASE}/act_${json.account_id}`)
      aUrl.searchParams.set("fields", "name")
      aUrl.searchParams.set("access_token", token)
      const aJson = await (await fetch(aUrl.toString(), { cache: "no-store" })).json()
      if (aJson?.name) account = aJson.name
    }
    return { account, campaign: json.campaign?.name ?? null }
  } catch {
    return { account: null, campaign: null }
  }
}

// Lo que la extensión ya resolvió con la sesión de quien la usa (su token
// del Ads Manager, que nunca llega aquí): sirve para cuentas que el
// usuario de sistema del dashboard NO ve — auditorías de prospectos,
// clientes con la cuenta en su propio Business Manager.
interface ClientResolvedAd {
  name: string | null
  account: string | null
  campaign: string | null
  status: string | null
  body: string | null
  videoUrl: string | null
  imageUrl: string | null
  error: string | null   // por qué no pudo resolverlo la extensión
}

function parseClientAd(raw: unknown): ClientResolvedAd | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  return {
    name:     str(r.name, 300),
    account:  str(r.account_name, 200),
    campaign: str(r.campaign_name, 300),
    status:   str(r.status, 40),
    body:     str(r.body, 5000),
    videoUrl: safeMetaUrl(r.video_url),
    imageUrl: safeMetaUrl(r.image_url),
    error:    str(r.error, 500),
  }
}

interface ResolvedAd {
  name: string
  account: string | null
  campaign: string | null
  status: string | null
  body: string | null
  videoUrl: string | null
  imageUrl: string | null
  via: "session" | "system_user"
}

const NO_ACCESS_HINT =
  "Ni tu sesión de Facebook ni el usuario de sistema del dashboard pudieron leer este anuncio. " +
  "¿Es el ID de un anuncio (no de la campaña o el conjunto) y tienes la pestaña del Ads Manager de esa cuenta abierta?"

async function resolveAd(adId: string, client: ClientResolvedAd | null): Promise<{ ad: ResolvedAd | null; error?: string; warning?: string }> {
  const fromClient = (): ResolvedAd => ({
    name: client!.name ?? adId, account: client!.account, campaign: client!.campaign, status: client!.status,
    body: client!.body, videoUrl: client!.videoUrl, imageUrl: client!.imageUrl, via: "session",
  })

  // 1. La sesión del usuario trajo el video (o una imagen sin errores).
  if (client && (client.videoUrl || (client.imageUrl && !client.error))) return { ad: fromClient() }

  // 2. Respaldo: usuario de sistema (solo cuentas asignadas en el Business Manager de la agencia).
  const [{ ad, error }, ctx] = await Promise.all([getMetaAdById(adId), fetchAdContext(adId)])
  if (ad) {
    return {
      ad: {
        name: ad.name, account: ctx.account, campaign: ctx.campaign, status: ad.status, body: ad.body,
        videoUrl: ad.videoUrl, imageUrl: ad.imageUrl ?? ad.thumbnailUrl, via: "system_user",
      },
    }
  }

  // 3. Ninguno trajo el video, pero la sesión sí trajo la imagen: mejor eso que nada.
  if (client?.imageUrl) {
    return { ad: fromClient(), warning: `Solo se guardó la imagen: ${client.error ?? "Meta no devolvió el video"}.` }
  }

  const parts = [
    error?.includes("does not exist") || error?.includes("permission") ? NO_ACCESS_HINT : (error ?? "No se pudo leer el anuncio"),
    client?.error ? `Tu sesión: ${client.error}` : client ? null : "La extensión no encontró tu sesión del Ads Manager (recarga la pestaña).",
    error ? `Usuario de sistema: ${error}` : null,
  ]
  return { ad: null, error: parts.filter(Boolean).join(" · ") }
}

async function saveOneFromAdsManager(adId: string, boardId: string, profileId: string, client: ClientResolvedAd | null): Promise<SaveResult> {
  if (!NUMERIC_ID_RE.test(adId)) return { id: adId, ok: false, error: "ID de anuncio inválido" }

  const resolved = await resolveAd(adId, client)
  const ad = resolved.ad
  if (!ad) return { id: adId, ok: false, error: resolved.error }

  const admin = createAdminClient()
  const archiveId = `ads_manager_${adId}`
  const imageSrc = ad.imageUrl

  const { data: existing } = await admin
    .from("saved_ads")
    .select("id, cached_video_url, cached_image_url")
    .eq("ad_archive_id", archiveId)
    .maybeSingle()

  let row = existing
  if (!row) {
    const notes = [
      "Guardado desde Ads Manager (extensión).",
      ad.campaign ? `Campaña: ${ad.campaign}` : null,
      `Ad ID: ${adId}`,
    ].filter(Boolean).join("\n")

    const { data, error: insErr } = await admin
      .from("saved_ads")
      .insert({
        ad_archive_id: archiveId,
        page_id:       "ads_manager",
        page_name:     ad.account ? `${ad.account} · ${ad.name}` : ad.name,
        body:          ad.body,
        image_url:     imageSrc,
        video_url:     ad.videoUrl,
        status:        ad.status === "ACTIVE" ? "active" : "inactive",
        platforms:     [],
        currency:      "",
        source:        "ads_manager",
        notes,
        created_by:    profileId,
      })
      .select("id, cached_video_url, cached_image_url")
      .single()
    if (insErr) return { id: adId, ok: false, error: insErr.message }
    row = data
  }

  const updates: Record<string, string> = {}
  let warning: string | undefined = resolved.warning
  if (!row.cached_image_url && imageSrc) {
    const url = await mirrorToStorage(admin, imageSrc, `${row.id}/image.${extOf(imageSrc, "jpg")}`, 20)
    if (url) updates.cached_image_url = url
  }
  if (!row.cached_video_url && ad.videoUrl) {
    const url = await mirrorToStorage(admin, ad.videoUrl, `${row.id}/video.mp4`, 250, 120_000)
    if (url) updates.cached_video_url = url
    else warning = "No se pudo copiar el video a Storage; queda el enlace original de Meta (caduca)."
  }
  if (!ad.videoUrl && !imageSrc) warning = "Meta no devolvió ni video ni imagen para este anuncio."
  if (Object.keys(updates).length > 0) await admin.from("saved_ads").update(updates).eq("id", row.id)

  try {
    await addToBoard(boardId, row.id, profileId)
  } catch (e) {
    return { id: adId, ok: false, error: e instanceof Error ? e.message : "No se pudo agregar al board" }
  }
  return { id: adId, ok: true, name: ad.name, savedAdId: row.id, hasVideo: !!ad.videoUrl, warning, via: ad.via }
}

/**
 * adIds: IDs de anuncio. clientAds (opcional): { [adId]: lo que resolvió la
 * extensión con la sesión del usuario } — si trae video/imagen se usa eso;
 * si no, se intenta con el usuario de sistema.
 */
export async function saveFromAdsManager(profileId: string, boardId: string, adIds: unknown, clientAds?: unknown): Promise<SaveResult[]> {
  await assertBoard(boardId)
  if (!Array.isArray(adIds) || adIds.length === 0) throw new ExtensionError("No llegaron IDs de anuncio")
  const ids = [...new Set(adIds.map(String))]
  if (ids.length > MAX_ADS_PER_REQUEST) throw new ExtensionError(`Máximo ${MAX_ADS_PER_REQUEST} anuncios por envío`)
  const byId = (clientAds && typeof clientAds === "object" ? clientAds : {}) as Record<string, unknown>

  // De 3 en 3: cada uno descarga un video completo.
  const results: SaveResult[] = []
  for (let i = 0; i < ids.length; i += 3) {
    results.push(...await Promise.all(
      ids.slice(i, i + 3).map((id) => saveOneFromAdsManager(id, boardId, profileId, parseClientAd(byId[id]))),
    ))
  }
  revalidateBoards(boardId)
  return results
}

// ── Ad Library ────────────────────────────────────────────────────
// Aquí sí se toma la media de la página: la Ad Library sirve el MP4 tal
// cual en <video src> (filtrado con safeMetaUrl, arriba).


export interface AdLibraryPayload {
  ad_archive_id: string
  page_name?: string | null
  page_id?: string | null
  body?: string | null
  video_url?: string | null
  image_url?: string | null
  started?: string | null
}

export async function saveFromAdLibrary(profileId: string, boardId: string, raw: unknown): Promise<SaveResult> {
  await assertBoard(boardId)
  const p = (raw ?? {}) as Record<string, unknown>
  const archiveId = String(p.ad_archive_id ?? "")
  if (!NUMERIC_ID_RE.test(archiveId)) throw new ExtensionError("ID de la biblioteca inválido")

  const videoUrl = safeMetaUrl(p.video_url)
  const imageUrl = safeMetaUrl(p.image_url)
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from("saved_ads")
    .select("id, page_name, cached_video_url, cached_image_url, video_url, image_url")
    .eq("ad_archive_id", archiveId)
    .maybeSingle()

  let row = existing
  if (!row) {
    const pageId = str(p.page_id, 40)
    const { data, error } = await admin
      .from("saved_ads")
      .insert({
        ad_archive_id: archiveId,
        page_id:       pageId && NUMERIC_ID_RE.test(pageId) ? pageId : "ad_library",
        page_name:     str(p.page_name, 200) ?? "Ad Library",
        body:          str(p.body, 5000),
        image_url:     imageUrl,
        video_url:     videoUrl,
        snapshot_url:  `https://www.facebook.com/ads/library/?id=${archiveId}`,
        platforms:     [],
        currency:      "",
        source:        "extension",
        created_by:    profileId,
      })
      .select("id, page_name, cached_video_url, cached_image_url, video_url, image_url")
      .single()
    if (error) return { id: archiveId, ok: false, error: error.message }
    row = data
  }

  const updates: Record<string, string> = {}
  let warning: string | undefined
  if (!row.cached_image_url && imageUrl) {
    const url = await mirrorToStorage(admin, imageUrl, `${row.id}/image.${extOf(imageUrl, "jpg")}`, 20)
    if (url) updates.cached_image_url = url
    if (!row.image_url) updates.image_url = imageUrl
  }
  if (!row.cached_video_url && videoUrl) {
    const url = await mirrorToStorage(admin, videoUrl, `${row.id}/video.mp4`, 250, 120_000)
    if (url) updates.cached_video_url = url
    else warning = "No se pudo copiar el video a Storage."
    if (!row.video_url) updates.video_url = videoUrl
  }
  if (!videoUrl && !imageUrl && !row.cached_image_url && !row.cached_video_url) {
    warning = "No se encontró video ni imagen en la tarjeta; se guardó solo el texto."
  }
  if (Object.keys(updates).length > 0) await admin.from("saved_ads").update(updates).eq("id", row.id)

  await addToBoard(boardId, row.id, profileId)
  revalidateBoards(boardId)
  return { id: archiveId, ok: true, name: row.page_name, savedAdId: row.id, hasVideo: !!(videoUrl || row.cached_video_url), warning }
}
