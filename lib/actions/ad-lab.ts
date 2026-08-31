"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { TrackedBrand, SavedAd, AdBoard, ClientCreativeContext, MetaAdResult, InstagramPostResult, AccountSuggestion } from "@/lib/types"

// ── Storage mirror ────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Downloads a URL and uploads to Supabase Storage.
 * Returns the public URL or null if download/upload fails.
 * maxSizeMB = 0 means no size limit.
 */
async function mirrorToStorage(
  supabase: SupabaseClient,
  sourceUrl: string,
  storagePath: string,
  maxSizeMB = 0,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null

    if (maxSizeMB > 0) {
      const len = Number(res.headers.get("content-length") ?? 0)
      if (len > maxSizeMB * 1024 * 1024) return null
    }

    const buffer      = await res.arrayBuffer()
    const contentType = res.headers.get("content-type") ?? "application/octet-stream"

    const { error } = await supabase.storage
      .from("ad-lab")
      .upload(storagePath, buffer, { contentType, upsert: true })
    if (error) return null

    const { data: { publicUrl } } = supabase.storage.from("ad-lab").getPublicUrl(storagePath)
    return publicUrl
  } catch {
    return null
  }
}

// ── Apify — Facebook Ads Library scraper ─────────────────────────

const APIFY_ACTOR = "curious_coder~facebook-ads-library-scraper"

function buildAdLibraryUrl(params: {
  query?: string
  pageId?: string
  country: string
  status: string
}): string {
  const base = "https://www.facebook.com/ads/library/"
  const activeStatus = params.status.toLowerCase() === "all" ? "all"
    : params.status.toLowerCase() === "active" ? "active"
    : "inactive"

  if (params.pageId) {
    // Search by page ID — shows all ads from that specific page
    const sp = new URLSearchParams({
      active_status: activeStatus,
      ad_type:       "all",
      country:       params.country,
      view_all_page_id: params.pageId,
      media_type:    "all",
    })
    return `${base}?${sp.toString()}`
  }

  // Keyword search
  const sp = new URLSearchParams({
    active_status: activeStatus,
    ad_type:       "all",
    country:       params.country,
    q:             params.query ?? "",
    search_type:   "keyword_unordered",
    media_type:    "all",
  })
  return `${base}?${sp.toString()}`
}

const APIFY_BASE = "https://api.apify.com/v2"
const PAGE_SIZE  = 24

function buildApifyInput(params: {
  query?: string; pageId?: string; country: string; status: string; count: number
}) {
  const url = buildAdLibraryUrl({ query: params.query, pageId: params.pageId, country: params.country, status: params.status })
  return {
    urls:                         [{ url }],
    count:                        params.count,
    scrapeAdDetails:              false,
    "scrapePageAds.activeStatus": params.status.toLowerCase(),
    "scrapePageAds.countryCode":  params.country,
    "scrapePageAds.sortBy":       "impressions_desc",
    "scrapePageAds.period":       "",
  }
}

export async function startMetaAdsSearch(params: {
  query?: string
  pageId?: string
  country?: string
  status?: "ALL" | "ACTIVE" | "INACTIVE"
}): Promise<{ runId: string; datasetId: string }> {
  await assertAuth()
  const token   = process.env.APIFY_API_TOKEN
  if (!token) throw new Error("APIFY_API_TOKEN no configurado")

  const country = params.country ?? "MX"
  const status  = params.status  ?? "ALL"
  const input   = buildApifyInput({ ...params, country, status, count: 100 })

  const res = await fetch(`${APIFY_BASE}/acts/${APIFY_ACTOR}/runs?token=${token}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(input),
    cache:   "no-store",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err?.error?.message ?? `Apify error ${res.status}`)
  }
  const { data } = await res.json() as { data: { id: string; defaultDatasetId: string } }
  return { runId: data.id, datasetId: data.defaultDatasetId }
}

export async function getMetaAdsRunStatus(runId: string): Promise<{
  status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT"
  itemCount: number
}> {
  await assertAuth()
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error("APIFY_API_TOKEN no configurado")

  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Apify poll error ${res.status}`)
  const { data } = await res.json() as { data: { status: string; stats?: { itemCount?: number } } }
  return {
    status:    data.status as "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT",
    itemCount: data.stats?.itemCount ?? 0,
  }
}

