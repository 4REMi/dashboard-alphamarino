"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { MetaCampaign, MetaCampaignCreative } from "@/lib/types"

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

// Meta's Insights API rejects any time_range whose `since` is in the future,
// and effectively has nothing to return past today either. Cycles can now
// have arbitrary start/end dates (not just the calendar month), so a cycle
// opened ahead of its actual start date — or simply mid-cycle, where
// end_date is naturally still in the future — needs both ends clamped
// against today rather than sent to Meta as-is.
function cycleRange(cycle: { start_date: string; end_date: string }): { since: string; until: string } {
  const today = new Date().toISOString().split("T")[0]
  const until = cycle.end_date > today ? today : cycle.end_date
  return { since: cycle.start_date, until }
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

// Fallback used only when nada más aplicó — mismo heurístico genérico de
// antes, mejor que agarrar la primera acción a ciegas.
const FALLBACK_PRIORITY = ["lead", "purchase", "offsite_conversion.fb_pixel_purchase", "landing_page_view"]

// El objective de la campaña (OUTCOME_ENGAGEMENT, OUTCOME_LEADS, ...) ya
// NO alcanza para saber qué cuenta como "Resultados" — Meta migró las
// campañas de mensajes (y varias otras) a vivir bajo objetivos genéricos,
// distinguidos solo por el optimization_goal real del ad set (ej. una
// OUTCOME_ENGAGEMENT puede ser "Conversaciones" o "Interacción con la
// publicación" según el ad set, no según la campaña). optimization_goal
// es la misma señal que usa el propio Ads Manager para su columna
// "Resultados", así que se prioriza sobre el objective de la campaña.
const OPTIMIZATION_GOAL_ACTION_TYPES: Record<string, string[]> = {
  CONVERSATIONS:               ["onsite_conversion.messaging_conversation_started_7d"],
  MESSAGING_PURCHASE_CONVERSION: ["onsite_conversion.messaging_purchase_conversion", "onsite_conversion.messaging_conversation_started_7d"],
  MESSAGING_APPOINTMENT_CONVERSION: ["onsite_conversion.messaging_appointment_conversion", "onsite_conversion.messaging_conversation_started_7d"],
  LEAD_GENERATION:             ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  QUALITY_LEAD:                ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  OFFSITE_CONVERSIONS:         ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  VALUE:                       ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  LINK_CLICKS:                 ["link_click", "landing_page_view"],
  LANDING_PAGE_VIEWS:          ["landing_page_view", "link_click"],
  POST_ENGAGEMENT:             ["post_engagement", "page_engagement"],
  PAGE_LIKES:                  ["like", "page_like"],
  APP_INSTALLS:                ["mobile_app_install", "app_install"],
  APP_INSTALLS_AND_OFFSITE_CONVERSIONS: ["mobile_app_install", "app_install", "omni_purchase"],
  THRUPLAY:                    ["video_view"],
  QUALITY_CALL:                ["onsite_conversion.total_call", "onsite_conversion.total_quality_call"],
  SUBSCRIBERS:                 ["subscribe"],
}

// Evento estándar del pixel configurado en el ad set (promoted_object
// .custom_event_type) → nombre base de la acción en insights. Una campaña
// de "Conversiones" puede optimizar para cualquiera de estos, no solo
// compra — antes todas se asumían compra y las demás salían en 0.
const PIXEL_EVENT_ACTION: Record<string, string> = {
  PURCHASE: "purchase",
  LEAD: "lead",
  COMPLETE_REGISTRATION: "complete_registration",
  ADD_TO_CART: "add_to_cart",
  INITIATED_CHECKOUT: "initiate_checkout",
  ADD_PAYMENT_INFO: "add_payment_info",
  CONTENT_VIEW: "view_content",
  SEARCH: "search",
  ADD_TO_WISHLIST: "add_to_wishlist",
  CONTACT: "contact",
  SCHEDULE: "schedule",
  SUBSCRIBE: "subscribe",
  START_TRIAL: "start_trial",
  SUBMIT_APPLICATION: "submit_application",
  FIND_LOCATION: "find_location",
  CUSTOMIZE_PRODUCT: "customize_product",
  DONATE: "donate",
}

interface PromotedObject {
  custom_event_type?: string
  custom_conversion_id?: string
}

// Qué cuenta como "Resultado" para un ad set. La mayoría son acciones
// (conversaciones, leads, compras...), pero Alcance e Impresiones son el
// propio campo de insights, no una acción.
type ResultSpec =
  | { kind: "action"; actionTypes: string[] }
  | { kind: "field"; field: "reach" | "impressions" }

function resolveResultSpec(objective: string | null, optimizationGoal: string | null, promoted: PromotedObject | null): ResultSpec | null {
  if (promoted?.custom_conversion_id) {
    return { kind: "action", actionTypes: [`offsite_conversion.custom.${promoted.custom_conversion_id}`] }
  }
  const isConversionGoal = optimizationGoal === "OFFSITE_CONVERSIONS" || optimizationGoal === "VALUE"
  const event = promoted?.custom_event_type
  if (isConversionGoal && event && event !== "OTHER" && PIXEL_EVENT_ACTION[event]) {
    const base = PIXEL_EVENT_ACTION[event]
    const types = [`omni_${base}`, `offsite_conversion.fb_pixel_${base}`, base]
    if (base === "initiate_checkout") types.unshift("omni_initiated_checkout")
    return { kind: "action", actionTypes: types }
  }
  if (isConversionGoal && event === "OTHER") {
    return { kind: "action", actionTypes: ["offsite_conversion.fb_pixel_custom"] }
  }
  if (optimizationGoal === "REACH") return { kind: "field", field: "reach" }
  if (optimizationGoal === "IMPRESSIONS") return { kind: "field", field: "impressions" }
  const goalTypes = optimizationGoal ? OPTIMIZATION_GOAL_ACTION_TYPES[optimizationGoal] : undefined
  if (goalTypes) return { kind: "action", actionTypes: goalTypes }
  const objectiveTypes = objective ? OBJECTIVE_ACTION_TYPES[objective] : undefined
  if (objectiveTypes) return { kind: "action", actionTypes: objectiveTypes }
  return null
}

function pickResults(
  row: { actions?: MetaInsightRow["actions"]; reach?: string; impressions?: string },
  spec: ResultSpec | null,
): { results: number | null; results_type: string | null } {
  if (spec?.kind === "field") {
    const raw = row[spec.field]
    return { results: raw ? Number(raw) : 0, results_type: spec.field }
  }
  const actions = row.actions ?? []
  if (spec) {
    for (const t of spec.actionTypes) {
      const hit = actions.find((a) => a.action_type === t)
      if (hit) return { results: Number(hit.value), results_type: t }
    }
    // Si ya sabemos cuál es el resultado, un día sin esa acción es un día
    // con 0 — Meta omite la acción en vez de mandarla en 0. Caer al
    // fallback aquí sumaba otra acción de ese día (interacciones,
    // clics...) e inflaba "Resultados" (126 vs 88 reales en mensajes).
    return { results: 0, results_type: spec.actionTypes[0] }
  }
  if (!actions.length) return { results: null, results_type: null }
  // Meta de la campaña desconocida — heurístico genérico.
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
    supabase.from("paid_media_cycles").select("start_date, end_date").eq("id", cycleId).single(),
  ])

  if (cycleResult.error || !cycleResult.data) return { synced: 0, error: "No se encontró el ciclo" }

  const today = new Date().toISOString().split("T")[0]
  if (cycleResult.data.start_date > today) {
    return { synced: 0, error: `Este ciclo empieza el ${cycleResult.data.start_date} — aún no hay datos que sincronizar.` }
  }

  const meta_ad_account_id = integrationResult.data?.account_id
  if (!meta_ad_account_id) {
    return { synced: 0, error: "Configura el Ad Account ID de Meta en Conexiones" }
  }

  const { since, until } = cycleRange(cycleResult.data)
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

  // optimization_goal vive en el ad set, no en la campaña — una campaña
  // ABO puede tener ad sets con distintos objetivos "reales" aunque
  // comparta el mismo objective genérico. Se agrupa por campaign_id y se
  // toma el primero visto (en la práctica casi siempre homogéneo dentro
  // de la misma campaña).
  const adsetsUrl = new URL(`${META_BASE}/act_${meta_ad_account_id}/adsets`)
  adsetsUrl.searchParams.set("fields", "id,campaign_id,optimization_goal")
  adsetsUrl.searchParams.set("access_token", accessToken)
  adsetsUrl.searchParams.set("limit", "500")

  let res: Response, statusRes: Response, adsetsRes: Response
  try {
    ;[res, statusRes, adsetsRes] = await Promise.all([
      fetch(url.toString(), { cache: "no-store" }),
      fetch(statusUrl.toString(), { cache: "no-store" }),
      fetch(adsetsUrl.toString(), { cache: "no-store" }),
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

  const adsetsJson = await adsetsRes.json()
  const optimizationGoalByCampaignId = new Map<string, string>()
  for (const a of (adsetsJson.data ?? []) as { campaign_id: string; optimization_goal?: string }[]) {
    if (a.optimization_goal && !optimizationGoalByCampaignId.has(a.campaign_id)) {
      optimizationGoalByCampaignId.set(a.campaign_id, a.optimization_goal)
    }
  }

  const rows: MetaInsightRow[] = json.data ?? []
  if (!rows.length) return { synced: 0 }

  const upsertRows = rows.map((row) => {
    const objective = objectiveById.get(row.campaign_id) ?? null
    const optimizationGoal = optimizationGoalByCampaignId.get(row.campaign_id) ?? null
    const { results, results_type } = pickResults(row, resolveResultSpec(objective, optimizationGoal, null))
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

// ── Ad-level sync — habilita el hub creative-first ──────────────────────
// A diferencia de syncMetaCampaigns (un rollup por campaña), esto trae una
// fila POR AD POR DÍA (time_increment=1) — la granularidad diaria es lo
// que permite calcular tendencia (día anterior / promedio del ciclo /
// baseline) sin depender de qué tan seguido alguien sincroniza.
interface MetaAdInsightRow {
  ad_id: string
  ad_name: string
  adset_id: string
  adset_name: string
  campaign_id: string
  campaign_name: string
  spend: string
  impressions: string
  clicks: string
  reach?: string
  frequency?: string
  actions?: Array<{ action_type: string; value: string }>
  action_values?: Array<{ action_type: string; value: string }>
  date_start: string
  date_stop: string
}

// Cuenta de una action_type puntual dentro de actions[] — para métricas
// que se muestran SIEMPRE igual sin importar el objetivo/optimization_goal
// de la campaña (a diferencia de "Resultados", que sí depende de eso).
function actionCount(actions: MetaAdInsightRow["actions"], types: string[]): number | null {
  if (!actions?.length) return null
  const hit = actions.find((a) => types.includes(a.action_type))
  return hit ? Number(hit.value) : null
}

// Lista liviana de campañas de la cuenta — para el picker "elegir qué
// campañas sincronizar" antes de traer datos a nivel ad (evita jalar N
// ads de campañas que a nadie le importan, y evita el volumen de golpe
// cuando una cuenta tiene 80+ creativos corriendo).
export async function getMetaCampaignOptions(projectId: string): Promise<{ campaigns: { id: string; name: string; status: string | null }[]; error?: string }> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken) return { campaigns: [], error: "META_SYSTEM_USER_TOKEN no está configurado en el servidor" }

  const supabase = await createClient()
  const { data: integration } = await supabase
    .from("project_integrations").select("account_id").eq("project_id", projectId).eq("platform", "meta").maybeSingle()
  const meta_ad_account_id = integration?.account_id
  if (!meta_ad_account_id) return { campaigns: [], error: "Configura el Ad Account ID de Meta en Conexiones" }

  const url = new URL(`${META_BASE}/act_${meta_ad_account_id}/campaigns`)
  url.searchParams.set("fields", "id,name,effective_status")
  url.searchParams.set("limit", "300")
  url.searchParams.set("access_token", accessToken)

  try {
    const res = await fetch(url.toString(), { cache: "no-store" })
    const json = await res.json()
    if (json.error) return { campaigns: [], error: `Meta API: ${json.error.message}` }
    return { campaigns: (json.data ?? []).map((c: { id: string; name: string; effective_status: string }) => ({ id: c.id, name: c.name, status: c.effective_status ?? null })) }
  } catch {
    return { campaigns: [], error: "Error de red al conectar con Meta" }
  }
}

export async function syncMetaAds(projectId: string, cycleId: string, campaignIds?: string[]): Promise<{ synced: number; error?: string }> {
  return runMetaAdsSync(await createClient(), projectId, cycleId, campaignIds)
}

// Sincronización automática (cron, 3 veces al día) de todos los ciclos
// activos de proyectos activos con Meta conectado. Corre con el cliente
// admin (no hay sesión de usuario en un cron) — por eso exige el
// CRON_SECRET: este archivo es "use server", así que cualquier función
// exportada es invocable desde el cliente.
export async function runScheduledMetaSync(cronSecret: string): Promise<{ synced: number; failed: number }> {
  const expected = process.env.CRON_SECRET
  if (!expected || cronSecret !== expected) throw new Error("unauthorized")

  const admin = createAdminClient()
  const { data: cycles, error } = await admin
    .from("paid_media_cycles")
    .select("id, project_id, project:projects(status)")
    .eq("is_active", true)
  if (error) throw error

  let synced = 0, failed = 0
  for (const cycle of cycles ?? []) {
    const project = cycle.project as unknown as { status: string } | null
    if (!project || project.status !== "Active") continue
    const [{ data: integration }, { data: context }] = await Promise.all([
      admin.from("project_integrations").select("account_id").eq("project_id", cycle.project_id).eq("platform", "meta").maybeSingle(),
      admin.from("paid_media_context").select("synced_campaign_ids").eq("project_id", cycle.project_id).maybeSingle(),
    ])
    if (!integration?.account_id) continue
    try {
      const campaignIds = (context?.synced_campaign_ids as string[] | null) ?? undefined
      const result = await runMetaAdsSync(admin, cycle.project_id, cycle.id, campaignIds?.length ? campaignIds : undefined)
      if (result.error) { failed++; console.error(`[runScheduledMetaSync] ${cycle.project_id}:`, result.error) }
      else synced++
    } catch (err) {
      failed++
      console.error(`[runScheduledMetaSync] ${cycle.project_id}:`, err instanceof Error ? err.message : err)
    }
  }
  return { synced, failed }
}

// Nombres de campañas por id — a diferencia de /act_X/campaigns (que omite
// las archivadas/eliminadas), la consulta por id sí las encuentra. Para
// mostrar las campañas elegidas aunque ya no estén activas.
export async function getMetaCampaignNames(campaignIds: string[]): Promise<Record<string, string>> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken || campaignIds.length === 0) return {}
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const byId = await fetchByIds<{ name?: string }>(campaignIds, "name", accessToken)
  return Object.fromEntries(Array.from(byId.entries()).filter(([, c]) => c.name).map(([id, c]) => [id, c.name!]))
}

// Sigue `paging.next` — insights con desglose diario rebasa fácil el
// límite de una página (20 ads × 30 días = 600 filas) y sin esto se
// perdían filas en silencio.
async function fetchAllPages<T>(firstUrl: string): Promise<{ data: T[]; error?: string }> {
  const data: T[] = []
  let next: string | null = firstUrl
  for (let page = 0; next && page < 50; page++) {
    const json = await (await fetch(next, { cache: "no-store" })).json()
    if (json.error) return { data, error: json.error.message }
    data.push(...((json.data ?? []) as T[]))
    next = json.paging?.next ?? null
  }
  return { data }
}

// GET /?ids=a,b,c acepta máximo 50 ids por llamada — se parte en lotes.
async function fetchByIds<T>(ids: string[], fields: string, accessToken: string): Promise<Map<string, T>> {
  const out = new Map<string, T>()
  for (let i = 0; i < ids.length; i += 50) {
    const u = new URL(`${META_BASE}/`)
    u.searchParams.set("ids", ids.slice(i, i + 50).join(","))
    u.searchParams.set("fields", fields)
    u.searchParams.set("access_token", accessToken)
    try {
      const json = await (await fetch(u.toString(), { cache: "no-store" })).json()
      if (json.error) { console.error("[fetchByIds]", fields, json.error.message); continue }
      for (const [id, v] of Object.entries(json)) {
        if (v && typeof v === "object") out.set(id, v as T)
      }
    } catch (err) {
      console.error("[fetchByIds]", fields, err instanceof Error ? err.message : err)
    }
  }
  return out
}

// Totales "Máximo" (date_preset=maximum, igual que Ads Manager) de las
// campañas del sync y sus anuncios. Una sola fila por objeto — Meta ya
// deduplica el alcance sobre toda la vida, así que nada se deriva aquí.
// No bloquea el sync: si falla, el modo Máximo simplemente no tiene datos.
async function syncLifetimeStats(supabase: SupabaseClient, ctx: {
  projectId: string
  accountId: string
  accessToken: string
  campaignIds: string[]
  specByAdsetId: Map<string, ResultSpec | null>
  adsetIdByCampaignId: Map<string, string>
  objectiveById: Map<string, string | null>
}) {
  if (ctx.campaignIds.length === 0) return
  const out: Record<string, unknown>[] = []
  for (const level of ["ad", "campaign"] as const) {
    const u = new URL(`${META_BASE}/act_${ctx.accountId}/insights`)
    u.searchParams.set("level", level)
    u.searchParams.set("date_preset", "maximum")
    u.searchParams.set("use_unified_attribution_setting", "true")
    u.searchParams.set("fields", `${level === "ad" ? "ad_id,adset_id," : ""}campaign_id,spend,impressions,clicks,reach,frequency,actions,action_values`)
    u.searchParams.set("filtering", JSON.stringify([{ field: "campaign.id", operator: "IN", value: ctx.campaignIds }]))
    u.searchParams.set("access_token", ctx.accessToken)
    u.searchParams.set("limit", "500")
    try {
      const page = await fetchAllPages<MetaAdInsightRow>(u.toString())
      if (page.error) { console.error(`[syncLifetimeStats] ${level}:`, page.error); continue }
      for (const r of page.data) {
        const adsetId = level === "ad" ? r.adset_id : ctx.adsetIdByCampaignId.get(r.campaign_id)
        const spec = adsetId ? ctx.specByAdsetId.get(adsetId) ?? null : null
        const { results, results_type } = pickResults(r, spec)
        out.push({
          project_id: ctx.projectId,
          level,
          object_id: level === "ad" ? r.ad_id : r.campaign_id,
          spend: r.spend ? Number(r.spend) : null,
          impressions: r.impressions ? Number(r.impressions) : null,
          clicks: r.clicks ? Number(r.clicks) : null,
          reach: r.reach ? Number(r.reach) : null,
          frequency: r.frequency ? Number(r.frequency) : null,
          results,
          results_type,
          purchase_value: pickPurchaseValue(r.action_values, ctx.objectiveById.get(r.campaign_id) ?? null),
          link_clicks: actionCount(r.actions, ["link_click"]),
          video_views: actionCount(r.actions, ["video_view"]),
          messaging_conversations: actionCount(r.actions, ["onsite_conversion.messaging_conversation_started_7d"]),
          synced_at: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error(`[syncLifetimeStats] ${level}:`, err instanceof Error ? err.message : err)
    }
  }
  if (out.length === 0) return
  const { error } = await supabase.from("meta_lifetime_stats").upsert(out, { onConflict: "project_id,level,object_id" })
  if (error) console.error("[syncLifetimeStats] upsert:", error.message)
}

async function runMetaAdsSync(supabase: SupabaseClient, projectId: string, cycleId: string, campaignIds?: string[]): Promise<{ synced: number; error?: string }> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken) return { synced: 0, error: "META_SYSTEM_USER_TOKEN no está configurado en el servidor" }

  const [integrationResult, cycleResult] = await Promise.all([
    supabase.from("project_integrations").select("account_id").eq("project_id", projectId).eq("platform", "meta").maybeSingle(),
    supabase.from("paid_media_cycles").select("start_date, end_date").eq("id", cycleId).single(),
  ])

  if (cycleResult.error || !cycleResult.data) return { synced: 0, error: "No se encontró el ciclo" }

  const today = new Date().toISOString().split("T")[0]
  if (cycleResult.data.start_date > today) {
    return { synced: 0, error: `Este ciclo empieza el ${cycleResult.data.start_date} — aún no hay datos que sincronizar.` }
  }

  const meta_ad_account_id = integrationResult.data?.account_id
  if (!meta_ad_account_id) {
    return { synced: 0, error: "Configura el Ad Account ID de Meta en Conexiones" }
  }

  const { since, until } = cycleRange(cycleResult.data)

  // Moneda de la cuenta — Meta regresa todos los montos en ella, sin
  // convertir. No bloquea el sync si falla.
  try {
    const acct = await (await fetch(`${META_BASE}/act_${meta_ad_account_id}?fields=currency&access_token=${accessToken}`, { cache: "no-store" })).json()
    if (acct.currency) {
      await supabase.from("project_integrations").update({ currency: acct.currency }).eq("project_id", projectId).eq("platform", "meta")
    }
  } catch (err) {
    console.error("[syncMetaAds] currency fetch:", err instanceof Error ? err.message : err)
  }
  const fields = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,actions,action_values"

  const url = new URL(`${META_BASE}/act_${meta_ad_account_id}/insights`)
  url.searchParams.set("level", "ad")
  url.searchParams.set("time_increment", "1")
  // Sin esto, la API cuenta conversiones con su ventana por defecto
  // (incluye gente que solo vio el anuncio), mientras Ads Manager usa la
  // atribución configurada en cada conjunto (ej. "7 días tras clic") — por
  // eso "Resultados" salía más alto que en Ads Manager.
  url.searchParams.set("use_unified_attribution_setting", "true")
  url.searchParams.set("fields", fields)
  url.searchParams.set("time_range", JSON.stringify({ since, until }))
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("limit", "500")
  // A diferencia del bug de /ads con "filtering" (ese edge lo ignora
  // silenciosamente) — el edge de insights SÍ soporta filtrar por
  // campaign.id, es su uso documentado. Sin campaignIds, sincroniza todas
  // las campañas del ciclo, igual que antes.
  if (campaignIds?.length) {
    url.searchParams.set("filtering", JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]))
  }

  let rows: MetaAdInsightRow[]
  try {
    const page = await fetchAllPages<MetaAdInsightRow>(url.toString())
    if (page.error) return { synced: 0, error: `Meta API: ${page.error}` }
    rows = page.data
  } catch {
    return { synced: 0, error: "Error de red al conectar con Meta" }
  }
  if (!rows.length) return { synced: 0 }

  // Qué cuenta como "Resultado" se resuelve por ad set: su
  // optimization_goal y, para conversiones, el evento exacto en
  // promoted_object. Se piden SOLO los ad sets / campañas que aparecen en
  // los datos (en vez de listar toda la cuenta, que se cortaba en 500).
  const adsetIds = Array.from(new Set(rows.map((r) => r.adset_id).filter(Boolean)))
  const campaignIdsInRows = Array.from(new Set(rows.map((r) => r.campaign_id).filter(Boolean)))
  const [adsetsById, campaignsById] = await Promise.all([
    fetchByIds<{ optimization_goal?: string; promoted_object?: PromotedObject }>(adsetIds, "optimization_goal,promoted_object", accessToken),
    fetchByIds<{ objective?: string }>(campaignIdsInRows, "objective", accessToken),
  ])
  const specByAdsetId = new Map<string, ResultSpec | null>()
  for (const row of rows) {
    if (specByAdsetId.has(row.adset_id)) continue
    const adset = adsetsById.get(row.adset_id)
    specByAdsetId.set(row.adset_id, resolveResultSpec(
      campaignsById.get(row.campaign_id)?.objective ?? null,
      adset?.optimization_goal ?? null,
      adset?.promoted_object ?? null,
    ))
  }
  const objectiveById = new Map(Array.from(campaignsById.entries()).map(([id, c]) => [id, c.objective ?? null]))

  // Dimensión (un ad, sus datos no cambian por día) — se resuelve el
  // creativo (thumbnail/imagen/video) solo una vez por ad_id único, no por
  // cada fila diaria.
  const uniqueAds = new Map<string, MetaAdInsightRow>()
  for (const row of rows) if (!uniqueAds.has(row.ad_id)) uniqueAds.set(row.ad_id, row)

  const adIds = Array.from(uniqueAds.keys())

  // Multi-id fetch de Graph API (GET /?ids=a,b,c) — NO el edge /act_X/ads
  // con "filtering": ese filtro es para insights/edges, no para traer
  // objetos puntuales por id; "filtering" ahí se ignora silenciosamente
  // y por eso el creativo (thumbnail/imagen/video) siempre llegaba null.
  const adsById = await fetchByIds<Record<string, unknown>>(adIds, AD_CREATIVE_FIELDS, accessToken)

  // A diferencia de getMetaAds/getMetaAdById (un ad puntual, on-demand),
  // aquí puede haber muchos ads a la vez — resolver el video de cada uno
  // con su propia llamada en paralelo (como hace mapAdNodeToCreative)
  // dispara N requests simultáneas a Meta y algunas se comen un
  // rate-limit silencioso (el error ya se atrapaba, pero el resultado es
  // el mismo: video_url queda null). Se resuelve TODO el creativo sin
  // video primero, y los videos de una sola vez con el mismo patrón
  // multi-id que ya arregló el thumbnail/imagen.
  const adNodes: any[] = Array.from(adsById.values()).filter((v) => "id" in v)

  const creativeByAdId = new Map<string, { videoId: string | null } & Omit<MetaAdCreative, "id" | "videoUrl">>()
  for (const a of adNodes) {
    const creative = (a.creative as any) ?? {}
    const story = creative.object_story_spec ?? {}
    const linkData = story.link_data ?? {}
    const videoData = story.video_data ?? {}
    const feedSpec = creative.asset_feed_spec ?? {}
    creativeByAdId.set(a.id as string, {
      name: (a.name as string) ?? (a.id as string),
      status: (a.effective_status as string) ?? null,
      thumbnailUrl: creative.thumbnail_url ?? videoData.image_url ?? null,
      imageUrl: creative.image_url ?? linkData.picture ?? feedSpec.images?.[0]?.url ?? null,
      body: creative.body ?? linkData.message ?? videoData.message ?? null,
      title: creative.title ?? linkData.name ?? videoData.title ?? null,
      cta: creative.call_to_action_type ?? linkData.call_to_action?.type ?? videoData.call_to_action?.type ?? null,
      videoId: creative.video_id || videoData.video_id || feedSpec.videos?.[0]?.video_id || null,
    })
  }

  const videoIds = Array.from(new Set(Array.from(creativeByAdId.values()).map((c) => c.videoId).filter((v): v is string => !!v)))
  // (#10) "Application does not have permission for this action" en este
  // fetch es un caso conocido y sin fix de nuestro lado: cuentas
  // compartidas entre Business Managers distintos ("socio") comparten
  // métricas pero NUNCA la Biblioteca de Assets del negocio dueño, sin
  // importar el scope del token. La salida real es vincular el archivo
  // original como asset del dashboard (ver displayVideoUrl).
  const videoSourceById = new Map<string, string>()
  const videosById = await fetchByIds<{ source?: string }>(videoIds, "source", accessToken)
  for (const [id, v] of videosById) {
    if (v.source) videoSourceById.set(id, v.source)
  }

  const creativeById = new Map<string, MetaAdCreative>(
    Array.from(creativeByAdId.entries()).map(([adId, c]) => [
      adId,
      { id: adId, ...c, videoUrl: c.videoId ? videoSourceById.get(c.videoId) ?? null : null },
    ])
  )

  // El video_url que da Meta es una URL firmada que expira en horas (ver
  // mirrorMetaMedia) — guardarla cruda es justo el bug de "el video deja
  // de reproducirse y se queda con la miniatura pixelada" unas horas
  // después de cada sync. Se descarga a Storage UNA sola vez por ad (no
  // en cada sync — el path de mirrorMetaMedia siempre es nuevo, así que
  // resincronizar sin este check acumularía archivos huérfanos sin fin).
  // Imagen/thumbnail de ads de IMAGEN no se tocan: esa URL sí es estable
  // (mismo criterio ya documentado en mirrorMetaMedia).
  const videoAdIds = adIds.filter((id) => creativeById.get(id)?.videoUrl)
  if (videoAdIds.length > 0) {
    const { data: existingRows } = await supabase
      .from("meta_ads")
      .select("ad_id, video_url, thumbnail_url")
      .eq("project_id", projectId)
      .in("ad_id", videoAdIds)
    const existingByAdId = new Map((existingRows ?? []).map((r) => [r.ad_id, r]))
    const isMirrored = (url: string | null) => !!url && url.includes("/storage/v1/object/public/ad-lab/")

    for (const adId of videoAdIds) {
      const creative = creativeById.get(adId)!
      const existing = existingByAdId.get(adId)
      if (isMirrored(existing?.video_url ?? null)) {
        creative.videoUrl = existing!.video_url
        if (isMirrored(existing?.thumbnail_url ?? null)) creative.thumbnailUrl = existing!.thumbnail_url
        continue
      }
      const [video, thumb] = await Promise.all([
        mirrorMetaMedia(projectId, adId, creative.videoUrl!, "video"),
        creative.thumbnailUrl ? mirrorMetaMedia(projectId, adId, creative.thumbnailUrl, "thumb") : Promise.resolve({ url: null } as MirrorResult),
      ])
      creative.videoUrl = video.url
      if (thumb.url) creative.thumbnailUrl = thumb.url
      if (video.error) console.error(`[syncMetaAds] mirror failed for "${creative.name}":`, video.error)
    }
  }

  const dimRows = adIds.map((adId) => {
    const row = uniqueAds.get(adId)!
    const creative = creativeById.get(adId)
    return {
      project_id:    projectId,
      ad_id:         adId,
      ad_name:       row.ad_name || null,
      ad_set_id:     row.adset_id || null,
      ad_set_name:   row.adset_name || null,
      campaign_id:   row.campaign_id || null,
      campaign_name: row.campaign_name || null,
      status:        creative?.status ?? null,
      thumbnail_url: creative?.thumbnailUrl ?? null,
      image_url:     creative?.imageUrl ?? null,
      video_url:     creative?.videoUrl ?? null,
      updated_at:    new Date().toISOString(),
    }
  })

  const factRows = rows.map((row) => {
    const objective = objectiveById.get(row.campaign_id) ?? null
    const { results, results_type } = pickResults(row, specByAdsetId.get(row.adset_id) ?? null)
    return {
      project_id:     projectId,
      cycle_id:       cycleId,
      ad_id:          row.ad_id,
      date:           row.date_start,
      spend:          row.spend ? Number(row.spend) : null,
      impressions:    row.impressions ? Number(row.impressions) : null,
      clicks:         row.clicks ? Number(row.clicks) : null,
      results,
      results_type,
      purchase_value: pickPurchaseValue(row.action_values, objective),
      reach:          row.reach ? Number(row.reach) : null,
      frequency:      row.frequency ? Number(row.frequency) : null,
      link_clicks:    actionCount(row.actions, ["link_click"]),
      video_views:    actionCount(row.actions, ["video_view"]),
      messaging_conversations: actionCount(row.actions, ["onsite_conversion.messaging_conversation_started_7d"]),
      synced_at:      new Date().toISOString(),
    }
  })

  const [{ error: dimError }, { error: factError }] = await Promise.all([
    supabase.from("meta_ads").upsert(dimRows, { onConflict: "project_id,ad_id" }),
    supabase.from("meta_ad_daily_stats").upsert(factRows, { onConflict: "project_id,ad_id,date" }),
  ])

  if (dimError) return { synced: 0, error: dimError.message }
  if (factError) return { synced: 0, error: factError.message }

  // factRows es SIEMPRE la verdad completa y fresca para este ciclo + la
  // selección de campañas actual — pero un upsert nunca BORRA lo que ya
  // no debería estar. Si antes había más campañas seleccionadas y ahora
  // hay menos, los creativos de las campañas quitadas se quedaban
  // pegados en la vista (sus filas de meta_ad_daily_stats de este ciclo
  // seguían ahí de un sync anterior). Se borran DESPUÉS de que el insert
  // ya tuvo éxito — nunca antes — para no dejar la vista vacía a medias
  // si el insert hubiera fallado.
  const { error: pruneError } = await supabase
    .from("meta_ad_daily_stats")
    .delete()
    .eq("project_id", projectId)
    .eq("cycle_id", cycleId)
    .not("ad_id", "in", `(${adIds.map((id) => `"${id}"`).join(",")})`)
  if (pruneError) console.error("[syncMetaAds] no se pudieron limpiar los creativos de campañas quitadas:", pruneError.message)

  // Alcance/frecuencia sobre TODO el rango, deduplicados por Meta. No se
  // pueden reconstruir de las filas diarias (sumar días cuenta dos veces a
  // la misma persona) ni juntando ads (sumar/maximizar ignora el traslape
  // de audiencia) — por eso se piden aparte, sin time_increment, y se
  // guardan tal cual para que coincidan con Ads Manager.
  const reachRows: { project_id: string; cycle_id: string; level: "ad" | "campaign"; object_id: string; reach: number | null; frequency: number | null }[] = []
  for (const level of ["ad", "campaign"] as const) {
    const reachUrl = new URL(`${META_BASE}/act_${meta_ad_account_id}/insights`)
    reachUrl.searchParams.set("level", level)
    reachUrl.searchParams.set("fields", level === "ad" ? "ad_id,reach,frequency" : "campaign_id,reach,frequency")
    reachUrl.searchParams.set("time_range", JSON.stringify({ since, until }))
    reachUrl.searchParams.set("access_token", accessToken)
    reachUrl.searchParams.set("limit", "500")
    if (campaignIds?.length) {
      reachUrl.searchParams.set("filtering", JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]))
    }
    try {
      const reachJson = await (await fetch(reachUrl.toString(), { cache: "no-store" })).json()
      if (reachJson.error) {
        console.error(`[syncMetaAds] reach (${level}) fetch failed:`, reachJson.error.message)
        continue
      }
      for (const r of (reachJson.data ?? []) as { ad_id?: string; campaign_id?: string; reach?: string; frequency?: string }[]) {
        const objectId = level === "ad" ? r.ad_id : r.campaign_id
        if (!objectId) continue
        reachRows.push({
          project_id: projectId,
          cycle_id: cycleId,
          level,
          object_id: objectId,
          reach: r.reach ? Number(r.reach) : null,
          frequency: r.frequency ? Number(r.frequency) : null,
        })
      }
    } catch (err) {
      console.error(`[syncMetaAds] reach (${level}) fetch threw:`, err instanceof Error ? err.message : err)
    }
  }
  if (reachRows.length > 0) {
    await supabase.from("meta_cycle_reach").delete().eq("project_id", projectId).eq("cycle_id", cycleId)
    const { error: reachError } = await supabase.from("meta_cycle_reach").insert(reachRows)
    if (reachError) console.error("[syncMetaAds] no se pudo guardar alcance del ciclo:", reachError.message)
  }

  await syncLifetimeStats(supabase, {
    projectId, accountId: meta_ad_account_id, accessToken,
    campaignIds: campaignIdsInRows,
    specByAdsetId,
    adsetIdByCampaignId: new Map(rows.map((r) => [r.campaign_id, r.adset_id])),
    objectiveById,
  })

  return { synced: factRows.length }
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

