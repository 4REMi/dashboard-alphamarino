"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { TrackedBrand, SavedAd, AdBoard, ClientCreativeContext, MetaAdResult } from "@/lib/types"

// ── Apify — Facebook Ads Library scraper ─────────────────────────

const APIFY_ACTOR = "curious_coder~facebook-ads-library-scraper"

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

  const input: Record<string, unknown> = {
    country:      params.country ?? "MX",
    activeStatus: params.status  ?? "ALL",
    adType:       "ALL",
    limit:        params.limit   ?? 24,
  }
  if (params.pageId) input.pageIds     = [params.pageId]
  else if (params.query) input.queries = [params.query]

  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(input),
      cache:   "no-store",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(({ next: { timeout: 90 } }) as any),
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
}): Promise<SavedAd> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase
    .from("saved_ads")
    .upsert({ ...adData, created_by: user.id }, { onConflict: "ad_archive_id" })
    .select()
    .single()
  if (error) throw error
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
    .select("*, cover_ad:saved_ads!cover_ad_id(id, image_url, page_name)")
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
