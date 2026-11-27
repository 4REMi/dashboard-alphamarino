// Lecturas de Auditorías para las páginas (componentes de servidor).
// SIN "use server". Quien llama ya verificó el acceso con
// requireAuditAccess (lib/ad-audit/access.ts).

import { createAdminClient } from "@/lib/supabase/admin"
import {
  addCounters, applyOverrides, evaluateAdset, zeroCounters,
  type AdEvaluation, type Counters, type MetricDef, type MetricId, type MetricOverride, type ResultKind, type StoreEvent,
} from "@/lib/ad-audit/metrics"
import { auditAnalysisKey, type CreativeParts } from "@/lib/ad-audit/parts"
import { resolveAdsetResult, rowResult, type AdsetResult } from "@/lib/ad-audit/results"
import type { PromotedObject } from "@/lib/meta/result-spec"

type Admin = ReturnType<typeof createAdminClient>

// Fórmulas vigentes: las de fábrica con los cambios de la agencia. Si la
// tabla aún no existe (falta la migración 125), las de fábrica.
export async function loadMetricDefs(admin: Admin = createAdminClient()): Promise<MetricDef[]> {
  const { data, error } = await admin.from("audit_metric_overrides").select("metric_id, num, den, min_key, min_value")
  if (error) return applyOverrides([])
  return applyOverrides((data ?? []) as MetricOverride[])
}

// Supabase devuelve como máximo 1000 filas por consulta: paginar.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

// ── Lista de cuentas ──────────────────────────────────────────────

export interface AuditAccountRow {
  id: string
  meta_account_id: string
  name: string
  currency: string | null
  kind: "prospect" | "client"
  last_captured_at: string | null
  days_since_capture: number | null   // calculado en el servidor
  campaigns: number
  ads: number
}

export async function listAuditAccounts(): Promise<AuditAccountRow[]> {
  const admin = createAdminClient()
  const { data: accounts, error } = await admin.from("audit_accounts")
    .select("id, meta_account_id, name, currency, kind, last_captured_at")
    .order("last_captured_at", { ascending: false, nullsFirst: false })
  if (error) throw new Error(/audit_accounts/.test(error.message) ? "Falta correr la migración 124 en Supabase" : error.message)
  const { data: camps } = await admin.from("audit_campaigns").select("id, account_id")
  const campToAccount = new Map((camps ?? []).map((c) => [c.id as string, c.account_id as string]))
  const ads = await fetchAll<{ campaign_id: string }>((f, t) => admin.from("audit_ads").select("campaign_id").range(f, t))
  const count = (accId: string) => ({
    campaigns: (camps ?? []).filter((c) => c.account_id === accId).length,
    ads: ads.filter((a) => campToAccount.get(a.campaign_id) === accId).length,
  })
  const now = Date.now()
  return (accounts ?? []).map((a) => ({
    ...(a as Omit<AuditAccountRow, "campaigns" | "ads" | "days_since_capture">),
    days_since_capture: a.last_captured_at ? Math.floor((now - new Date(a.last_captured_at).getTime()) / 86400000) : null,
    ...count(a.id),
  }))
}

// ── Una cuenta: sus campañas ──────────────────────────────────────

export interface AuditCampaignRow {
  id: string
  name: string
  objective: string | null
  status: string | null
  period_since: string | null
  period_until: string | null
  captured_at: string | null
  ads: number
  spend: number
  // Resultados por tipo (una campaña puede tener conjuntos con distinto resultado).
  results: { label: string; kind: ResultKind; results: number; spend: number; value: number }[]
}

export async function getAuditAccount(accountId: string) {
  const admin = createAdminClient()
  const { data: account } = await admin.from("audit_accounts")
    .select("id, meta_account_id, name, currency, kind, last_captured_at").eq("id", accountId).maybeSingle()
  if (!account) return null
  const { data: camps } = await admin.from("audit_campaigns")
    .select("id, name, objective, status, period_since, period_until, captured_at")
    .eq("account_id", accountId).order("captured_at", { ascending: false })
  const campaigns: AuditCampaignRow[] = []
  for (const c of camps ?? []) {
    const view = await getCampaignAudit(c.id)
    campaigns.push({
      ...c,
      ads: view ? view.adsets.reduce((n, s) => n + s.ads.length, 0) : 0,
      spend: view?.totals.spend ?? 0,
      results: view?.resultSummary ?? [],
    })
  }
  return { account, campaigns }
}

type DailyRow = Record<keyof Counters, number> & { ad_id: string; date: string; actions?: Record<string, number>; action_values?: Record<string, number> }