const AD_CREATIVE_FIELDS =
  // asset_feed_spec covers Advantage+/dynamic creative ads, whose video and
  // image live there instead of object_story_spec — ads built that way
  // were silently coming back with no video_id and a tiny thumbnail_url
  // for imageUrl, which is exactly the "pixelated, can't play" symptom.
  "id,name,effective_status,creative{id,thumbnail_url,image_url,video_id,body,title,call_to_action_type,object_story_spec,asset_feed_spec{videos{video_id},images{url}}}"

// Shared by getMetaAds (listing an ad set's ads) and getMetaAdById (a single
// ad, used to refresh one creative without repeating the whole picker flow)
// so both resolve video/image the exact same way.
async function mapAdNodeToCreative(a: any, accessToken: string): Promise<MetaAdCreative> {
  const creative = a.creative ?? {}
  const story = creative.object_story_spec ?? {}
  const linkData = story.link_data ?? {}
  const videoData = story.video_data ?? {}
  const feedSpec = creative.asset_feed_spec ?? {}

  let videoUrl: string | null = null
  const videoId = creative.video_id || videoData.video_id || feedSpec.videos?.[0]?.video_id
  if (videoId) {
    try {
      const vUrl = new URL(`${META_BASE}/${videoId}`)
      vUrl.searchParams.set("fields", "source")
      vUrl.searchParams.set("access_token", accessToken)
      const vRes = await fetch(vUrl.toString(), { cache: "no-store" })
      const vJson = await vRes.json()
      if (vJson.error) {
        console.error(`[mapAdNodeToCreative] video source fetch failed for ${videoId}:`, vJson.error.message)
      }
      videoUrl = vJson.source ?? null
    } catch (err) {
      console.error(`[mapAdNodeToCreative] video source fetch threw for ${videoId}:`, err instanceof Error ? err.message : err)
    }
  }

  return {
    id: a.id,
    name: a.name ?? a.id,
    status: a.effective_status ?? null,
    // Prefer the full creative image over Meta's thumbnail_url — that
    // field is a small, deliberately low-res crop, not meant to be shown
    // at any real size (the pixelated preview the user flagged).
    thumbnailUrl: creative.thumbnail_url ?? videoData.image_url ?? null,
    imageUrl: creative.image_url ?? linkData.picture ?? feedSpec.images?.[0]?.url ?? null,
    videoUrl,
    body: creative.body ?? linkData.message ?? videoData.message ?? null,
    title: creative.title ?? linkData.name ?? videoData.title ?? null,
    cta: creative.call_to_action_type ?? linkData.call_to_action?.type ?? videoData.call_to_action?.type ?? null,
  }
}

