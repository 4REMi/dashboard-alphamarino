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
  date_start: string
  date_stop: string
}

// Returns { since, until } for a cycle_month ISO string ("YYYY-MM-01")
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

function pickResults(actions: MetaInsightRow["actions"]): { results: number | null; results_type: string | null } {
  if (!actions?.length) return { results: null, results_type: null }
  // Prefer lead, then purchase, then landing_page_view
  const priority = ["lead", "purchase", "offsite_conversion.fb_pixel_purchase", "landing_page_view"]
  for (const t of priority) {
    const hit = actions.find((a) => a.action_type === t)
    if (hit) return { results: Number(hit.value), results_type: t }
  }
  // Fall back to first action
  return { results: Number(actions[0].value), results_type: actions[0].action_type }
}

export async function syncMetaCampaigns(projectId: string, cycleId: string): Promise<{ synced: number; error?: string }> {
  const supabase = await createClient()

  // Fetch credentials + cycle_month
  const [contextResult, cycleResult] = await Promise.all([
    supabase.from("paid_media_context").select("meta_ad_account_id, meta_access_token").eq("project_id", projectId).single(),
    supabase.from("paid_media_cycles").select("cycle_month").eq("id", cycleId).single(),
  ])

  if (contextResult.error || !contextResult.data) return { synced: 0, error: "No se encontró contexto de Meta" }
  if (cycleResult.error || !cycleResult.data) return { synced: 0, error: "No se encontró el ciclo" }

  const { meta_ad_account_id, meta_access_token } = contextResult.data
  if (!meta_ad_account_id || !meta_access_token) {
    return { synced: 0, error: "Configura el Ad Account ID y el Access Token en el contexto de cuenta" }
  }

  const { since, until } = cycleRange(cycleResult.data.cycle_month)
  const fields = "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,reach,actions"
  const timeRange = JSON.stringify({ since, until })

  const url = new URL(`${META_BASE}/act_${meta_ad_account_id}/insights`)
  url.searchParams.set("level", "campaign")
  url.searchParams.set("fields", fields)
  url.searchParams.set("time_range", timeRange)
  url.searchParams.set("access_token", meta_access_token)
  url.searchParams.set("limit", "100")

  let res: Response
  try {
    res = await fetch(url.toString(), { cache: "no-store" })
  } catch {
    return { synced: 0, error: "Error de red al conectar con Meta" }
  }

  const json = await res.json()

  if (json.error) {
    return { synced: 0, error: `Meta API: ${json.error.message}` }
  }

  const rows: MetaInsightRow[] = json.data ?? []
  if (!rows.length) return { synced: 0 }

  const upsertRows = rows.map((row) => {
    const { results, results_type } = pickResults(row.actions)
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
      date_start: row.date_start || null,
      date_stop: row.date_stop || null,
      synced_at: new Date().toISOString(),
    }
  })

  const { error: upsertError } = await supabase
    .from("meta_campaigns")
    .upsert(upsertRows, { onConflict: "project_id,cycle_id,campaign_id" })

  if (upsertError) return { synced: 0, error: upsertError.message }

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