export async function getMetaAdsDatasetPage(
  datasetId: string,
  offset: number,
  limit = PAGE_SIZE,
): Promise<MetaAdResult[]> {
  await assertAuth()
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error("APIFY_API_TOKEN no configurado")

  const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&offset=${offset}&limit=${limit}&clean=true`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Dataset fetch error ${res.status}`)
  const data = await res.json()
  return (Array.isArray(data) ? data : []) as MetaAdResult[]
}

export async function searchMetaAds(params: {
  query?: string
  pageId?: string
  country?: string
  status?: "ALL" | "ACTIVE" | "INACTIVE"
  limit?: number
}): Promise<MetaAdResult[]> {
  await assertAuth()
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error("APIFY_API_TOKEN no configurado")

  const country = params.country ?? "MX"
  const status  = params.status  ?? "ALL"
  const input   = buildApifyInput({ ...params, country, status, count: params.limit ?? 24 })

  const res = await fetch(
    `${APIFY_BASE}/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(input),
      cache:   "no-store",
    }
  )
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err: any = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Apify error ${res.status}`)
  }
  const data = await res.json()
  return (Array.isArray(data) ? data : []) as MetaAdResult[]
}

// ── Apify — Instagram organic posts ──────────────────────────────

const IG_ACTOR = "apify~instagram-post-scraper"

/**
 * Runs synchronously (no run+poll needed — unlike the Meta ads library
 * scraper, this actor returns its full result set in one call) and
 * returns raw dataset items straight from Apify.
 */
export async function searchOrganicPosts(params: {
  username: string
  limit?: number
}): Promise<InstagramPostResult[]> {
  await assertAuth()
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error("APIFY_API_TOKEN no configurado")

  const handle = params.username.trim().replace(/^@/, "")
  if (!handle) throw new Error("Falta el usuario de Instagram")

  const input = {
    username:      [handle],
    resultsLimit:  params.limit ?? 24,
    dataDetailLevel: "detailedData",
  }

  const res = await fetch(
    `${APIFY_BASE}/acts/${IG_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(input),
      cache:   "no-store",
    }
  )
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err: any = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Apify error ${res.status}`)
  }
  const data = await res.json()
  return (Array.isArray(data) ? data : []) as InstagramPostResult[]
}

// ── Apify — live account typeahead (real accounts, not just saved ones) ──
//
// Separate from the two scrapers above: those pull ads/posts for an
// already-known page/handle. These two hit lightweight keyword-search
// actors so the Discovery search box can suggest real Facebook Pages /
// Instagram accounts as the admin types, instead of only offering
// previously tracked/saved ones.
//
// Output field names below are defensive (tried against several likely
// casings) because Apify's public store pages only document input
// schemas, not dataset item shapes — verified the *input* fields against
// each actor's real build schema, but the output shape may need a
// one-time adjustment once this runs against live data.

function pickField(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k]
  }
  return null
}

const FB_SEARCH_ACTOR = "apify~facebook-search-scraper"

export async function searchFacebookPageSuggestions(query: string): Promise<AccountSuggestion[]> {
  await assertAuth()
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error("APIFY_API_TOKEN no configurado")

  const q = query.trim()
  if (q.length < 2) return []

  const input = {
    categories: [q],
    resultsLimit: 8,
  }

  const res = await fetch(
    `${APIFY_BASE}/acts/${FB_SEARCH_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(input),
      cache:   "no-store",
      signal:  AbortSignal.timeout(20_000),
    }
  )
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err: any = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Apify error ${res.status}`)
  }
  const data = await res.json()
  const items = Array.isArray(data) ? data : []

  return items.map((raw): AccountSuggestion => {
    const item = raw as Record<string, unknown>
    return {
      id:        String(pickField(item, ["pageId", "page_id", "id", "facebookId"]) ?? pickField(item, ["url", "pageUrl"]) ?? ""),
      name:      String(pickField(item, ["title", "name", "pageName", "page_name"]) ?? "Sin nombre"),
      handle:    null,
      thumbnail: (pickField(item, ["profilePhoto", "photoUrl", "photo_url", "avatar", "imageUrl", "profilePicture"]) as string | null) ?? null,
      url:       (pickField(item, ["pageUrl", "url", "link", "facebookUrl"]) as string | null) ?? null,
      isVerified: !!pickField(item, ["isVerified", "verified"]),
    }
  }).filter((s) => s.name !== "Sin nombre" || s.url)
}

