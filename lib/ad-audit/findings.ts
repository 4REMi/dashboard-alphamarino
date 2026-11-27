// «Qué funciona»: ganchos, cuerpos y cierres por tipo. SIN "use server";
// lógica pura sobre las vistas de campaña (lib/ad-audit/queries.ts).
// Ver docs/agent-guides/auditorias.md.
//
// Método:
// - Cada parte se juzga con SU métrica, que depende del tipo de resultado
//   dominante (por gasto) de lo que se mira (ver partMetrics):
//   compras → gancho hook rate/CTR, cuerpo hold rate/visita→carrito,
//   cierre conversión de sesión (AOV de apoyo); leads/mensajes/otros →
//   cierre resultados por clic (costo por resultado de apoyo).
// - Se puede filtrar por Brand Line (opts.lineId; "none" = sin línea).
// - El número que se muestra por tipo es POOLED: suma de numeradores ÷ suma
//   de denominadores de sus anuncios (no un promedio de porcentajes).
// - El veredicto usa la diferencia de cada anuncio contra la MEDIANA DE SU
//   CONJUNTO (comparación justa: misma audiencia y fechas), promediada con
//   peso por denominador. Así un tipo no "gana" solo por estar en el mejor
//   conjunto.
// - Solo cuentan anuncios con muestra suficiente; con menos de 2 → «Pocos datos».

import { formatMetric, metricById, type MetricDef, type MetricId, type ResultKind } from "@/lib/ad-audit/metrics"
import { PART_TYPES, type PartKey } from "@/lib/ad-audit/parts"
import type { AuditAdView, CampaignAuditView } from "@/lib/ad-audit/queries"

export type Format = "video" | "image"

type PartMetrics = Record<PartKey, Record<Format, { main: MetricId; second?: MetricId }>>

export const PART_METRIC: PartMetrics = {
  gancho: { video: { main: "hook" }, image: { main: "ctr" } },
  cuerpo: { video: { main: "hold", second: "visit_cart" }, image: { main: "visit_cart" } },
  cierre: { video: { main: "session_cvr", second: "aov" }, image: { main: "session_cvr", second: "aov" } },
}

// Sin tienda (leads, mensajes, otros): el cuerpo de una imagen y el cierre
// se juzgan por resultados por clic y costo por resultado.
const PART_METRIC_NO_STORE: PartMetrics = {
  gancho: { video: { main: "hook" }, image: { main: "ctr" } },
  cuerpo: { video: { main: "hold", second: "ctr" }, image: { main: "result_rate" } },
  cierre: { video: { main: "result_rate", second: "cpr" }, image: { main: "cpr" } },
}

export const partMetrics = (kind: ResultKind): PartMetrics => (kind === "purchase" ? PART_METRIC : PART_METRIC_NO_STORE)

const WIN = 0.10

export interface FindingClip {
  adId: string
  href: string
  name: string
  videoUrl: string | null
  posterUrl: string | null
  imageUrl: string | null
  from: number | null
  to: number | null
  value: string
  cmp: "better" | "worse" | "neutral" | "none"
}

export interface FindingRow {
  type: string
  verdict: "ok" | "mid" | "bad" | "few"
  index: number | null             // diferencia promedio contra la mediana del conjunto
  main: string                     // métrica pooled formateada
  mainLabel: string
  second: string | null
  ads: number                      // con muestra suficiente
  spendShare: number
  results: number
  support: string                  // "412 de 4,527 · 5 anuncios"
  clips: FindingClip[]
}

export interface Recipe {
  parts: Record<PartKey, string>
  ads: number
  results: number
  cpr: number
  accountCpr: number
  roas: number | null              // solo si el resultado es compra
  accountRoas: number | null
  resultShare: number
  currency: string
  clips: Record<PartKey, FindingClip>
}

export interface Findings {
  coverage: { analyzed: number; total: number }
  kind: ResultKind                 // tipo de resultado dominante (por gasto)
  resultLabel: string
  metrics: PartMetrics
  rows: Record<Format, Record<PartKey, FindingRow[]>>
  recipe: Record<Format, Recipe | null>
}

interface Item { ad: AuditAdView; href: string; currency: string; defs: MetricDef[]; kind: ResultKind; label: string }