export async function getMetaAds(adSetId: string): Promise<{ ads: MetaAdCreative[]; error?: string }> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken) return { ads: [], error: "META_SYSTEM_USER_TOKEN no configurado" }

  const url = new URL(`${META_BASE}/${adSetId}/ads`)
  url.searchParams.set("fields", AD_CREATIVE_FIELDS)
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
  const ads: MetaAdCreative[] = await Promise.all(rows.map((a: any) => mapAdNodeToCreative(a, accessToken)))

  return { ads }
}

// Fetches a single ad node directly by id — used to refresh one already
// -imported creative (reimportMetaCreative) without repeating the whole
// campaign -> ad set -> ads picker flow just to fix one broken import.
export async function getMetaAdById(adId: string): Promise<{ ad: MetaAdCreative | null; error?: string }> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken) return { ad: null, error: "META_SYSTEM_USER_TOKEN no configurado" }

  const url = new URL(`${META_BASE}/${adId}`)
  url.searchParams.set("fields", AD_CREATIVE_FIELDS)
  url.searchParams.set("access_token", accessToken)

  try {
    const res = await fetch(url.toString(), { cache: "no-store" })
    const json = await res.json()
    if (json.error) return { ad: null, error: `Meta API: ${json.error.message}` }
    return { ad: await mapAdNodeToCreative(json, accessToken) }
  } catch {
    return { ad: null, error: "Error de red al conectar con Meta" }
  }
}