async function dailyRows(admin: Admin, adIds: string[], since: string | null, until: string | null): Promise<DailyRow[]> {
  const out: DailyRow[] = []
  for (let i = 0; i < adIds.length; i += 200) {
    const chunk = adIds.slice(i, i + 200)
    out.push(...await fetchAll<DailyRow>((f, t) => {
      let q = admin.from("audit_ad_daily").select("*").in("ad_id", chunk)
      if (since) q = q.gte("date", since)
      if (until) q = q.lte("date", until)
      return q.order("ad_id").order("date").range(f, t)
    }))
  }
  return out
}

// Prueba la consulta con columnas nuevas y, si la migración aún no se
// corrió, repite con las de antes: la pantalla nunca se rompe por eso.
async function selectOr<T>(withNew: () => PromiseLike<{ data: T[] | null; error: unknown }>, legacy: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const a = await withNew()
  if (!a.error) return a.data ?? []
  const b = await legacy()
  return b.data ?? []
}

// Lunes de la semana de una fecha YYYY-MM-DD.
function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

// ── Una campaña: conjuntos con sus anuncios evaluados ─────────────

export interface AuditAdView {
  id: string
  meta_ad_id: string
  name: string
  status: string | null
  format: "video" | "image" | "other"
  videoUrl: string | null
  posterUrl: string | null
  imageUrl: string | null
  durationSec: number | null
  landingUrl: string | null
  body: string | null
  counters: Counters
  curve: number[] | null
  reach: number | null
  frequency: number | null
  avgWatchSec: number | null
  weekly: { week: string; counters: Counters }[]   // tendencia (fatiga)
  evaluation: AdEvaluation
  analysisKey: string
  parts: CreativeParts | null       // null = sin analizar por partes
  conceptName: string | null
  structure: { t: string; momento: string; que_pasa: string }[]
  concept: { angle_type?: string; awareness_stage?: number; funnel_stage?: string } | null
  brandLineId: string | null
}

export interface AuditAdsetView {
  id: string
  name: string
  optimization_goal: string | null
  result: AdsetResult
  totals: Counters
  medians: Record<MetricId, number | null>
  ads: AuditAdView[]
}

export interface CampaignAuditView {
  metrics: MetricDef[]
  account: { id: string; name: string; currency: string | null; meta_account_id: string }
  campaign: { id: string; name: string; objective: string | null; period_since: string | null; period_until: string | null; captured_at: string | null; missing_events: StoreEvent[] }
  totals: Counters
  resultSummary: AuditCampaignRow["results"]
  adsets: AuditAdsetView[]
}

type AnalysisDoc = {
  partes?: CreativeParts | null
  concepto?: { nombre?: string; angle_type?: string; awareness_stage?: number; funnel_stage?: string }
  estructura?: { t: string; momento: string; que_pasa: string }[]
}