const IG_SEARCH_ACTOR = "data-slayer~instagram-search-users"

export async function searchInstagramAccountSuggestions(query: string): Promise<AccountSuggestion[]> {
  await assertAuth()
  const token = process.env.APIFY_API_TOKEN
  if (!token) throw new Error("APIFY_API_TOKEN no configurado")

  const q = query.trim().replace(/^@/, "")
  if (q.length < 2) return []

  const input = {
    query: q,
    mode: "basic",
    maxItems: 8,
  }

  const res = await fetch(
    `${APIFY_BASE}/acts/${IG_SEARCH_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(input),
      cache:   "no-store",
      signal:  AbortSignal.timeout(20_000),
    }
  )
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err: any = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Apify error ${res.status}`)
  }
  const data = await res.json()
  const items = Array.isArray(data) ? data : []

  return items.map((raw): AccountSuggestion => {
    const item = raw as Record<string, unknown>
    const username = String(pickField(item, ["username"]) ?? "")
    return {
      id:        String(pickField(item, ["id", "userId", "user_id", "pk"]) ?? username),
      name:      String(pickField(item, ["fullName", "full_name", "name"]) ?? username),
      handle:    username || null,
      thumbnail: (pickField(item, ["profilePicUrl", "profile_pic_url", "profilePicture"]) as string | null) ?? null,
      url:       username ? `https://instagram.com/${username}` : null,
      isVerified: !!pickField(item, ["isVerified", "is_verified"]),
    }
  }).filter((s) => s.handle)
}

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

function revalidate() {
  revalidatePath("/ad-lab")
  revalidatePath("/ad-lab/brands")
  revalidatePath("/ad-lab/boards")
  revalidatePath("/ad-lab/discovery")
}

// ── Tracked Brands ────────────────────────────────────────────────

export async function getTrackedBrands(customerId?: string): Promise<TrackedBrand[]> {
  const { supabase } = await assertAuth()
  let query = supabase
    .from("tracked_brands")
    .select("*, customer:customers(id, name, company)")
    .order("created_at", { ascending: false })
  if (customerId) query = query.eq("customer_id", customerId)
  const { data } = await query
  return (data ?? []) as TrackedBrand[]
}

export async function addTrackedBrand(formData: FormData): Promise<TrackedBrand> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase
    .from("tracked_brands")
    .insert({
      customer_id:      (formData.get("customer_id") as string | null) || null,
      name:             (formData.get("name") as string).trim(),
      meta_page_id:     (formData.get("meta_page_id") as string)?.trim() || null,
      instagram_handle: (formData.get("instagram_handle") as string)?.trim().replace(/^@/, "") || null,
      page_url:         (formData.get("page_url") as string)?.trim() || null,
      notes:            (formData.get("notes") as string)?.trim() || null,
      created_by:       user.id,
    })
    .select("*, customer:customers(id, name, company)")
    .single()
  if (error) throw error
  revalidate()
  return data as TrackedBrand
}