// ── Historial de Meta — importar creativos de campañas pasadas ─────────────
// Independiente del ciclo activo: sirve para clientes con historial previo
// (con o sin la agencia) al que ya se tiene acceso vía System User.

export interface MetaCampaignSummary {
  id: string
  name: string
  status: string | null
  objective: string | null
  spend: number | null
  results: number | null
  results_type: string | null
  date_start: string | null
  date_stop: string | null
}

// Lista TODAS las campañas de la cuenta (no acotadas a un ciclo), con sus
// métricas lifetime (date_preset=maximum) — para poder elegir cuáles
// explorar sin importar cuándo corrieron.
export async function getMetaCampaignsHistory(accountId: string): Promise<{ campaigns: MetaCampaignSummary[]; error?: string }> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN
  if (!accessToken) return { campaigns: [], error: "META_SYSTEM_USER_TOKEN no configurado" }

  const campaignsUrl = new URL(`${META_BASE}/act_${accountId}/campaigns`)
  campaignsUrl.searchParams.set("fields", "id,name,effective_status,objective")
  campaignsUrl.searchParams.set("limit", "300")
  campaignsUrl.searchParams.set("access_token", accessToken)

  const insightsUrl = new URL(`${META_BASE}/act_${accountId}/insights`)
  insightsUrl.searchParams.set("level", "campaign")
  insightsUrl.searchParams.set("fields", "campaign_id,spend,actions,date_start,date_stop")
  insightsUrl.searchParams.set("date_preset", "maximum")
  insightsUrl.searchParams.set("limit", "300")
  insightsUrl.searchParams.set("access_token", accessToken)

  let campaignsRes: Response, insightsRes: Response
  try {
    ;[campaignsRes, insightsRes] = await Promise.all([
      fetch(campaignsUrl.toString(), { cache: "no-store" }),
      fetch(insightsUrl.toString(), { cache: "no-store" }),
    ])
  } catch {
    return { campaigns: [], error: "Error de red al conectar con Meta" }
  }

  const campaignsJson = await campaignsRes.json()
  if (campaignsJson.error) return { campaigns: [], error: `Meta API: ${campaignsJson.error.message}` }
  const insightsJson = await insightsRes.json()

  const insightsById = new Map<string, MetaInsightRow>(
    (insightsJson.data ?? []).map((row: MetaInsightRow) => [row.campaign_id, row])
  )

  const campaigns: MetaCampaignSummary[] = (campaignsJson.data ?? []).map((c: { id: string; name: string; effective_status: string; objective?: string }) => {
    const insight = insightsById.get(c.id)
    const { results, results_type } = pickResults(insight ?? {}, resolveResultSpec(c.objective ?? null, null, null))
    return {
      id: c.id,
      name: c.name ?? c.id,
      status: c.effective_status ?? null,
      objective: c.objective ?? null,
      spend: insight?.spend ? Number(insight.spend) : null,
      results,
      results_type,
      date_start: insight?.date_start ?? null,
      date_stop: insight?.date_stop ?? null,
    }
  })

  return { campaigns }
}

