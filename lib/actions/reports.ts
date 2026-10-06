"use server"

import { getProjectContext, contextBlock } from "@/lib/project-context"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getMetaRangeReach } from "@/lib/actions/meta"
import { parseAiJson } from "@/lib/utils/ai-json"
import { resultLabel, RESULT_SINGULAR } from "@/lib/utils/result-label"
import { totalsForRange, type ManualSnapshot } from "@/lib/utils/manual-campaign-calc"
import { formatCycleRange } from "@/lib/utils"
import type { ReportData, ReportSections, ReportRow, ReportChannel, ReportCreative, ReportCampaign, PaidMediaReport } from "@/lib/reports/types"

// Reportes de Paid Media bajo demanda (cualquier rango). Los números salen
// del dashboard y se guardan como snapshot; la narrativa es un borrador de
// IA que respeta esos números y las notas del equipo, y se edita antes de
// entregar. El DOCX usa el mismo diseño del script canónico de Alpha Marino
// (app/api/reports/[id]/docx).

const ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/`

async function auth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, userId: user.id }
}

const isoAdd = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000) + 1

type StatRow = { ad_id: string; date: string; spend: number | null; impressions: number | null; link_clicks: number | null; results: number | null; results_type: string | null }

async function statsInRange(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string, start: string, end: string) {
  const out: StatRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("meta_ad_daily_stats")
      .select("ad_id, date, spend, impressions, link_clicks, results, results_type")
      .eq("project_id", projectId).gte("date", start).lte("date", end).order("date").range(from, from + 999)
    out.push(...((data ?? []) as StatRow[]))
    if (!data || data.length < 1000) break
  }
  return out
}

function sum(rows: StatRow[]) {
  return rows.reduce((t, r) => ({
    spend: t.spend + Number(r.spend ?? 0),
    impressions: t.impressions + Number(r.impressions ?? 0),
    clicks: t.clicks + Number(r.link_clicks ?? 0),
    results: t.results + Number(r.results ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, results: 0 })
}

function delta(cur: number | null, prev: number | null, lowerIsBetter = false): ReportRow["delta"] {
  if (cur === null || prev === null || prev === 0) return null
  const pct = ((cur - prev) / prev) * 100
  if (Math.abs(pct) < 1) return { texto: "= vs. período anterior", tono: "neu" }
  const good = lowerIsBetter ? pct < 0 : pct > 0
  return { texto: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% vs. período anterior`, tono: good ? "pos" : "neg" }
}