function clipOf(it: Item, part: PartKey, metric: MetricId): FindingClip {
  const m = it.ad.evaluation.metrics[metric]
  const p = it.ad.parts![part]
  return {
    adId: it.ad.id, href: it.href, name: it.ad.name,
    videoUrl: it.ad.videoUrl, posterUrl: it.ad.posterUrl, imageUrl: it.ad.imageUrl,
    from: p.desde, to: p.hasta,
    value: m.sampleOk ? formatMetric(metricById(metric, it.defs), m.value, it.currency) : "muestra chica",
    cmp: m.sampleOk ? m.cmp : "none",
  }
}

export function buildFindings(
  views: CampaignAuditView[],
  basePath: (v: CampaignAuditView) => string,
  opts: { lineId?: string | null } = {},
): Findings {
  const all: Item[] = views.flatMap((v) => v.adsets.flatMap((s) => s.ads.map((ad) => ({
    ad, href: `${basePath(v)}/a/${ad.id}`, currency: v.account.currency ?? "MXN", defs: v.metrics,
    kind: s.result.kind, label: s.result.label,
  }))))
  const items = opts.lineId === undefined || opts.lineId === null ? all
    : all.filter((i) => (opts.lineId === "none" ? !i.ad.brandLineId : i.ad.brandLineId === opts.lineId))

  // Tipo de resultado dominante por gasto: define con qué métricas se juzga.
  const byKind = new Map<ResultKind, { spend: number; label: string }>()
  for (const i of items) {
    const k = byKind.get(i.kind) ?? { spend: 0, label: i.label }
    k.spend += i.ad.counters.spend
    byKind.set(i.kind, k)
  }
  const dominant = [...byKind.entries()].filter(([k]) => k !== "none").sort((x, y) => y[1].spend - x[1].spend)[0]
  const kind: ResultKind = dominant?.[0] ?? "purchase"
  const resultLabel = dominant?.[1].label ?? "Resultados"
  const PM = partMetrics(kind)

  const creatives = items.filter((i) => i.ad.format !== "other")
  // La receta solo suma resultados del tipo dominante (no mezcla compras con leads).
  const same = items.filter((i) => i.kind === kind)
  const totalSpend = items.reduce((t, i) => t + i.ad.counters.spend, 0)
  const kindSpend = same.reduce((t, i) => t + i.ad.counters.spend, 0)
  const kindResults = same.reduce((t, i) => t + i.ad.counters.results, 0)
  const kindValue = same.reduce((t, i) => t + i.ad.counters.result_value, 0)
  const accountCpr = kindResults > 0 ? kindSpend / kindResults : Infinity
  const accountRoas = kind === "purchase" && kindSpend > 0 ? kindValue / kindSpend : null

  const rows = { video: {}, image: {} } as Findings["rows"]
  const recipe = { video: null, image: null } as Findings["recipe"]

  for (const fmt of ["video", "image"] as Format[]) {
    const pool = creatives.filter((i) => i.ad.format === fmt && i.ad.parts)
    for (const part of ["gancho", "cuerpo", "cierre"] as PartKey[]) {
      const { main, second } = PM[part][fmt]
      const out: FindingRow[] = []
      for (const type of PART_TYPES[part]) {
        const group = pool.filter((i) => i.ad.parts![part].tipo === type)
        if (group.length === 0) continue
        const sampled = group.filter((i) => i.ad.evaluation.metrics[main].sampleOk)
        const num = sampled.reduce((t, i) => t + i.ad.evaluation.metrics[main].num, 0)
        const den = sampled.reduce((t, i) => t + i.ad.evaluation.metrics[main].den, 0)
        const withRel = sampled.filter((i) => i.ad.evaluation.metrics[main].rel !== null)
        const w = withRel.reduce((t, i) => t + i.ad.evaluation.metrics[main].den, 0)
        const def = metricById(main, group[0].defs)
        const higherBetter = def.higherIsBetter ? 1 : -1
        const index = w > 0 ? withRel.reduce((t, i) => t + (i.ad.evaluation.metrics[main].rel as number) * higherBetter * i.ad.evaluation.metrics[main].den, 0) / w : null
        const verdict: FindingRow["verdict"] = sampled.length < 2 || index === null ? "few" : index >= WIN ? "ok" : index <= -WIN ? "bad" : "mid"
        let secondText: string | null = null
        if (second) {
          const s2 = group.filter((i) => i.ad.evaluation.metrics[second].sampleOk)
          const n2 = s2.reduce((t, i) => t + i.ad.evaluation.metrics[second].num, 0)
          const d2 = s2.reduce((t, i) => t + i.ad.evaluation.metrics[second].den, 0)
          const def2 = metricById(second, group[0].defs)
          secondText = d2 > 0 ? `${def2.label} ${formatMetric(def2, n2 / d2, group[0].currency)}` : null
        }
        const spend = group.reduce((t, i) => t + i.ad.counters.spend, 0)
        out.push({
          type, verdict, index,
          main: den > 0 ? formatMetric(def, num / den, group[0].currency) : "—",
          mainLabel: def.label,
          second: secondText,
          ads: sampled.length,
          spendShare: totalSpend > 0 ? spend / totalSpend : 0,
          results: group.reduce((t, i) => t + (i.kind === kind ? i.ad.counters.results : 0), 0),
          support: `${Math.round(num).toLocaleString("es-MX")} de ${Math.round(den).toLocaleString("es-MX")} · ${group.length} anuncio${group.length === 1 ? "" : "s"}${sampled.length < group.length ? ` (${sampled.length} con muestra suficiente)` : ""}`,
          clips: [...group]
            .sort((a, b) => (b.ad.evaluation.metrics[main].value ?? -1) * higherBetter - (a.ad.evaluation.metrics[main].value ?? -1) * higherBetter)
            .slice(0, 8)
            .map((i) => clipOf(i, part, main)),
        })
      }
      const order = { ok: 0, mid: 1, bad: 2, few: 3 }
      out.sort((a, b) => order[a.verdict] - order[b.verdict] || (b.index ?? -9) - (a.index ?? -9))
      rows[fmt][part] = out
    }

    // La combinación que más resultados trae entre las que cuestan por
    // resultado lo mismo o menos que la cuenta (mínimo 3 resultados).
    const combos = new Map<string, Item[]>()
    for (const i of pool.filter((x) => x.kind === kind)) {
      const k = `${i.ad.parts!.gancho.tipo}|${i.ad.parts!.cuerpo.tipo}|${i.ad.parts!.cierre.tipo}`
      combos.set(k, [...(combos.get(k) ?? []), i])
    }
    let best: Recipe | null = null
    for (const group of combos.values()) {
      const results = group.reduce((t, i) => t + i.ad.counters.results, 0)
      const spend = group.reduce((t, i) => t + i.ad.counters.spend, 0)
      const value = group.reduce((t, i) => t + i.ad.counters.result_value, 0)
      const cpr = results > 0 ? spend / results : Infinity
      if (results < 3 || cpr > accountCpr) continue
      if (best && results <= best.results) continue
      const top = [...group].sort((a, b) => b.ad.counters.results - a.ad.counters.results)[0]
      const p = top.ad.parts!
      best = {
        parts: { gancho: p.gancho.tipo, cuerpo: p.cuerpo.tipo, cierre: p.cierre.tipo },
        ads: group.length, results, cpr, accountCpr,
        roas: kind === "purchase" && spend > 0 ? value / spend : null, accountRoas,
        resultShare: kindResults > 0 ? results / kindResults : 0,
        currency: top.currency,
        clips: {
          gancho: clipOf(top, "gancho", PM.gancho[fmt].main),
          cuerpo: clipOf(top, "cuerpo", PM.cuerpo[fmt].main),
          cierre: clipOf(top, "cierre", PM.cierre[fmt].main),
        },
      }
    }
    recipe[fmt] = best
  }

  return { coverage: { analyzed: creatives.filter((i) => i.ad.parts).length, total: creatives.length }, kind, resultLabel, metrics: PM, rows, recipe }
}

// ── Por Brand Line ────────────────────────────────────────────────

export interface LineFindings { id: string; name: string; color: string; findings: Findings }

// Un Findings por línea (+ «Sin línea» si hay anuncios sin asignar).
export function buildLineFindings(
  views: CampaignAuditView[],
  basePath: (v: CampaignAuditView) => string,
  lines: { id: string; name: string; color: string }[],
): LineFindings[] {
  const out = lines.map((l) => ({ ...l, findings: buildFindings(views, basePath, { lineId: l.id }) }))
  const none = buildFindings(views, basePath, { lineId: "none" })
  if (lines.length && none.coverage.total > 0) out.push({ id: "none", name: "Sin línea", color: "#94a3b8", findings: none })
  return out.filter((l) => l.findings.coverage.total > 0)
}
