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
  const priority = ["lead", "purchase", "offsite_conversion.fb_pixel_purchase", "landing_page_view"]
  for (const t of priority) {
    const hit = actions.find((a) => a.action_type === t)
    if (hit) return { results: Number(hit.value), results_type: t }
  }
  return { results: Number(actions[0].value), results_type: actions[0].action_type }
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
  const fields = "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,reach,actions"

  const url = new URL(`${META_BASE}/act_${meta_ad_account_id}/insights`)
  url.searchParams.set("level", "campaign")
  url.searchParams.set("fields", fields)
  url.searchParams.set("time_range", JSON.stringify({ since, until }))
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("limit", "100")

  // Campaign status isn't a valid insights field — fetch it separately from
  // the campaigns list and merge by id, so the UI can show which are active.
  const statusUrl = new URL(`${META_BASE}/act_${meta_ad_account_id}/campaigns`)
  statusUrl.searchParams.set("fields", "id,effective_status")
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