export async function updateTrackedBrand(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("tracked_brands")
    .update({
      name:             (formData.get("name") as string).trim(),
      meta_page_id:     (formData.get("meta_page_id") as string)?.trim() || null,
      instagram_handle: (formData.get("instagram_handle") as string)?.trim().replace(/^@/, "") || null,
      page_url:         (formData.get("page_url") as string)?.trim() || null,
      notes:            (formData.get("notes") as string)?.trim() || null,
    })
    .eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deleteTrackedBrand(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("tracked_brands").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

// ── Saved Ads ─────────────────────────────────────────────────────

export async function getSavedAds(): Promise<SavedAd[]> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("saved_ads")
    .select("*")
    .order("created_at", { ascending: false })
  return (data ?? []) as SavedAd[]
}

export async function saveAd(adData: {
  ad_archive_id: string
  page_id: string
  page_name: string
  body: string | null
  image_url: string | null
  video_url: string | null
  snapshot_url: string | null
  start_date: string | null
  end_date: string | null
  status: "active" | "inactive" | null
  platforms: string[]
  spend_lower: number | null
  spend_upper: number | null
  impressions_lower: number | null
  impressions_upper: number | null
  currency: string
  ad_snapshot?: unknown   // full MetaAdResult — frozen at save time
}): Promise<SavedAd> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase
    .from("saved_ads")
    .upsert({ ...adData, created_by: user.id }, { onConflict: "ad_archive_id" })
    .select()
    .single()
  if (error) throw error

  // Persist full snapshot on first save (skip if already stored — frozen in time)
  if (!data.ad_snapshot && adData.ad_snapshot) {
    await supabase.from("saved_ads").update({ ad_snapshot: adData.ad_snapshot }).eq("id", data.id)
    data.ad_snapshot = adData.ad_snapshot
  }

  // Mirror media to Storage on first save (skip if already cached)
  const needsImage = !data.cached_image_url && adData.image_url
  const needsVideo = !data.cached_video_url && adData.video_url

  if (needsImage || needsVideo) {
    const updates: Record<string, string> = {}

    if (needsImage) {
      const ext = (adData.image_url!.split("?")[0].split(".").pop() ?? "jpg").slice(0, 4)
      const url = await mirrorToStorage(
        supabase,
        adData.image_url!,
        `${data.id}/image.${ext}`,
        20,            // 20 MB max for images
      )
      if (url) updates.cached_image_url = url
    }

    if (needsVideo) {
      const ext = (adData.video_url!.split("?")[0].split(".").pop() ?? "mp4").slice(0, 4)
      const url = await mirrorToStorage(
        supabase,
        adData.video_url!,
        `${data.id}/video.${ext}`,
        150,           // 150 MB max for videos
      )
      if (url) updates.cached_video_url = url
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("saved_ads").update(updates).eq("id", data.id)
      Object.assign(data, updates)
    }
  }

  revalidate()
  return data as SavedAd
}

/**
 * Saves an organic Instagram post as a saved_ads row (post_type =
 * "organic_post"). Mirrors saveAd()'s upsert + storage-mirror pattern —
 * single image/video posts use image_url/video_url like a normal saved
 * ad; carousel ("Sidecar") posts additionally populate
 * carousel_image_urls, mirrored to cached_carousel_image_urls.
 */
export async function saveOrganicPost(post: InstagramPostResult): Promise<SavedAd> {
  const { supabase, user } = await assertAuth()

  const isCarousel   = post.type === "Sidecar" && (post.images?.length ?? 0) > 0
  const primaryImage = isCarousel ? (post.images?.[0] ?? post.displayUrl ?? null) : (post.displayUrl ?? null)

  const row = {
    ad_archive_id:  null,
    external_id:    post.shortCode || post.id,
    page_id:        post.ownerId || post.ownerUsername || "unknown",
    page_name:       post.ownerFullName || post.ownerUsername || "Instagram",
    body:           post.caption || null,
    image_url:      primaryImage,
    video_url:      post.videoUrl || null,
    post_type:      "organic_post" as const,
    caption:        post.caption || null,
    likes_count:    post.likesCount ?? null,
    comments_count: post.commentsCount ?? null,
    post_url:       post.url || null,
    posted_at:      post.timestamp || null,
    carousel_image_urls: isCarousel ? (post.images ?? []) : [],
    currency:       "",
    platforms:      ["instagram"],
    created_by:     user.id,
  }

  const { data, error } = await supabase
    .from("saved_ads")
    .upsert(row, { onConflict: "external_id" })
    .select()
    .single()
  if (error) throw error

  // Mirror media to Storage on first save (skip if already cached)
  const updates: Record<string, unknown> = {}

  if (!data.cached_image_url && row.image_url) {
    const ext = (row.image_url.split("?")[0].split(".").pop() ?? "jpg").slice(0, 4)
    const url = await mirrorToStorage(supabase, row.image_url, `${data.id}/image.${ext}`, 20)
    if (url) updates.cached_image_url = url
  }
  if (!data.cached_video_url && row.video_url) {
    const ext = (row.video_url.split("?")[0].split(".").pop() ?? "mp4").slice(0, 4)
    const url = await mirrorToStorage(supabase, row.video_url, `${data.id}/video.${ext}`, 150)
    if (url) updates.cached_video_url = url
  }
  if (isCarousel && (!data.cached_carousel_image_urls || data.cached_carousel_image_urls.length === 0)) {
    const mirrored: string[] = []
    for (let i = 0; i < row.carousel_image_urls.length; i++) {
      const src = row.carousel_image_urls[i]
      const ext = (src.split("?")[0].split(".").pop() ?? "jpg").slice(0, 4)
      const url = await mirrorToStorage(supabase, src, `${data.id}/carousel-${i}.${ext}`, 20)
      mirrored.push(url ?? src)
    }
    updates.cached_carousel_image_urls = mirrored
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from("saved_ads").update(updates).eq("id", data.id)
    Object.assign(data, updates)
  }

  revalidate()
  return data as SavedAd
}

