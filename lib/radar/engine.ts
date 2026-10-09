import { createAdminClient } from "@/lib/supabase/admin"
import type { RadarRec, RadarSnapshot, RadarStrategy, RadarAdRef, StrategyLine, RadarSeverity } from "@/lib/radar/types"

// Motor del Radar Paid Media. Solo servidor (cliente admin): quien llama
// valida permisos. REGLAS FIJAS sobre los datos que ya se sincronizan
// (meta_ad_daily_stats 3 veces al día + campañas manuales), comparadas
// contra la estrategia del ciclo que definió una persona. Sin estrategia
// no hay recomendaciones: solo "Define la estrategia".
//
// Multicanal: el gasto/resultados se normalizan por canal (Meta automático,
// los demás por captura manual). Las reglas por anuncio solo existen donde
// hay datos por anuncio (Meta); las de presupuesto y costo usan todo.

const ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/`
const DAY = 86_400_000
const SEV: Record<RadarSeverity, number> = { crit: 0, warn: 1, good: 2 }
const TEST_RE = /prueba|test|testing/i

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY) + 1

function money(n: number, currency: string) {
  try { return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: n < 100 ? 2 : 0 }).format(n) }
  catch { return `${currency} ${n.toFixed(2)}` }
}
const pct = (n: number) => `${n >= 0 ? "" : "−"}${Math.abs(Math.round(n))}%`

type Daily = { ad_id: string; date: string; spend: number | null; impressions: number | null; clicks: number | null; results: number | null }
type AdDim = { ad_id: string; ad_name: string | null; ad_set_name: string | null; campaign_id: string | null; campaign_name: string | null; status: string | null; thumbnail_url: string | null; image_url: string | null }

export async function buildRadar(projectId: string, opts: { canEdit: boolean }): Promise<RadarSnapshot> {
  const db = createAdminClient()
  const [{ data: project }, { data: cycle }, { data: integration }, { data: context }] = await Promise.all([
    db.from("projects").select("id, name, customer:customers(name)").eq("id", projectId).single(),
    db.from("paid_media_cycles").select("id, start_date, end_date").eq("project_id", projectId).eq("is_active", true).maybeSingle(),
    db.from("project_integrations").select("currency").eq("project_id", projectId).eq("platform", "meta").maybeSingle(),
    db.from("paid_media_context").select("synced_campaign_ids").eq("project_id", projectId).maybeSingle(),
  ])
  const currency = (integration?.currency as string | null) || "USD"
  const base: RadarSnapshot = {
    projectId, projectName: project?.name ?? "Proyecto",
    clientName: (project?.customer as unknown as { name: string } | null)?.name ?? null,
    cycle: null, currency, strategy: null, pacing: null, channels: [],
    kpis: { results: 0, cpr: null, targetCpr: null, frequency: null, ctr: null },
    recs: [], hiddenCount: 0, topAds: [], lastSyncAt: null, summary: "", counts: { crit: 0, warn: 0, good: 0 }, canEdit: opts.canEdit,
  }
  if (!cycle) { base.summary = "No hay ciclo activo."; return base }

  const today = isoDay(new Date())
  const until = today < cycle.end_date ? today : cycle.end_date
  const days = daysBetween(cycle.start_date, cycle.end_date)
  const day = Math.max(1, Math.min(days, daysBetween(cycle.start_date, until)))
  base.cycle = { id: cycle.id, start: cycle.start_date, end: cycle.end_date, day, days }

  const [{ data: strat }, { data: daily }, { data: links }, { data: events }, { data: manual }, { data: reach }] = await Promise.all([
    db.from("radar_strategies").select("*, confirmer:profiles!radar_strategies_confirmed_by_fkey(full_name)").eq("project_id", projectId).eq("cycle_id", cycle.id).maybeSingle(),
    db.from("meta_ad_daily_stats").select("ad_id, date, spend, impressions, clicks, results, synced_at").eq("project_id", projectId).eq("cycle_id", cycle.id),
    db.from("creative_asset_meta_ads").select("meta_ad_id, asset:creative_assets(id, file_path, thumbnail_path, asset_url, concept:creative_concepts(id, name, brand_line_id))").eq("project_id", projectId),
    db.from("radar_events").select("rec_key").eq("project_id", projectId).eq("cycle_id", cycle.id),
    db.from("manual_campaigns").select("id, channel, name, status, snapshots:manual_campaign_snapshots(as_of, spend, results)").eq("project_id", projectId),
    db.from("meta_cycle_reach").select("object_id, frequency").eq("project_id", projectId).eq("cycle_id", cycle.id).eq("level", "ad"),
  ])

  // ── Estrategia ──────────────────────────────────────────────────────
  if (strat) {
    base.strategy = {
      id: strat.id, cycle_id: strat.cycle_id, budget: Number(strat.budget), budget_guard: strat.budget_guard,
      lines: (strat.lines ?? []) as StrategyLine[], testing_concept_ids: strat.testing_concept_ids ?? [], bet: strat.bet,
      confirmed_by_name: (strat.confirmer as { full_name: string } | null)?.full_name ?? null, confirmed_at: strat.confirmed_at,
    } satisfies RadarStrategy
  }
  const handled = new Set((events ?? []).map((e) => e.rec_key))
  const rows = (daily ?? []) as (Daily & { synced_at: string })[]
  base.lastSyncAt = rows.reduce<string | null>((m, r) => (!m || r.synced_at > m ? r.synced_at : m), null)

  // ── Anuncios (dimensión) + vínculo a concepto ───────────────────────
  const adIds = [...new Set(rows.map((r) => r.ad_id))]
  const dims = new Map<string, AdDim>()
  for (let i = 0; i < adIds.length; i += 200) {
    const { data } = await db.from("meta_ads").select("ad_id, ad_name, ad_set_name, campaign_id, campaign_name, status, thumbnail_url, image_url").eq("project_id", projectId).in("ad_id", adIds.slice(i, i + 200))
    for (const d of (data ?? []) as AdDim[]) dims.set(d.ad_id, d)
  }
  type Link = { conceptId: string | null; conceptName: string | null; lineId: string | null; thumb: string | null }
  const linkByAd = new Map<string, Link>()
  for (const l of (links ?? []) as unknown as { meta_ad_id: string; asset: { file_path: string | null; thumbnail_path: string | null; asset_url: string | null; concept: { id: string; name: string | null; brand_line_id: string | null } | null } | null }[]) {
    const a = l.asset
    linkByAd.set(l.meta_ad_id, {
      conceptId: a?.concept?.id ?? null, conceptName: a?.concept?.name ?? null, lineId: a?.concept?.brand_line_id ?? null,
      thumb: a?.thumbnail_path ? ASSET_BASE + a.thumbnail_path : a?.file_path && !/\.(mp4|mov|webm)$/i.test(a.file_path) ? ASSET_BASE + a.file_path : a?.asset_url ?? null,
    })
  }
  const freqByAd = new Map((reach ?? []).map((r) => [r.object_id as string, Number(r.frequency)]))
  const ref = (adId: string): RadarAdRef => {
    const d = dims.get(adId), l = linkByAd.get(adId)
    return { adId, name: d?.ad_name ?? adId, thumb: d?.thumbnail_url || d?.image_url || l?.thumb || null, conceptName: l?.conceptName ?? null, campaignName: d?.campaign_name ?? null }
  }

  // ── Métricas por anuncio ────────────────────────────────────────────
  type AdAgg = { spend: number; results: number; impr: number; clicks: number; days: Set<string>; byDate: Map<string, Daily> }
  const agg = new Map<string, AdAgg>()
  for (const r of rows) {
    const a = agg.get(r.ad_id) ?? { spend: 0, results: 0, impr: 0, clicks: 0, days: new Set(), byDate: new Map() }
    a.spend += Number(r.spend ?? 0); a.results += Number(r.results ?? 0); a.impr += Number(r.impressions ?? 0); a.clicks += Number(r.clicks ?? 0)
    if (Number(r.spend ?? 0) > 0) a.days.add(r.date)
    a.byDate.set(r.date, r)
    agg.set(r.ad_id, a)
  }
  const metaSpend = [...agg.values()].reduce((s, a) => s + a.spend, 0)
  const metaResults = [...agg.values()].reduce((s, a) => s + a.results, 0)
  const metaImpr = [...agg.values()].reduce((s, a) => s + a.impr, 0)
  const metaClicks = [...agg.values()].reduce((s, a) => s + a.clicks, 0)

  // ── Campañas manuales (otros canales): delta del ciclo ──────────────
  const manualByChannel = new Map<string, { spend: number; results: number }>()
  for (const c of (manual ?? []) as { channel: string; snapshots: { as_of: string; spend: number; results: number | null }[] }[]) {
    const snaps = [...(c.snapshots ?? [])].sort((a, b) => a.as_of.localeCompare(b.as_of))
    const lastIn = [...snaps].reverse().find((s) => s.as_of >= cycle.start_date && s.as_of <= cycle.end_date)
    if (!lastIn) continue
    const before = [...snaps].reverse().find((s) => s.as_of < cycle.start_date)
    const m = manualByChannel.get(c.channel) ?? { spend: 0, results: 0 }
    m.spend += Number(lastIn.spend) - Number(before?.spend ?? 0)
    m.results += Number(lastIn.results ?? 0) - Number(before?.results ?? 0)
    manualByChannel.set(c.channel, m)
  }
  base.channels = [
    ...(metaSpend > 0 || adIds.length ? [{ channel: "Meta Ads", spend: metaSpend, results: metaResults }] : []),
    ...[...manualByChannel].map(([channel, m]) => ({ channel, spend: Math.max(0, m.spend), results: Math.max(0, m.results) })),
  ]
  const totalSpend = base.channels.reduce((s, c) => s + c.spend, 0)
  const totalResults = base.channels.reduce((s, c) => s + c.results, 0)

  const lines = base.strategy?.lines ?? []
  const lineFor = (adId: string) => {
    const lid = linkByAd.get(adId)?.lineId ?? null
    return lines.find((l) => l.brand_line_id && l.brand_line_id === lid) ?? (lines.length === 1 ? lines[0] : lines.find((l) => !l.brand_line_id)) ?? null
  }
  const targets = lines.map((l) => l.target_cpr).filter((t): t is number => !!t)
  const globalTarget = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null
  const freqs = [...freqByAd.values()].filter((f) => f > 0)
  base.kpis = {
    results: totalResults,
    cpr: totalResults > 0 ? totalSpend / totalResults : null,
    targetCpr: globalTarget,
    frequency: freqs.length ? freqs.reduce((a, b) => a + b, 0) / freqs.length : null,
    ctr: metaImpr > 0 ? (metaClicks / metaImpr) * 100 : null,
  }
  base.topAds = [...agg.entries()].sort((a, b) => b[1].spend - a[1].spend).slice(0, 6).map(([id]) => ref(id))

  const recs: RadarRec[] = []
  const m = (n: number) => money(n, currency)

  // ── Sin estrategia: el Radar se bloquea ─────────────────────────────
  if (!base.strategy) {
    recs.push({
      key: "strategy", rule: "strategy", severity: "crit", channel: "Todos", where: "Este ciclo",
      title: "Define la estrategia del ciclo para activar el Radar.",
      evidence: [{ label: "Ciclo", value: `día ${day} de ${days}` }, { label: "Gasto hasta hoy", value: m(totalSpend) }],
      ads: [], action: { kind: "strategy", label: "Definir estrategia" }, impact: 1e9,
    })
    return finish(base, recs, handled)
  }
  const S = base.strategy

  // ── Ritmo de gasto (todos los canales) ──────────────────────────────
  const expected = (S.budget * day) / days
  const projection = (totalSpend / day) * days
  const spentPct = S.budget > 0 ? (totalSpend / S.budget) * 100 : 0
  base.pacing = { spend: totalSpend, expected, projection, budget: S.budget, pct: spentPct }
  const activeCampaigns = [...new Set([...agg.entries()].filter(([id, a]) => a.spend > 0 && /ACTIVE/.test(dims.get(id)?.status ?? "")).map(([id]) => dims.get(id)?.campaign_id).filter(Boolean))] as string[]
  const remainingDays = Math.max(1, days - day)
  if (spentPct >= 100) {
    recs.push({
      key: `pacing:100:${cycle.id}`, rule: "pacing", severity: "crit", channel: "Todos", where: "Cuenta completa",
      title: `Llegaste al presupuesto pactado (${m(S.budget)}) y faltan ${days - day} días del ciclo.`,
      evidence: [{ label: "Gastado", value: m(totalSpend), tone: "bad" }, { label: "Pactado", value: m(S.budget) }, { label: "Al día", value: `${day}/${days}` }],
      ads: [], impact: totalSpend,
      action: activeCampaigns.length ? { kind: "pause_campaigns", campaignIds: activeCampaigns, label: `Pausar ${activeCampaigns.length} campaña${activeCampaigns.length === 1 ? "" : "s"} en Meta` } : null,
    })
  } else if (day >= 3 && projection > S.budget * 1.08) {
    const over = projection - S.budget
    const daily = Math.max(0, (S.budget - totalSpend) / remainingDays)
    recs.push({
      key: `pacing:over:${cycle.id}`, rule: "pacing", severity: projection > S.budget * 1.2 ? "crit" : "warn", channel: "Todos", where: "Cuenta completa",
      title: `A este ritmo terminarás ~${m(over)} arriba de lo pactado.`,
      evidence: [{ label: "Gastado", value: m(totalSpend) }, { label: `Esperado al día ${day}`, value: m(expected) }, { label: "Proyección", value: m(projection), tone: "bad" }, { label: "Diario sugerido", value: m(daily), tone: "good" }],
      ads: [], impact: over,
      action: { kind: "task", label: "Crear tarea: bajar presupuesto diario", title: `Bajar presupuesto diario a ${m(daily)}`, description: `Radar: proyección ${m(projection)} vs pactado ${m(S.budget)}. Bajar el presupuesto diario total a ~${m(daily)} para cerrar el ciclo en lo pactado.` },
    })
  } else if (day >= 5 && projection < S.budget * 0.75) {
    recs.push({
      key: `pacing:under:${cycle.id}`, rule: "underspend", severity: "warn", channel: "Todos", where: "Cuenta completa",
      title: `Vas a dejar ~${m(S.budget - projection)} sin invertir del presupuesto pactado.`,
      evidence: [{ label: "Gastado", value: m(totalSpend) }, { label: `Esperado al día ${day}`, value: m(expected) }, { label: "Proyección", value: m(projection), tone: "bad" }],
      ads: [], impact: S.budget - projection, action: null,
    })
  }

  // ── Costo por resultado por línea (Meta por anuncio) ────────────────
  for (const line of lines) {
    if (!line.target_cpr) continue
    const ids = [...agg.keys()].filter((id) => lineFor(id)?.key === line.key)
    const sp = ids.reduce((s, id) => s + agg.get(id)!.spend, 0), rs = ids.reduce((s, id) => s + agg.get(id)!.results, 0)
    if (sp < line.target_cpr * 3) continue
    const cpr = rs > 0 ? sp / rs : null
    if (cpr === null || cpr > line.target_cpr * 1.2) {
      const worst = ids.filter((id) => agg.get(id)!.spend > 0).sort((a, b) => agg.get(b)!.spend - agg.get(a)!.spend).slice(0, 4)
      recs.push({
        key: `line:${line.key}:${cycle.id}`, rule: "line_cpr", severity: cpr === null || cpr > line.target_cpr * 1.5 ? "crit" : "warn", channel: line.channel, where: line.name,
        title: cpr === null ? `${line.name}: ${m(sp)} invertidos sin resultados.` : `${line.name}: costo por resultado ${pct((cpr / line.target_cpr - 1) * 100)} arriba de la meta.`,
        evidence: [{ label: "Actual", value: cpr === null ? "sin resultados" : m(cpr), tone: "bad" }, { label: "Meta", value: m(line.target_cpr) }, { label: "Gasto", value: m(sp) }, { label: "Resultados", value: String(rs) }],
        ads: worst.map(ref), impact: sp, action: null,
      })
    }
  }

  // ── Por anuncio: apagar, graduar, fatiga ────────────────────────────
  const dates = (a: AdAgg) => [...a.byDate.keys()].sort()
  for (const [adId, a] of agg) {
    const dim = dims.get(adId)
    const active = /ACTIVE/.test(dim?.status ?? "") || !dim?.status
    const target = lineFor(adId)?.target_cpr ?? globalTarget
    const cpr = a.results > 0 ? a.spend / a.results : null
    if (target && active) {
      if (a.spend >= target * 2 && (cpr === null || cpr >= target * 1.6)) {
        recs.push({
          key: `kill:${adId}`, rule: "kill", severity: "warn", channel: "Meta Ads", where: dim?.campaign_name ?? "Meta",
          title: cpr === null ? `“${dim?.ad_name ?? adId}” lleva ${m(a.spend)} sin resultados.` : `“${dim?.ad_name ?? adId}” cuesta ${pct((cpr / target - 1) * 100)} más que la meta.`,
          evidence: [{ label: "Gasto", value: m(a.spend) }, { label: "Costo/resultado", value: cpr === null ? "—" : m(cpr), tone: "bad" }, { label: "Meta", value: m(target) }, { label: "Días", value: String(a.days.size) }],
          ads: [ref(adId)], impact: a.spend, action: { kind: "pause_ads", adIds: [adId], label: "Pausar anuncio en Meta" },
        })
        continue
      }
      const isTest = TEST_RE.test(`${dim?.campaign_name ?? ""} ${dim?.ad_set_name ?? ""}`)
      if (isTest && a.days.size >= 4 && a.spend >= target * 1.5 && a.results >= 3 && cpr !== null && cpr <= target) {
        recs.push({
          key: `grad:${adId}`, rule: "graduate", severity: "good", channel: "Meta Ads", where: dim?.campaign_name ?? "Prueba",
          title: `“${dim?.ad_name ?? adId}” ganó la prueba: pásalo a escala.`,
          evidence: [{ label: "Costo/resultado", value: m(cpr), tone: "good" }, { label: "Meta", value: m(target) }, { label: "Resultados", value: String(a.results) }, { label: "Días", value: String(a.days.size) }],
          ads: [ref(adId)], impact: (target - cpr) * a.results,
          action: { kind: "task", label: "Crear tarea: graduar a escala", title: `Graduar a escala: ${dim?.ad_name ?? adId}`, description: `Radar: ganó la prueba (${m(cpr)} vs meta ${m(target)}, ${a.results} resultados en ${a.days.size} días). Duplicarlo a la campaña de escala.` },
        })
      }
    }
    // Fatiga: CTR de los últimos 3 días vs los primeros 3 con entrega.
    const ds = dates(a).filter((d) => Number(a.byDate.get(d)!.impressions ?? 0) > 0)
    const freq = freqByAd.get(adId) ?? null
    if (active && ds.length >= 7 && freq !== null && freq >= 2.8) {
      const ctrOf = (ks: string[]) => { const i = ks.reduce((s, k) => s + Number(a.byDate.get(k)!.impressions ?? 0), 0); const c = ks.reduce((s, k) => s + Number(a.byDate.get(k)!.clicks ?? 0), 0); return i >= 800 ? (c / i) * 100 : null }
      const first = ctrOf(ds.slice(0, 3)), last = ctrOf(ds.slice(-3))
      if (first && last !== null && last <= first * 0.7) {
        recs.push({
          key: `fatigue:${adId}`, rule: "fatigue", severity: "warn", channel: "Meta Ads", where: dim?.campaign_name ?? "Meta",
          title: `“${dim?.ad_name ?? adId}” se está desgastando.`,
          evidence: [{ label: "Frecuencia", value: freq.toFixed(1), tone: "bad" }, { label: "CTR", value: `${first.toFixed(2)}% → ${last.toFixed(2)}%`, tone: "bad" }, { label: "Caída", value: pct((last / first - 1) * 100) }],
          ads: [ref(adId)], impact: a.spend, action: { kind: "pause_ads", adIds: [adId], label: "Pausar anuncio en Meta" },
        })
      }
    }
  }

  // ── Estructura vs presupuesto ───────────────────────────────────────
  const monthly = (S.budget / days) * 30
  const maxCampaigns = monthly < 600 ? 1 : monthly < 1500 ? 2 : monthly < 4000 ? 4 : 99
  if (activeCampaigns.length > maxCampaigns) {
    const weekly = (metaResults / day) * 7
    recs.push({
      key: `structure:${cycle.id}:${activeCampaigns.length}`, rule: "structure", severity: "warn", channel: "Meta Ads", where: "Cuenta completa",
      title: `${activeCampaigns.length} campañas activas para ${m(monthly)}/mes: el presupuesto está fragmentado.`,
      evidence: [{ label: "Por campaña al día", value: m(S.budget / days / activeCampaigns.length) }, { label: "Resultados/semana", value: weekly.toFixed(0), tone: "bad" }, { label: "Recomendado", value: `≤ ${maxCampaigns} campaña${maxCampaigns === 1 ? "" : "s"}` }],
      ads: [], impact: S.budget * 0.3,
      action: { kind: "task", label: "Crear tarea: consolidar campañas", title: "Consolidar campañas", description: `Radar: ${activeCampaigns.length} campañas activas con ${m(monthly)}/mes. Consolidar en ${maxCampaigns} (por línea u oferta); los conceptos viven como conjuntos/anuncios dentro.` },
    })
  }

  // ── Anuncios gastando sin concepto ──────────────────────────────────
  const unlinked = [...agg.entries()].filter(([id, a]) => a.spend > 0 && !linkByAd.get(id)?.conceptId).sort((a, b) => b[1].spend - a[1].spend)
  if (unlinked.length) {
    const sp = unlinked.reduce((s, [, a]) => s + a.spend, 0)
    recs.push({
      key: `unlinked:${cycle.id}:${unlinked.length}`, rule: "unlinked", severity: "warn", channel: "Meta Ads", where: `${unlinked.length} anuncio${unlinked.length === 1 ? "" : "s"}`,
      title: `${unlinked.length} anuncio${unlinked.length === 1 ? "" : "s"} gastando sin concepto: no sabemos qué mensaje está funcionando.`,
      evidence: [{ label: "Gasto sin concepto", value: m(sp), tone: "bad" }, { label: "% del gasto", value: metaSpend ? `${Math.round((sp / metaSpend) * 100)}%` : "—" }],
      ads: unlinked.slice(0, 4).map(([id]) => ref(id)), impact: sp,
      action: { kind: "link", href: `/projects/${projectId}#creative-tracker`, label: "Vincular en Creative Tracker" },
    })
  }

  // ── Conceptos a probar ──────────────────────────────────────────────
  if (!S.testing_concept_ids.length) {
    recs.push({
      key: `testing:none:${cycle.id}`, rule: "testing", severity: "warn", channel: "Todos", where: "Este ciclo",
      title: "Este ciclo no tiene conceptos nuevos a prueba.", evidence: [{ label: "Día del ciclo", value: `${day}/${days}` }],
      ads: [], impact: 1, action: { kind: "strategy", label: "Elegir conceptos" },
    })
  } else if (day >= 7) {
    const running = new Set([...agg.entries()].filter(([, a]) => a.spend > 0).map(([id]) => linkByAd.get(id)?.conceptId).filter(Boolean))
    const missing = S.testing_concept_ids.filter((id) => !running.has(id))
    if (missing.length) {
      const { data: cs } = await db.from("creative_concepts").select("id, name").in("id", missing)
      recs.push({
        key: `testing:idle:${cycle.id}:${missing.length}`, rule: "testing", severity: "warn", channel: "Todos", where: "Este ciclo",
        title: `${missing.length} concepto${missing.length === 1 ? "" : "s"} elegido${missing.length === 1 ? "" : "s"} para probar no está${missing.length === 1 ? "" : "n"} corriendo.`,
        evidence: (cs ?? []).map((c) => ({ label: "Sin anuncios", value: c.name ?? "Concepto" })),
        ads: [], impact: 2,
        action: { kind: "task", label: "Crear tarea al equipo creativo", title: "Lanzar conceptos a prueba", description: `Radar: conceptos elegidos para probar este ciclo sin anuncios corriendo: ${(cs ?? []).map((c) => c.name).join(", ")}.` },
      })
    }
  }

  // ── Datos viejos ────────────────────────────────────────────────────
  if (base.lastSyncAt && Date.now() - Date.parse(base.lastSyncAt) > 30 * 3600_000) {
    recs.push({
      key: `stale:${isoDay(new Date())}`, rule: "stale", severity: "warn", channel: "Meta Ads", where: "Sincronización",
      title: "Los datos de Meta tienen más de 30 horas sin actualizarse.",
      evidence: [{ label: "Última sincronización", value: new Date(base.lastSyncAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) }],
      ads: [], impact: 0, action: null,
    })
  }

  return finish(base, recs, handled)
}

function finish(base: RadarSnapshot, recs: RadarRec[], handled: Set<string>): RadarSnapshot {
  const open = recs.filter((r) => !handled.has(r.key))
  open.sort((a, b) => SEV[a.severity] - SEV[b.severity] || b.impact - a.impact)
  base.recs = open
  base.hiddenCount = recs.length - open.length
  base.counts = { crit: 0, warn: 0, good: 0 }
  for (const r of open) base.counts[r.severity]++
  base.summary = summarize(base)
  return base
}

// Máximo 2 frases, por reglas: qué atender primero y el estado general.
function summarize(s: RadarSnapshot): string {
  if (!s.strategy) return "Sin estrategia para este ciclo: defínela para activar las alertas."
  const top = s.recs[0]
  if (!top) return "Todo en orden: el ciclo va según la estrategia."
  const rest = s.recs.length - 1
  return `Primero: ${top.title.replace(/\.$/, "")}.${rest ? ` Hay ${rest} punto${rest === 1 ? "" : "s"} más por revisar.` : ""}`
}