// Video specifically comes from Meta's `/{video_id}?fields=source` — a
// short-lived SIGNED url that expires within hours. Falling back to it on a
// failed mirror (like image/thumb do, where the source is a more stable CDN
// link) looked fine at import time but silently rotted into a dead link a
// few hours later, which is exactly the "no se pueden reproducir" bug this
// was written to fix — so video never falls back, it's null-or-nothing.
// Also guards against a redirect/error page masquerading as a 200 (Meta's
// CDN has been known to hand back an HTML error body with a 200 status) by
// checking the actual content-type before trusting the download.
interface MirrorResult {
  url: string | null
  // Surfaced all the way up to the import wizard's result screen — a null
  // url with no reason was undebuggable without pulling Vercel logs, which
  // isn't something the person doing the import can do themselves.
  error?: string
}

async function mirrorMetaMedia(projectId: string, adId: string, sourceUrl: string, kind: "image" | "video" | "thumb"): Promise<MirrorResult> {
  const expectedPrefix = kind === "video" ? "video/" : "image/"
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(kind === "video" ? 120_000 : 45_000) })
    if (!res.ok) {
      const reason = `Meta respondió ${res.status} al descargar el ${kind}`
      console.error(`[mirrorMetaMedia] ${reason} (${adId})`)
      return kind === "video" ? { url: null, error: reason } : { url: sourceUrl }
    }
    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.startsWith(expectedPrefix)) {
      const reason = `Meta devolvió "${contentType || "sin content-type"}" en vez de un ${kind} real`
      console.error(`[mirrorMetaMedia] ${reason} (${adId})`)
      return kind === "video" ? { url: null, error: reason } : { url: sourceUrl }
    }
    const buffer = await res.arrayBuffer()
    const ext = (contentType.split("/")[1]?.split(";")[0] ?? (kind === "video" ? "mp4" : "jpg")).slice(0, 4)
    // A deterministic path (no timestamp) meant reimporting the same ad
    // overwrote the exact same file at the exact same public URL — which
    // silently hid the fix behind the browser/CDN's cached copy of the
    // previous (broken) attempt. Every mirror now gets its own path, so a
    // reimport always produces a URL nobody has cached yet.
    const path = `meta-imports/${projectId}/${adId}-${kind}-${Date.now()}.${ext}`
    const adminStorage = createAdminClient()
    const { error } = await adminStorage.storage.from("ad-lab").upload(path, buffer, { contentType, upsert: true })
    if (error) {
      console.error(`[mirrorMetaMedia] upload failed for ${kind} ${adId}:`, error.message)
      return kind === "video" ? { url: null, error: `No se pudo subir a Storage: ${error.message}` } : { url: sourceUrl }
    }
    const { data: { publicUrl } } = adminStorage.storage.from("ad-lab").getPublicUrl(path)
    return { url: publicUrl }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[mirrorMetaMedia] failed for ${kind} ${adId}:`, message)
    const reason = message.includes("timeout") || message.includes("abort")
      ? `Se tardó demasiado en descargar el ${kind} (timeout)`
      : `Error descargando el ${kind}: ${message}`
    return kind === "video" ? { url: null, error: reason } : { url: sourceUrl }
  }
}

export interface ImportMetaCreativeInput {
  campaignId: string
  campaignName: string | null
  adSetId: string
  adSetName: string | null
  ad: MetaAdCreative
  campaignMetrics: {
    spend: number | null
    results: number | null
    results_type: string | null
    date_start: string | null
    date_stop: string | null
  }
}

// Descarga imagen/video a Storage (las URLs de Meta pueden expirar o no ser
// estables para análisis posterior) y guarda el creativo + métricas de su
// campaña (lifetime, no por-anuncio — evita una llamada de insights extra
// por cada creativo seleccionado).
export async function importMetaCreatives(projectId: string, inputs: ImportMetaCreativeInput[]): Promise<{ imported: number; errors: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const errors: string[] = []
  let imported = 0

  for (const input of inputs) {
    try {
      const noMedia: MirrorResult = { url: null }
      const [image, video, thumbnail] = await Promise.all([
        input.ad.imageUrl ? mirrorMetaMedia(projectId, input.ad.id, input.ad.imageUrl, "image") : Promise.resolve(noMedia),
        input.ad.videoUrl ? mirrorMetaMedia(projectId, input.ad.id, input.ad.videoUrl, "video") : Promise.resolve(noMedia),
        input.ad.thumbnailUrl ? mirrorMetaMedia(projectId, input.ad.id, input.ad.thumbnailUrl, "thumb") : Promise.resolve(noMedia),
      ])

      // Non-fatal — the creative still gets saved with whatever media did
      // come through — but shown right here in the import result instead
      // of only ever visible in server logs.
      if (input.ad.videoUrl && video.error) {
        errors.push(`${input.ad.name}: video no se pudo importar (${video.error})`)
      }

      const { error } = await supabase.from("meta_campaign_creatives").upsert({
        project_id: projectId,
        campaign_id: input.campaignId,
        campaign_name: input.campaignName,
        ad_set_id: input.adSetId,
        ad_set_name: input.adSetName,
        ad_id: input.ad.id,
        ad_name: input.ad.name,
        image_url: image.url,
        video_url: video.url,
        thumbnail_url: thumbnail.url,
        body: input.ad.body,
        title: input.ad.title,
        cta: input.ad.cta,
        spend: input.campaignMetrics.spend,
        results: input.campaignMetrics.results,
        results_type: input.campaignMetrics.results_type,
        date_start: input.campaignMetrics.date_start,
        date_stop: input.campaignMetrics.date_stop,
        imported_by: user?.id ?? null,
        imported_at: new Date().toISOString(),
      }, { onConflict: "project_id,ad_id" })

      if (error) throw error
      imported++
    } catch (err) {
      errors.push(`${input.ad.name ?? input.ad.id}: ${err instanceof Error ? err.message : "error desconocido"}`)
    }
  }

  return { imported, errors }
}

export async function getMetaImportedCreatives(projectId: string): Promise<MetaCampaignCreative[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_campaign_creatives")
    .select("*")
    .eq("project_id", projectId)
    .order("imported_at", { ascending: false })
  if (error) return []
  return data ?? []
}

// Extracts the meta-imports/<projectId>/<file> storage path out of a public
// URL from the ad-lab bucket — used to clean up mirrored files on delete.
// Anything that isn't actually one of ours (e.g. a Meta URL that never got
// mirrored) is left alone.
function storagePathFromPublicUrl(url: string | null): string | null {
  if (!url) return null
  const marker = "/storage/v1/object/public/ad-lab/"
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

// Delete — a creative imported wrong (or just no longer wanted) had no way
// to be removed short of a manual SQL DELETE.
export async function deleteMetaImportedCreative(projectId: string, creativeId: string): Promise<void> {
  const supabase = await createClient()
  const { data: row } = await supabase
    .from("meta_campaign_creatives")
    .select("image_url, video_url, thumbnail_url")
    .eq("id", creativeId)
    .eq("project_id", projectId)
    .single()

  const { error } = await supabase
    .from("meta_campaign_creatives")
    .delete()
    .eq("id", creativeId)
    .eq("project_id", projectId)
  if (error) throw error

  const paths = [row?.image_url, row?.video_url, row?.thumbnail_url]
    .map(storagePathFromPublicUrl)
    .filter((p): p is string => !!p)
  if (paths.length > 0) {
    const adminStorage = createAdminClient()
    await adminStorage.storage.from("ad-lab").remove(paths).catch(() => { /* best effort */ })
  }
}

// Update/refresh — re-fetches this one ad from Meta and re-mirrors its
// media, reusing importMetaCreatives' upsert (now on a fresh, uncached
// Storage path each time — see mirrorMetaMedia) instead of forcing a trip
// through the whole campaign -> ad set -> ads picker just to fix one row.
export async function reimportMetaCreative(projectId: string, creativeId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: existing, error: fetchError } = await supabase
    .from("meta_campaign_creatives")
    .select("*")
    .eq("id", creativeId)
    .eq("project_id", projectId)
    .single()
  if (fetchError || !existing) return { ok: false, error: "No se encontró el creativo" }

  const { ad, error: adError } = await getMetaAdById(existing.ad_id)
  if (adError || !ad) return { ok: false, error: adError ?? "No se pudo obtener el anuncio de Meta" }

  const { errors } = await importMetaCreatives(projectId, [{
    campaignId: existing.campaign_id,
    campaignName: existing.campaign_name,
    adSetId: existing.ad_set_id,
    adSetName: existing.ad_set_name,
    ad,
    campaignMetrics: {
      spend: existing.spend,
      results: existing.results,
      results_type: existing.results_type,
      date_start: existing.date_start,
      date_stop: existing.date_stop,
    },
  }])

  return errors.length > 0 ? { ok: false, error: errors[0] } : { ok: true }
}