export async function getCampaignAudit(campaignId: string): Promise<CampaignAuditView | null> {
  const admin = createAdminClient()
  const { data: campaign } = await admin.from("audit_campaigns")
    .select("id, account_id, name, objective, period_since, period_until, captured_at, missing_events").eq("id", campaignId).maybeSingle()
  if (!campaign) return null
  const { data: account } = await admin.from("audit_accounts").select("id, name, currency, meta_account_id").eq("id", campaign.account_id).single()

  type AdsetRow = { id: string; name: string; optimization_goal: string | null; promoted_object?: PromotedObject | null; result_override?: string | null }
  const adsets = await selectOr<AdsetRow>(
    () => admin.from("audit_adsets").select("id, name, optimization_goal, promoted_object, result_override").eq("campaign_id", campaignId).order("name"),
    () => admin.from("audit_adsets").select("id, name, optimization_goal").eq("campaign_id", campaignId).order("name"),
  )
  type AdRow = {
    id: string; meta_ad_id: string; adset_id: string | null; name: string; status: string | null; format: "video" | "image" | "other"
    meta_video_id: string | null; image_url: string | null; cached_image_url: string | null; landing_url: string | null; body: string | null
    audit_brand_line_id?: string | null
  }
  const baseCols = "id, meta_ad_id, adset_id, name, status, format, meta_video_id, image_url, cached_image_url, landing_url, body"
  let ads: AdRow[]
  try {
    ads = await fetchAll<AdRow>((f, t) => admin.from("audit_ads").select(`${baseCols}, audit_brand_line_id`).eq("campaign_id", campaignId).order("name").range(f, t))
  } catch {
    ads = await fetchAll<AdRow>((f, t) => admin.from("audit_ads").select(baseCols).eq("campaign_id", campaignId).order("name").range(f, t))
  }

  const videoIds = [...new Set(ads.map((a) => a.meta_video_id).filter(Boolean))] as string[]
  const { data: videos } = videoIds.length
    ? await admin.from("audit_videos").select("meta_video_id, storage_url, picture_url, duration_sec").in("meta_video_id", videoIds)
    : { data: [] }
  const videoById = new Map((videos ?? []).map((v) => [v.meta_video_id as string, v]))

  const adIds = ads.map((a) => a.id)
  const rows = adIds.length ? await dailyRows(admin, adIds, campaign.period_since, campaign.period_until) : []

  type PeriodRow = { ad_id: string; curve: number[] | null; reach?: number | null; frequency?: number | null; avg_watch_sec?: number | null }
  const period = new Map<string, PeriodRow>()
  for (let i = 0; i < adIds.length; i += 200) {
    const chunk = adIds.slice(i, i + 200)
    const data = await selectOr<PeriodRow>(
      () => admin.from("audit_ad_retention").select("ad_id, curve, reach, frequency, avg_watch_sec").in("ad_id", chunk),
      () => admin.from("audit_ad_retention").select("ad_id, curve").in("ad_id", chunk),
    )
    for (const p of data) period.set(p.ad_id, p)
  }

  const defs = await loadMetricDefs(admin)
  const keys = [...new Set(ads.map((a) => auditAnalysisKey(a)))]
  const analyses = new Map<string, AnalysisDoc>()
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await admin.from("ad_analyses").select("ad_archive_id, analysis").in("ad_archive_id", keys.slice(i, i + 200))
    for (const r of data ?? []) analyses.set(r.ad_archive_id as string, r.analysis as AnalysisDoc)
  }

  const missing = (campaign.missing_events ?? []) as StoreEvent[]
  const totals = zeroCounters()
  const summary = new Map<string, AuditCampaignRow["results"][number]>()
  const adsetViews: AuditAdsetView[] = []
  const groups: AdsetRow[] = [...adsets, ...(ads.some((a) => !a.adset_id) ? [{ id: "", name: "Sin conjunto", optimization_goal: null }] : [])]
  for (const s of groups) {
    const members = ads.filter((a) => (a.adset_id ?? "") === s.id)
    if (members.length === 0) continue
    const memberIds = new Set(members.map((m) => m.id))
    const setRows = rows.filter((r) => memberIds.has(r.ad_id))

    // Qué es «Resultado» en este conjunto (manual → lo que optimiza → respaldo).
    const actionTotals: Record<string, number> = {}
    for (const r of setRows) for (const [k, n] of Object.entries(r.actions ?? {})) actionTotals[k] = (actionTotals[k] ?? 0) + (Number(n) || 0)
    const result = resolveAdsetResult({
      objective: campaign.objective, optimizationGoal: s.optimization_goal,
      promotedObject: s.promoted_object ?? null, override: s.result_override ?? null, actionTotals,
    })

    const hasActions = setRows.some((r) => r.actions && Object.keys(r.actions).length > 0)
    if (!hasActions && setRows.length > 0 && result.kind !== "purchase" && result.field !== "impressions") result.stale = true

    const countersByAd = new Map<string, Counters>()
    const weeklyByAd = new Map<string, Map<string, Counters>>()
    for (const r of setRows) {
      const { results, value } = rowResult(r, result)
      const row = { ...r, results, result_value: value }
      // Anuncios a mensajes / formularios: no hay clics de salida, el clic es
      // al chat o al formulario (link_click). Sin esto el CTR sale en 0 %.
      if (!(Number(r.outbound_clicks) > 0) && Number(r.actions?.link_click) > 0) row.outbound_clicks = Number(r.actions!.link_click)
      const c = countersByAd.get(r.ad_id) ?? countersByAd.set(r.ad_id, zeroCounters()).get(r.ad_id)!
      addCounters(c, row)
      const weeks = weeklyByAd.get(r.ad_id) ?? weeklyByAd.set(r.ad_id, new Map()).get(r.ad_id)!
      const wk = weekStart(String(r.date))
      addCounters(weeks.get(wk) ?? weeks.set(wk, zeroCounters()).get(wk)!, row)
    }
    // Alcance como resultado: no se suma por día, va por período.
    if (result.field === "reach") {
      for (const m of members) {
        const c = countersByAd.get(m.id)
        if (c) c.results = Number(period.get(m.id)?.reach) || 0
      }
    }

    const { evaluations, medians, totals: setTotals } = evaluateAdset(
      members.map((a) => ({ id: a.id, isVideo: a.format === "video", counters: countersByAd.get(a.id) ?? zeroCounters() })),
      missing, defs, result.kind, result.label,
    )
    addCounters(totals, setTotals)
    const sum = summary.get(result.label) ?? { label: result.label, kind: result.kind, results: 0, spend: 0, value: 0 }
    sum.results += setTotals.results; sum.spend += setTotals.spend; sum.value += setTotals.result_value
    summary.set(result.label, sum)

    const views: AuditAdView[] = members.map((a) => {
      const v = a.meta_video_id ? videoById.get(a.meta_video_id) : undefined
      const p = period.get(a.id)
      const an = analyses.get(auditAnalysisKey(a))
      return {
        id: a.id, meta_ad_id: a.meta_ad_id, name: a.name, status: a.status, format: a.format,
        videoUrl: (v?.storage_url as string | null) ?? null,
        posterUrl: (v?.picture_url as string | null) ?? a.cached_image_url ?? null,
        imageUrl: a.cached_image_url ?? a.image_url,
        durationSec: v?.duration_sec != null ? Number(v.duration_sec) : null,
        landingUrl: a.landing_url, body: a.body,
        counters: countersByAd.get(a.id) ?? zeroCounters(),
        curve: Array.isArray(p?.curve) ? p!.curve : null,
        reach: p?.reach != null ? Number(p.reach) : null,
        frequency: p?.frequency != null ? Number(p.frequency) : null,
        avgWatchSec: p?.avg_watch_sec != null ? Number(p.avg_watch_sec) : null,
        weekly: [...(weeklyByAd.get(a.id) ?? new Map()).entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([week, counters]) => ({ week, counters })),
        evaluation: evaluations.find((e) => e.id === a.id)!,
        analysisKey: auditAnalysisKey(a),
        parts: an?.partes ?? null,
        conceptName: an?.concepto?.nombre ?? null,
        structure: Array.isArray(an?.estructura) ? an!.estructura! : [],
        concept: an?.concepto ? { angle_type: an.concepto.angle_type, awareness_stage: an.concepto.awareness_stage, funnel_stage: an.concepto.funnel_stage } : null,
        brandLineId: a.audit_brand_line_id ?? null,
      }
    }).sort((x, y) => y.counters.spend - x.counters.spend)
    adsetViews.push({ id: s.id, name: s.name, optimization_goal: s.optimization_goal, result, totals: setTotals, medians, ads: views })
  }
  adsetViews.sort((x, y) => y.totals.spend - x.totals.spend)

  return {
    metrics: defs,
    account: account as CampaignAuditView["account"],
    campaign: { ...campaign, missing_events: missing } as CampaignAuditView["campaign"],
    totals,
    resultSummary: [...summary.values()].sort((a, b) => b.spend - a.spend),
    adsets: adsetViews,
  }
}

