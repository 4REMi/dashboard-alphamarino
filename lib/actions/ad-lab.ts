"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { TrackedBrand, SavedAd, AdBoard, ClientCreativeContext, MetaAdResult } from "@/lib/types"

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

  const url = buildAdLibraryUrl({ query: params.query, pageId: params.pageId, country, status })

  const input = {
    urls:                         [{ url }],
    count:                        params.limit ?? 24,
    scrapeAdDetails:              false,
    "scrapePageAds.activeStatus": status.toLowerCase(),
    "scrapePageAds.countryCode":  country,
    "scrapePageAds.sortBy":       "impressions_desc",
    "scrapePageAds.period":       "",
  }

  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`,
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
      customer_id:  formData.get("customer_id") as string,
      name:         (formData.get("name") as string).trim(),
      meta_page_id: (formData.get("meta_page_id") as string)?.trim() || null,
      page_url:     (formData.get("page_url") as string)?.trim() || null,
      notes:        (formData.get("notes") as string)?.trim() || null,
      created_by:   user.id,
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
      name:         (formData.get("name") as string).trim(),
      meta_page_id: (formData.get("meta_page_id") as string)?.trim() || null,
      page_url:     (formData.get("page_url") as string)?.trim() || null,
      notes:        (formData.get("notes") as string)?.trim() || null,
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

export async function deleteSavedAd(id: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("saved_ads").delete().eq("id", id)
  if (error) throw error
  revalidate()
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
  const { data: counts } = await supabase
    .from("board_ads")
    .select("board_id")
    .in("board_id", boardIds)
  const countMap: Record<string, number> = {}
  for (const row of counts ?? []) {
    countMap[row.board_id] = (countMap[row.board_id] ?? 0) + 1
  }
  return (data ?? []).map((b) => ({ ...b, ad_count: countMap[b.id] ?? 0 })) as AdBoard[]
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