export async function buildReportData(projectId: string, start: string, end: string): Promise<ReportData> {
  const { supabase } = await auth()
  const [{ data: project }, { data: integration }, { data: context }, { data: ads }, stats] = await Promise.all([
    supabase.from("projects").select("name, customer:customers(name, company)").eq("id", projectId).single(),
    supabase.from("project_integrations").select("currency").eq("project_id", projectId).eq("platform", "meta").maybeSingle(),
    supabase.from("paid_media_context").select("synced_campaign_ids").eq("project_id", projectId).maybeSingle(),
    supabase.from("meta_ads").select("ad_id, ad_name, campaign_id, campaign_name, thumbnail_url, image_url").eq("project_id", projectId),
    statsInRange(supabase, projectId, start, end),
  ])
  const customer = (project?.customer as unknown as { name: string | null; company: string | null } | null)
  const moneda = (integration?.currency as string | null) ?? "USD"
  const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`
  const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 })

  // Período anterior de la misma duración, para comparar.
  const len = daysBetween(start, end)
  const prevStart = isoAdd(start, -len), prevEnd = isoAdd(start, -1)
  const [prevStats, reach] = await Promise.all([
    statsInRange(supabase, projectId, prevStart, prevEnd),
    getMetaRangeReach(projectId, start, end),
  ])

  const t = sum(stats), p = sum(prevStats)
  const type = stats.find((r) => r.results_type)?.results_type ?? null
  const label = resultLabel(type)
  const singular = RESULT_SINGULAR[label] ?? "resultado"
  const cpr = t.results > 0 ? t.spend / t.results : null
  const prevCpr = p.results > 0 ? p.spend / p.results : null
  const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null
  const prevCtr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : null
  const hasPrev = p.spend > 0

  const canales: ReportChannel[] = []
  if (t.spend > 0) {
    const filas: ReportRow[] = [
      { metrica: "Gasto total", valor: money(t.spend), delta: hasPrev ? delta(t.spend, p.spend) && { ...delta(t.spend, p.spend)!, tono: "neu" } : null },
      { metrica: "Impresiones", valor: num(t.impressions) },
    ]
    if (reach) {
      filas.push({ metrica: "Alcance", valor: num(reach.reach) })
      filas.push({ metrica: "Frecuencia", valor: reach.frequency.toFixed(2) })
    }
    filas.push({ metrica: "CPM promedio", valor: t.impressions ? money((t.spend / t.impressions) * 1000) : "—" })
    if (t.clicks > 0) {
      filas.push({ metrica: "Clics al enlace", valor: num(t.clicks) })
      filas.push({ metrica: "CTR (enlace)", valor: ctr !== null ? `${ctr.toFixed(2)}%` : "—", delta: hasPrev ? delta(ctr, prevCtr) : null })
      filas.push({ metrica: "CPC promedio", valor: money(t.spend / t.clicks) })
    }
    filas.push({ metrica: label, valor: num(t.results), delta: hasPrev ? delta(t.results, p.results) : null })
    filas.push({ metrica: `Costo por ${singular}`, valor: cpr !== null ? money(cpr) : "—", delta: hasPrev ? delta(cpr, prevCpr, true) : null })
    canales.push({ key: "meta", nombre: "Meta Ads — Facebook / Instagram", manual: false, filas, gasto: t.spend, resultados: t.results })
  }

  // Campañas manuales (TikTok, Pinterest…): lo del rango sale de sus capturas acumuladas.
  const { data: manual } = await supabase.from("manual_campaigns")
    .select("name, channel, result_type, start_date, end_date, snapshots:manual_campaign_snapshots(id, as_of, spend, impressions, clicks, results)")
    .eq("project_id", projectId).lte("start_date", end)
  const manualByChannel = new Map<string, { spend: number; impressions: number; clicks: number; results: number; resultType: string | null; campaigns: ReportCampaign[] }>()
  for (const m of (manual ?? []) as { name: string; channel: string; result_type: string | null; end_date: string | null; snapshots: ManualSnapshot[] }[]) {
    if (m.end_date && m.end_date < start) continue
    const snaps = (m.snapshots ?? []).map((s) => ({ ...s, spend: Number(s.spend), impressions: s.impressions === null ? null : Number(s.impressions), clicks: s.clicks === null ? null : Number(s.clicks), results: s.results === null ? null : Number(s.results) }))
    const { totals } = totalsForRange(snaps, start, end)
    if (!totals || totals.spend <= 0) continue
    const c = manualByChannel.get(m.channel) ?? { spend: 0, impressions: 0, clicks: 0, results: 0, resultType: m.result_type, campaigns: [] }
    c.spend += totals.spend; c.impressions += totals.impressions ?? 0; c.clicks += totals.clicks ?? 0; c.results += totals.results ?? 0
    c.campaigns.push({ nombre: m.name, canal: m.channel, gasto: totals.spend, resultados: totals.results ?? 0, costoPorResultado: totals.results ? totals.spend / totals.results : null })
    manualByChannel.set(m.channel, c)
  }
  for (const [channel, c] of manualByChannel) {
    const rl = c.resultType ? c.resultType.charAt(0).toUpperCase() + c.resultType.slice(1) : "Resultados"
    const filas: ReportRow[] = [{ metrica: "Gasto total", valor: money(c.spend) }]
    if (c.impressions) filas.push({ metrica: "Impresiones", valor: num(c.impressions) }, { metrica: "CPM promedio", valor: money((c.spend / c.impressions) * 1000) })
    if (c.clicks) filas.push({ metrica: "Clics", valor: num(c.clicks) })
    if (c.clicks && c.impressions) filas.push({ metrica: "CTR", valor: `${((c.clicks / c.impressions) * 100).toFixed(2)}%` })
    if (c.results) filas.push({ metrica: rl, valor: num(c.results) }, { metrica: "Costo por resultado", valor: money(c.spend / c.results) })
    canales.push({ key: channel, nombre: channel, manual: true, filas, gasto: c.spend, resultados: c.results })
  }

  const totalSpend = canales.reduce((n, c) => n + c.gasto, 0)
  const totalResults = canales.reduce((n, c) => n + c.resultados, 0)
  const consolidado: ReportRow[] | null = canales.length > 1 ? [
    { metrica: "Gasto total combinado", valor: money(totalSpend) },
    { metrica: "Total de resultados", valor: num(totalResults) },
    { metrica: "Costo por resultado combinado", valor: totalResults ? money(totalSpend / totalResults) : "—" },
  ] : null

  // Por campaña y por anuncio (Meta).
  const adById = new Map((ads ?? []).map((a) => [a.ad_id as string, a]))
  const byAd = new Map<string, StatRow[]>()
  for (const r of stats) (byAd.get(r.ad_id) ?? byAd.set(r.ad_id, []).get(r.ad_id)!).push(r)
  const byCampaign = new Map<string, { nombre: string; spend: number; results: number }>()
  for (const [adId, rows] of byAd) {
    const a = adById.get(adId)
    const key = (a?.campaign_id as string) ?? "sin-campaña"
    const s = sum(rows)
    const c = byCampaign.get(key) ?? { nombre: (a?.campaign_name as string) ?? "Campaña", spend: 0, results: 0 }
    c.spend += s.spend; c.results += s.results
    byCampaign.set(key, c)
  }
  const campanas: ReportCampaign[] = [
    ...[...byCampaign.values()].filter((c) => c.spend > 0).map((c) => ({ nombre: c.nombre, canal: "Meta Ads", gasto: c.spend, resultados: c.results, costoPorResultado: c.results ? c.spend / c.results : null })),
    ...[...manualByChannel.values()].flatMap((c) => c.campaigns),
  ].sort((a, b) => b.gasto - a.gasto)
  const synced = (context?.synced_campaign_ids as string[] | null) ?? []
  const campanasSinGasto = [...new Set((ads ?? []).filter((a) => synced.includes(a.campaign_id as string) && !(byCampaign.get(a.campaign_id as string)?.spend)).map((a) => a.campaign_name as string).filter(Boolean))]

  // Creativos: top 6 por resultados, con el asset del dashboard si está vinculado.
  const adIds = [...byAd.keys()]
  const { data: links } = adIds.length
    ? await supabase.from("creative_asset_meta_ads").select("meta_ad_id, asset:creative_assets(thumbnail_path, file_path, asset_url, file_type, concept:creative_concepts(name))").eq("project_id", projectId).in("meta_ad_id", adIds)
    : { data: [] }
  const linkByAd = new Map((links ?? []).map((l) => [l.meta_ad_id as string, l.asset as unknown as { thumbnail_path: string | null; file_path: string | null; asset_url: string | null; file_type: string | null; concept: { name: string | null } | null } | null]))
  const creativosAll: ReportCreative[] = [...byAd.entries()].map(([adId, rows]) => {
    const s = sum(rows)
    const a = adById.get(adId)
    const asset = linkByAd.get(adId)
    const assetThumb = asset?.thumbnail_path ? ASSET_BASE + asset.thumbnail_path : asset?.file_type !== "video" && asset?.file_path ? ASSET_BASE + asset.file_path : null
    return {
      adName: (a?.ad_name as string) ?? "Anuncio",
      campaign: (a?.campaign_name as string) ?? null,
      concept: asset?.concept?.name ?? null,
      thumbUrl: assetThumb ?? (a?.thumbnail_url as string | null) ?? (a?.image_url as string | null) ?? null,
      gasto: s.spend, resultados: s.results,
      costoPorResultado: s.results ? s.spend / s.results : null,
      ctr: s.impressions ? (s.clicks / s.impressions) * 100 : null,
      ganador: false,
    }
  }).filter((c) => c.gasto > 0).sort((x, y) => y.resultados - x.resultados || (x.costoPorResultado ?? 1e9) - (y.costoPorResultado ?? 1e9))
  const creativos = creativosAll.slice(0, 6)
  if (creativos[0]?.resultados) creativos[0].ganador = true

  // Entregables del alcance del servicio que caen en el rango.
  const { data: periods } = await supabase.from("project_deliverable_periods")
    .select("deliverable_text, period_start, period_end, period_label, expected_quantity, fulfilled_quantity")
    .eq("project_id", projectId).neq("period_label", "Único").lte("period_start", end)
  const entregables = ((periods ?? []) as { deliverable_text: string; period_start: string; period_end: string | null; expected_quantity: number; fulfilled_quantity: number }[])
    .filter((r) => (r.period_end ?? r.period_start) >= start)
    .map((r) => ({ texto: r.deliverable_text, hecho: r.fulfilled_quantity, esperado: r.expected_quantity }))

  return {
    cliente: customer?.company || customer?.name || (project?.name as string) || "Cliente",
    periodo: { start, end, label: formatCycleRange(start, end) },
    generadoEl: new Date().toISOString(),
    moneda,
    resultadoLabel: label,
    canales,
    consolidado,
    campanas,
    campanasSinGasto,
    creativos,
    entregables,
    previo: hasPrev ? { label: formatCycleRange(prevStart, prevEnd), gasto: p.spend, resultados: p.results, costoPorResultado: prevCpr } : null,
  }
}

// ── Narrativa ─────────────────────────────────────────────────────────
// Las reglas salen de lo que el dashboard sí sabe: cada cifra citada tiene
// que existir en los datos; lo cualitativo (inbox, llamadas) solo si viene
// en las notas del equipo.
async function draftSections(data: ReportData, notes: string, projectCtx = ""): Promise<ReportSections> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado")
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey })

  const system = `Eres el estratega de paid media de Alpha Marino y escribes el reporte para el cliente, en español, con tono claro y directo (sin jerga de agencia, sin disculpas, sin relleno).

REGLAS DE DATOS (obligatorias):
- Solo puedes citar cifras que aparezcan en DATOS. Nunca inventes métricas, porcentajes ni resultados de negocio (ventas, ROAS) que no estén ahí.
- Lo cualitativo (qué dijo el cliente, sentimiento del inbox, calidad de leads) solo si viene en NOTAS DEL EQUIPO; atribúyelo ("el cliente confirmó…").
- Si hay "previo", compara contra él con los deltas dados; si no, no compares.
- Usa la moneda indicada y el nombre del resultado tal cual (ej. "conversaciones iniciadas").

SECCIONES:
- resumen: 3-4 oraciones. ¿Fue un buen período? El número más importante. Qué necesita atención. Si las notas traen un hecho de negocio relevante, inclúyelo.
- que_funciono: 2-4 viñetas "Canal — campaña/creativo/concepto: dato + por qué funcionó". Usa campañas y creativos de DATOS (el ganador primero).
- que_no_funciono: 1-3 viñetas "Canal — elemento: dato + causa probable". Si nada salió mal, oportunidades concretas de mejora.
- contexto: máximo 120 palabras: qué campañas tuvieron gasto, cuáles no (campanasSinGasto), canales activos, y entregables del período si los hay. No repitas el resumen.
- siguientes_pasos: 3-5 acciones concretas en primera persona del plural, con cifras cuando haya base (ej. costo por resultado objetivo). Integra lo que digan las notas.
- nota_cierre: vacío salvo que las notas indiquen algo pendiente del cliente (ej. cifras que debe compartir).

Responde ÚNICAMENTE con JSON: {"resumen": "", "que_funciono": [""], "que_no_funciono": [""], "contexto": "", "siguientes_pasos": [""], "nota_cierre": ""}`

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: `DATOS:\n${JSON.stringify({ ...data, creativos: data.creativos.map(({ thumbUrl: _t, ...c }) => { void _t; return c }) }, null, 1)}\n\nNOTAS DEL EQUIPO:\n${notes.trim() || "(sin notas)"}${projectCtx ? `\n\n${projectCtx}` : ""}` }],
  })
  const s = parseAiJson<Partial<ReportSections>>(msg, "draftReportSections")
  return {
    resumen: s.resumen ?? "",
    que_funciono: s.que_funciono ?? [],
    que_no_funciono: s.que_no_funciono ?? [],
    contexto: s.contexto ?? "",
    siguientes_pasos: s.siguientes_pasos ?? [],
    nota_cierre: s.nota_cierre ?? "",
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────
export async function createReport(projectId: string, input: { start: string; end: string; notes: string; cycleId?: string | null }): Promise<string> {
  const { supabase, userId } = await auth()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end) || input.end < input.start) throw new Error("Rango de fechas inválido")
  const data = await buildReportData(projectId, input.start, input.end)
  if (!data.canales.length) throw new Error("No hay gasto registrado en ese rango (Meta ni campañas manuales).")
  const sections = await draftSections(data, input.notes, contextBlock(await getProjectContext(projectId, { since: input.start, until: input.end })))
  const { data: row, error } = await supabase.from("paid_media_reports").insert({
    project_id: projectId, cycle_id: input.cycleId ?? null, start_date: input.start, end_date: input.end,
    title: `Reporte ${data.periodo.label}`, notes: input.notes.trim() || null, data, sections, created_by: userId,
  }).select("id").single()
  if (error) throw new Error(error.message.includes("paid_media_reports") ? "Falta correr la migración 106 en Supabase" : error.message)
  revalidatePath(`/projects/${projectId}`)
  return row.id as string
}

export async function getReports(projectId: string): Promise<Pick<PaidMediaReport, "id" | "title" | "start_date" | "end_date" | "status" | "created_at" | "delivered_at">[]> {
  const { supabase } = await auth()
  const { data, error } = await supabase.from("paid_media_reports").select("id, title, start_date, end_date, status, created_at, delivered_at")
    .eq("project_id", projectId).order("created_at", { ascending: false })
  if (error) return []
  return data ?? []
}

export async function getReport(id: string): Promise<PaidMediaReport | null> {
  const { supabase } = await auth()
  const { data } = await supabase.from("paid_media_reports").select("*").eq("id", id).maybeSingle()
  return (data as PaidMediaReport | null) ?? null
}

export async function saveReportSections(id: string, sections: ReportSections, notes?: string): Promise<void> {
  const { supabase } = await auth()
  const { error } = await supabase.from("paid_media_reports").update({ sections, ...(notes !== undefined ? { notes } : {}), updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error(error.message)
}

// Vuelve a escribir la narrativa (con notas nuevas); opcionalmente refresca los números.
export async function regenerateReport(id: string, notes: string, refreshData: boolean): Promise<PaidMediaReport> {
  const { supabase } = await auth()
  const current = await getReport(id)
  if (!current) throw new Error("Reporte no encontrado")
  const data = refreshData ? await buildReportData(current.project_id, current.start_date, current.end_date) : current.data
  const sections = await draftSections(data, notes, contextBlock(await getProjectContext(current.project_id, { since: current.start_date, until: current.end_date })))
  const { data: row, error } = await supabase.from("paid_media_reports")
    .update({ data, sections, notes: notes.trim() || null, updated_at: new Date().toISOString() }).eq("id", id).select("*").single()
  if (error) throw new Error(error.message)
  return row as PaidMediaReport
}

export async function setReportDelivered(id: string, delivered: boolean): Promise<void> {
  const { supabase } = await auth()
  const { data, error } = await supabase.from("paid_media_reports")
    .update({ status: delivered ? "delivered" : "draft", delivered_at: delivered ? new Date().toISOString() : null }).eq("id", id).select("project_id").single()
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${data.project_id}`)
}

export async function deleteReport(id: string): Promise<void> {
  const { supabase } = await auth()
  const { data } = await supabase.from("paid_media_reports").select("project_id").eq("id", id).maybeSingle()
  const { error } = await supabase.from("paid_media_reports").delete().eq("id", id)
  if (error) throw new Error(error.message)
  if (data?.project_id) revalidatePath(`/projects/${data.project_id}`)
}