// Todas las campañas de una cuenta ya evaluadas (para «Qué funciona»).
export async function getAccountCampaignViews(accountId: string): Promise<CampaignAuditView[]> {
  const admin = createAdminClient()
  const { data: camps } = await admin.from("audit_campaigns").select("id").eq("account_id", accountId)
  const views: CampaignAuditView[] = []
  for (const c of camps ?? []) {
    const v = await getCampaignAudit(c.id)
    if (v) views.push(v)
  }
  return views
}

// Hipótesis de una campaña (fase 2) con su estado (fase 3).
export interface AuditHypothesis {
  id: string
  adset_id: string | null
  part: "gancho" | "cuerpo" | "cierre" | "tienda" | "general"
  claim: string
  evidence: string
  test: string | null
  confidence: "alta" | "media" | "baja"
  ad_ids: string[]
  status: "open" | "confirmed" | "discarded"
  status_note: string | null
  status_changed_at: string | null
  period_since: string | null
  period_until: string | null
  created_at: string
}

export async function getCampaignHypotheses(campaignId: string): Promise<{ rows: AuditHypothesis[]; error: string | null }> {
  const { data, error } = await createAdminClient().from("audit_hypotheses")
    .select("id, adset_id, part, claim, evidence, test, confidence, ad_ids, status, status_note, status_changed_at, period_since, period_until, created_at")
    .eq("campaign_id", campaignId).order("created_at", { ascending: false })
  if (error) return { rows: [], error: /audit_hypotheses/.test(error.message) ? "Falta correr la migración 125 en Supabase" : error.message }
  return { rows: (data ?? []) as AuditHypothesis[], error: null }
}