export async function deleteSavedAd(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("saved_ads").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

// ── Upload local asset as synthetic saved_ad ──────────────────────

export async function saveUploadedAdRecord(
  publicUrl: string,
  name: string,
  isVideo: boolean,
  boardId?: string,
  thumbnailUrl?: string,
): Promise<SavedAd> {
  const { supabase, user } = await assertAuth()

  const uuid = crypto.randomUUID()
  const row: Record<string, unknown> = {
    ad_archive_id: `upload_${uuid}`,
    page_id:       "upload",
    page_name:     name,
    source:        "upload",
    created_by:    user.id,
    platforms:     [],
    currency:      "",
  }
  if (isVideo) {
    row.video_url        = publicUrl
    row.cached_video_url = publicUrl
    if (thumbnailUrl) {
      row.image_url        = thumbnailUrl
      row.cached_image_url = thumbnailUrl
    }
  } else {
    row.image_url        = publicUrl
    row.cached_image_url = publicUrl
  }

  const { data, error } = await supabase.from("saved_ads").insert(row).select().single()
  if (error) throw error

  if (boardId) {
    await supabase.from("board_ads").insert({ board_id: boardId, saved_ad_id: data.id })
  }

  revalidate()
  return data as SavedAd
}

export async function uploadAdAsset(formData: FormData, boardId?: string): Promise<SavedAd> {
  const { supabase, user } = await assertAuth()

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) throw new Error("No se proporcionó archivo")

  const isVideo = file.type.startsWith("video/")
  const rawName = (formData.get("name") as string | null)?.trim()
  const name    = rawName || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")

  // Upload to Storage
  const uuid = crypto.randomUUID()
  const ext  = (file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg")).slice(0, 4)
  const path = `uploads/${uuid}/${isVideo ? "video" : "image"}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabase.storage
    .from("ad-lab")
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadError) throw new Error(`Error al subir archivo: ${uploadError.message}`)

  const { data: { publicUrl } } = supabase.storage.from("ad-lab").getPublicUrl(path)

  const row: Record<string, unknown> = {
    ad_archive_id: `upload_${uuid}`,
    page_id:       "upload",
    page_name:     name,
    source:        "upload",
    created_by:    user.id,
    platforms:     [],
    currency:      "",
  }
  if (isVideo) {
    row.video_url        = publicUrl
    row.cached_video_url = publicUrl
  } else {
    row.image_url        = publicUrl
    row.cached_image_url = publicUrl
  }

  const { data, error } = await supabase.from("saved_ads").insert(row).select().single()
  if (error) throw error

  if (boardId) {
    await supabase.from("board_ads").insert({ board_id: boardId, saved_ad_id: data.id })
  }

  revalidate()
  return data as SavedAd
}

// ── Boards ────────────────────────────────────────────────────────

export async function getBoards(): Promise<AdBoard[]> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("ad_boards")
    .select("*, cover_ad:saved_ads!cover_ad_id(id, image_url, cached_image_url, page_name)")
    .order("created_at", { ascending: false })
  // Attach ad count
  const boardIds = (data ?? []).map((b) => b.id)
  if (boardIds.length === 0) return []
  const [{ data: counts }, { data: previewRows }] = await Promise.all([
    supabase
      .from("board_ads")
      .select("board_id")
      .in("board_id", boardIds),
    // Fetch up to 4 preview thumbnails per board for the collage
    supabase
      .from("board_ads")
      .select("board_id, saved_ad:saved_ads(id, cached_image_url, image_url)")
      .in("board_id", boardIds)
      .order("added_at", { ascending: false }),
  ])
  const countMap: Record<string, number> = {}
  for (const row of counts ?? []) {
    countMap[row.board_id] = (countMap[row.board_id] ?? 0) + 1
  }

  const previewMap: Record<string, Pick<SavedAd, "id" | "cached_image_url" | "image_url">[]> = {}
  for (const row of previewRows ?? []) {
    const ad = row.saved_ad as unknown as Pick<SavedAd, "id" | "cached_image_url" | "image_url"> | null
    if (!ad) continue
    if (!previewMap[row.board_id]) previewMap[row.board_id] = []
    if (previewMap[row.board_id].length < 4) previewMap[row.board_id].push(ad)
  }

  return (data ?? []).map((b) => ({
    ...b,
    ad_count:    countMap[b.id] ?? 0,
    preview_ads: previewMap[b.id] ?? [],
  })) as AdBoard[]
}

export async function getBoardAds(boardId: string): Promise<SavedAd[]> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("board_ads")
    .select("saved_ad:saved_ads(*)")
    .eq("board_id", boardId)
    .order("added_at", { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []).map((r: any) => r.saved_ad).filter(Boolean)) as SavedAd[]
}

// Public, unauthenticated — the read-only moodboard share page.
// No spend/likes/caption/action surface, just the board + its saved
// images/videos, so no need to select more than that.
export async function getBoardByToken(token: string): Promise<{ board: AdBoard; ads: SavedAd[] } | null> {
  const supabase = createAdminClient()
  const { data: board } = await supabase
    .from("ad_boards")
    .select("*")
    .eq("share_token", token)
    .single()
  if (!board) return null

  const { data: adRows } = await supabase
    .from("board_ads")
    .select("saved_ad:saved_ads(*)")
    .eq("board_id", board.id)
    .order("added_at", { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ads = ((adRows ?? []).map((r: any) => r.saved_ad).filter(Boolean)) as SavedAd[]

  return { board: board as AdBoard, ads }
}

export async function createBoard(formData: FormData): Promise<AdBoard> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase
    .from("ad_boards")
    .insert({
      name:        (formData.get("name") as string).trim(),
      description: (formData.get("description") as string)?.trim() || null,
      created_by:  user.id,
    })
    .select()
    .single()
  if (error) throw error
  revalidate()
  return { ...data, ad_count: 0 } as AdBoard
}

export async function updateBoard(id: string, formData: FormData): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("ad_boards")
    .update({
      name:        (formData.get("name") as string).trim(),
      description: (formData.get("description") as string)?.trim() || null,
    })
    .eq("id", id)
  if (error) throw error
  revalidate()
}

export async function deleteBoard(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("ad_boards").delete().eq("id", id)
  if (error) throw error
  revalidate()
}

export async function addAdToBoard(boardId: string, savedAdId: string): Promise<void> {
  const { supabase, user } = await assertAuth()
  const { error } = await supabase
    .from("board_ads")
    .upsert({ board_id: boardId, saved_ad_id: savedAdId, added_by: user.id },
             { onConflict: "board_id,saved_ad_id" })
  if (error) throw error
  revalidate()
}

export async function removeAdFromBoard(boardId: string, savedAdId: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("board_ads")
    .delete()
    .eq("board_id", boardId)
    .eq("saved_ad_id", savedAdId)
  if (error) throw error
  revalidate()
}

// ── Client Creative Context ───────────────────────────────────────

export async function getClientCreativeContext(customerId: string): Promise<ClientCreativeContext | null> {
  const { supabase } = await assertAuth()
  const { data } = await supabase
    .from("client_creative_context")
    .select("*")
    .eq("customer_id", customerId)
    .single()
  return data as ClientCreativeContext | null
}

export async function upsertClientCreativeContext(
  customerId: string,
  formData: FormData
): Promise<void> {
  const { supabase, user } = await assertAuth()
  const { error } = await supabase
    .from("client_creative_context")
    .upsert({
      customer_id:          customerId,
      brand_name:           (formData.get("brand_name") as string)?.trim() || null,
      brand_voice:          (formData.get("brand_voice") as string)?.trim() || null,
      product_description:  (formData.get("product_description") as string)?.trim() || null,
      target_audience:      (formData.get("target_audience") as string)?.trim() || null,
      key_differentiators:  (formData.get("key_differentiators") as string)?.trim() || null,
      content_restrictions: (formData.get("content_restrictions") as string)?.trim() || null,
      updated_at:           new Date().toISOString(),
      updated_by:           user.id,
    }, { onConflict: "customer_id" })
  if (error) throw error
  revalidatePath("/ad-lab")
}
