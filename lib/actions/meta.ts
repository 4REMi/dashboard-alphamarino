"use server"

import { createClient } from "@/lib/supabase/server"
import type { MetaCampaign } from "@/lib/types"

const META_API_VERSION = "v21.0"
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`

interface MetaInsightRow {
  campaign_id: string
  campaign_name: string
  spend: string
  impressions: string
  clicks: string
  ctr: string
  cpc: string
  cpm: string
  reach: string
  actions?: Array<{ action_type: string; value: string }>
  action_values?: Array<{ action_type: string; value: string }>
  date_start: string
  date_stop: string
}

function cycleRange(cycleMonth: string): { since: string; until: string } {
  const d = new Date(cycleMonth + "T00:00:00")
  const year = d.getFullYear()
  const month = d.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    since: `${year}-${pad(month + 1)}-01`,
    until: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  }
}

// Maps a campaign's objective to the action_type(s) Meta itself counts as
// "Results" for that objective in Ads Manager — ordered by which key actually
// shows up depending on pixel/CAPI/catalog setup. Covers both the current
// OUTCOME_* objectives and the legacy pre-2022 objective enum, since older
// ad accounts can still return either.
const OBJECTIVE_ACTION_TYPES: Record<string, string[]> = {
  OUTCOME_SALES:        ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  CONVERSIONS:          ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  PRODUCT_CATALOG_SALES:["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  OUTCOME_LEADS:        ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  LEAD_GENERATION:      ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  OUTCOME_TRAFFIC:      ["link_click", "landing_page_view"],
  LINK_CLICKS:          ["link_click", "landing_page_view"],
  OUTCOME_ENGAGEMENT:   ["post_engagement", "page_engagement"],
  POST_ENGAGEMENT:      ["post_engagement", "page_engagement"],
  MESSAGES:             ["onsite_conversion.messaging_conversation_started_7d"],
  OUTCOME_APP_PROMOTION:["mobile_app_install", "app_install"],
  APP_INSTALLS:         ["mobile_app_install", "app_install"],
  VIDEO_VIEWS:          ["video_view"],
  STORE_VISITS:         ["store_visit"],
}

// Fallback used only when the objective isn't known/mapped — same generic
// priority as before, better than grabbing an arbitrary first action.
const FALLBACK_PRIORITY = ["lead", "purchase", "offsite_conversion.fb_pixel_purchase", "landing_page_view"]

function pickResults(
  actions: MetaInsightRow["actions"],
  objective: string | null,
): { results: number | null; results_type: string | null } {
  if (!actions?.length) return { results: null, results_type: null }

  const candidates = (objective && OBJECTIVE_ACTION_TYPES[objective]) || []
  for (const t of candidates) {
    const hit = actions.find((a) => a.action_type === t)
    if (hit) return { results: Number(hit.value), results_type: t }
  }

  // Objective unmapped, or none of its expected action types are present
  // (e.g. no pixel firing yet) — fall back to the generic heuristic.
  for (const t of FALLBACK_PRIORITY) {
    const hit = actions.find((a) => a.action_type === t)
    if (hit) return { results: Number(hit.value), results_type: t }
  }
  return { results: Number(actions[0].value), results_type: actions[0].action_type }
}

// ROAS only makes sense for campaigns actually optimizing for sales — for
// any other objective there's no purchase value to compare spend against.
const SALES_OBJECTIVES = new Set(["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES"])

function pickPurchaseValue(
  actionValues: MetaInsightRow["action_values"],
  objective: string | null,
): number | null {
  if (!objective || !SALES_OBJECTIVES.has(objective) || !actionValues?.length) return null
  const candidates = OBJECTIVE_ACTION_TYPES.OUTCOME_SALES
  for (const t of candidates) {
    const hit = actionValues.find((a) => a.action_type === t)
    if (hit) return Number(hit.value)
  }
  return null
}

export interface MetaAdAccount {
  id: string
  account_id: string
  name: string
  business_name: string | null
  account_status: number
}

export async function getMetaAdAccounts(): Promise<{ accounts: MetaAdAccount[]; error?: string }> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken) return { accounts: [], error: "META_SYSTEM_USER_TOKEN no configurado" }

  const url = new URL(`${META_BASE}/me/adaccounts`)
  url.searchParams.set("fields", "name,account_id,account_status,business_name")
  url.searchParams.set("limit", "200")
  url.searchParams.set("access_token", accessToken)

  try {
    const res = await fetch(url.toString(), { cache: "no-store" })
    const json = await res.json()
    if (json.error) return { accounts: [], error: `Meta API: ${json.error.message}` }
    const accounts: MetaAdAccount[] = (json.data ?? []).map((a: any) => ({
      id: a.id,
      account_id: a.account_id.replace(/^act_/, ""),
      name: a.name ?? a.account_id,
      business_name: a.business_name ?? null,
      account_status: a.account_status ?? 0,
    }))
    return { accounts }
  } catch {
    return { accounts: [], error: "Error de red al conectar con Meta" }
  }
}

export async function syncMetaCampaigns(projectId: string, cycleId: string): Promise<{ synced: number; error?: string }> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken) return { synced: 0, error: "META_SYSTEM_USER_TOKEN no está configurado en el servidor" }

  const supabase = await createClient()

  const [integrationResult, cycleResult] = await Promise.all([
    supabase.from("project_integrations").select("account_id").eq("project_id", projectId).eq("platform", "meta").maybeSingle(),
    supabase.from("paid_media_cycles").select("cycle_month").eq("id", cycleId).single(),
  ])

  if (cycleResult.error || !cycleResult.data) return { synced: 0, error: "No se encontró el ciclo" }

  const meta_ad_account_id = integrationResult.data?.account_id
  if (!meta_ad_account_id) {
    return { synced: 0, error: "Configura el Ad Account ID de Meta en Conexiones" }
  }

  const { since, until } = cycleRange(cycleResult.data.cycle_month)
  const fields = "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values"

  const url = new URL(`${META_BASE}/act_${meta_ad_account_id}/insights`)
  url.searchParams.set("level", "campaign")
  url.searchParams.set("fields", fields)
  url.searchParams.set("time_range", JSON.stringify({ since, until }))
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("limit", "100")

  // Campaign status and objective aren't valid insights fields — fetch them
  // separately from the campaigns list and merge by id. The objective is what
  // lets us pick the actual "Results" action type instead of guessing.
  const statusUrl = new URL(`${META_BASE}/act_${meta_ad_account_id}/campaigns`)
  statusUrl.searchParams.set("fields", "id,effective_status,objective")
  statusUrl.searchParams.set("access_token", accessToken)
  statusUrl.searchParams.set("limit", "300")

  let res: Response, statusRes: Response
  try {
    ;[res, statusRes] = await Promise.all([
      fetch(url.toString(), { cache: "no-store" }),
      fetch(statusUrl.toString(), { cache: "no-store" }),
    ])
  } catch {
    return { synced: 0, error: "Error de red al conectar con Meta" }
  }

  const json = await res.json()
  if (json.error) return { synced: 0, error: `Meta API: ${json.error.message}` }

  const statusJson = await statusRes.json()
  const statusById = new Map<string, string>(
    (statusJson.data ?? []).map((c: { id: string; effective_status: string }) => [c.id, c.effective_status])
  )
  const objectiveById = new Map<string, string>(
    (statusJson.data ?? []).map((c: { id: string; objective?: string }) => [c.id, c.objective ?? ""])
  )

  const rows: MetaInsightRow[] = json.data ?? []
  if (!rows.length) return { synced: 0 }

  const upsertRows = rows.map((row) => {
    const objective = objectiveById.get(row.campaign_id) ?? null
    const { results, results_type } = pickResults(row.actions, objective)
    return {
      project_id: projectId,
      cycle_id: cycleId,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name || null,
      spend: row.spend ? Number(row.spend) : null,
      impressions: row.impressions ? Number(row.impressions) : null,
      clicks: row.clicks ? Number(row.clicks) : null,
      ctr: row.ctr ? Number(row.ctr) : null,
      cpc: row.cpc ? Number(row.cpc) : null,
      cpm: row.cpm ? Number(row.cpm) : null,
      reach: row.reach ? Number(row.reach) : null,
      results,
      results_type,
      purchase_value: pickPurchaseValue(row.action_values, objective),
      status: statusById.get(row.campaign_id) ?? null,
      date_start: row.date_start || null,
      date_stop: row.date_stop || null,
      synced_at: new Date().toISOString(),
    }
  })

  const { error: upsertError } = await supabase
    .from("meta_campaigns")
    .upsert(upsertRows, { onConflict: "project_id,cycle_id,campaign_id" })

  if (upsertError) return { synced: 0, error: upsertError.message }

  await supabase.from("projects").update({ last_activity_at: new Date().toISOString() }).eq("id", projectId).then(() => {})

  return { synced: upsertRows.length }
}

export async function getMetaCampaigns(projectId: string, cycleId: string): Promise<MetaCampaign[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_campaigns")
    .select("*")
    .eq("project_id", projectId)
    .eq("cycle_id", cycleId)
    .order("spend", { ascending: false })
  if (error) return []
  return data ?? []
}

// ── Ads Manager-style drill-down (Campaign → Ad Set → Ad/creative) ─────────
// Fetched live from Meta on demand when the user expands a row — nothing
// here is persisted, this is just a lightweight browsing view.

export interface MetaAdSetSummary {
  id: string
  name: string
  status: string | null
}

export async function getMetaAdSets(campaignId: string): Promise<{ adSets: MetaAdSetSummary[]; error?: string }> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken) return { adSets: [], error: "META_SYSTEM_USER_TOKEN no configurado" }

  const url = new URL(`${META_BASE}/${campaignId}/adsets`)
  url.searchParams.set("fields", "id,name,effective_status")
  url.searchParams.set("limit", "100")
  url.searchParams.set("access_token", accessToken)

  try {
    const res = await fetch(url.toString(), { cache: "no-store" })
    const json = await res.json()
    if (json.error) return { adSets: [], error: `Meta API: ${json.error.message}` }
    const adSets: MetaAdSetSummary[] = (json.data ?? []).map((a: any) => ({
      id: a.id,
      name: a.name ?? a.id,
      status: a.effective_status ?? null,
    }))
    return { adSets }
  } catch {
    return { adSets: [], error: "Error de red al conectar con Meta" }
  }
}

export interface MetaAdCreative {
  id: string
  name: string
  status: string | null
  thumbnailUrl: string | null
  imageUrl: string | null
  videoUrl: string | null
  body: string | null
  title: string | null
  cta: string | null
}

export async function getMetaAds(adSetId: string): Promise<{ ads: MetaAdCreative[]; error?: string }> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken) return { ads: [], error: "META_SYSTEM_USER_TOKEN no configurado" }

  const url = new URL(`${META_BASE}/${adSetId}/ads`)
  url.searchParams.set(
    "fields",
    "id,name,effective_status,creative{id,thumbnail_url,image_url,video_id,body,title,call_to_action_type,object_story_spec}"
  )
  url.searchParams.set("limit", "50")
  url.searchParams.set("access_token", accessToken)

  let json: any
  try {
    const res = await fetch(url.toString(), { cache: "no-store" })
    json = await res.json()
    if (json.error) return { ads: [], error: `Meta API: ${json.error.message}` }
  } catch {
    return { ads: [], error: "Error de red al conectar con Meta" }
  }

  const rows = json.data ?? []
  const ads: MetaAdCreative[] = await Promise.all(rows.map(async (a: any) => {
    const creative = a.creative ?? {}
    const story = creative.object_story_spec ?? {}
    const linkData = story.link_data ?? {}
    const videoData = story.video_data ?? {}

    let videoUrl: string | null = null
    const videoId = creative.video_id || videoData.video_id
    if (videoId) {
      try {
        const vUrl = new URL(`${META_BASE}/${videoId}`)
        vUrl.searchParams.set("fields", "source")
        vUrl.searchParams.set("access_token", accessToken)
        const vRes = await fetch(vUrl.toString(), { cache: "no-store" })
        const vJson = await vRes.json()
        videoUrl = vJson.source ?? null
      } catch {
        // no video source available — thumbnail-only preview
      }
    }

    return {
      id: a.id,
      name: a.name ?? a.id,
      status: a.effective_status ?? null,
      thumbnailUrl: creative.thumbnail_url ?? videoData.image_url ?? null,
      imageUrl: creative.image_url ?? linkData.picture ?? null,
      videoUrl,
      body: creative.body ?? linkData.message ?? videoData.message ?? null,
      title: creative.title ?? linkData.name ?? videoData.title ?? null,
      cta: creative.call_to_action_type ?? linkData.call_to_action?.type ?? videoData.call_to_action?.type ?? null,
    }
  }))

  return { ads }
}
