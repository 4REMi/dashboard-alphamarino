// «Qué funciona»: ganchos, cuerpos y cierres por tipo. SIN "use server";
// lógica pura sobre las vistas de campaña (lib/ad-audit/queries.ts).
// Ver docs/agent-guides/auditorias.md.
//
// Método:
// - Cada parte se juzga con SU métrica: gancho → hook rate (video) o CTR
//   (imagen); cuerpo → hold rate (video) o visita → carrito (imagen);
//   cierre → conversión de sesión, con AOV de apoyo.
// - El número que se muestra por tipo es POOLED: suma de numeradores ÷ suma
//   de denominadores de sus anuncios (no un promedio de porcentajes).
// - El veredicto usa la diferencia de cada anuncio contra la MEDIANA DE SU
//   CONJUNTO (comparación justa: misma audiencia y fechas), promediada con
//   peso por denominador. Así un tipo no "gana" solo por estar en el mejor
//   conjunto.
// - Solo cuentan anuncios con muestra suficiente; con menos de 2 → «Pocos datos».

import { formatMetric, metricById, type MetricDef, type MetricId } from "@/lib/ad-audit/metrics"
import { PART_TYPES, type PartKey } from "@/lib/ad-audit/parts"
import type { AuditAdView, CampaignAuditView } from "@/lib/ad-audit/queries"

export type Format = "video" | "image"

export const PART_METRIC: Record<PartKey, Record<Format, { main: MetricId; second?: MetricId }>> = {
  gancho: { video: { main: "hook" }, image: { main: "ctr" } },
  cuerpo: { video: { main: "hold", second: "visit_cart" }, image: { main: "visit_cart" } },
  cierre: { video: { main: "session_cvr", second: "aov" }, image: { main: "session_cvr", second: "aov" } },
}

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
  purchases: number
  support: string                  // "412 de 4,527 · 5 anuncios"
  clips: FindingClip[]
}

export interface Recipe {
  parts: Record<PartKey, string>
  ads: number
  purchases: number
  roas: number
  accountRoas: number
  purchaseShare: number
  clips: Record<PartKey, FindingClip>
}

export interface Findings {
  coverage: { analyzed: number; total: number }
  rows: Record<Format, Record<PartKey, FindingRow[]>>
  recipe: Record<Format, Recipe | null>
}

interface Item { ad: AuditAdView; href: string; currency: string; defs: MetricDef[] }

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

export function buildFindings(views: CampaignAuditView[], basePath: (v: CampaignAuditView) => string): Findings {
  const items: Item[] = views.flatMap((v) => v.adsets.flatMap((s) => s.ads.map((ad) => ({
    ad, href: `${basePath(v)}/a/${ad.id}`, currency: v.account.currency ?? "MXN", defs: v.metrics,
  }))))
  const creatives = items.filter((i) => i.ad.format !== "other")
  const totalSpend = items.reduce((t, i) => t + i.ad.counters.spend, 0)
  const totalValue = items.reduce((t, i) => t + i.ad.counters.purchase_value, 0)
  const totalPurchases = items.reduce((t, i) => t + i.ad.counters.purchases, 0)
  const accountRoas = totalSpend > 0 ? totalValue / totalSpend : 0

  const rows = { video: {}, image: {} } as Findings["rows"]
  const recipe = { video: null, image: null } as Findings["recipe"]

  for (const fmt of ["video", "image"] as Format[]) {
    const pool = creatives.filter((i) => i.ad.format === fmt && i.ad.parts)
    for (const part of ["gancho", "cuerpo", "cierre"] as PartKey[]) {
      const { main, second } = PART_METRIC[part][fmt]
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
          purchases: group.reduce((t, i) => t + i.ad.counters.purchases, 0),
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

    // La combinación que más vende: gancho+cuerpo+cierre con más compras
    // entre las que superan el ROAS de la cuenta (mínimo 3 compras).
    const combos = new Map<string, Item[]>()
    for (const i of pool) {
      const k = `${i.ad.parts!.gancho.tipo}|${i.ad.parts!.cuerpo.tipo}|${i.ad.parts!.cierre.tipo}`
      combos.set(k, [...(combos.get(k) ?? []), i])
    }
    let best: Recipe | null = null
    for (const group of combos.values()) {
      const purchases = group.reduce((t, i) => t + i.ad.counters.purchases, 0)
      const spend = group.reduce((t, i) => t + i.ad.counters.spend, 0)
      const value = group.reduce((t, i) => t + i.ad.counters.purchase_value, 0)
      const roas = spend > 0 ? value / spend : 0
      if (purchases < 3 || roas < accountRoas) continue
      if (best && purchases <= best.purchases) continue
      const top = [...group].sort((a, b) => b.ad.counters.purchases - a.ad.counters.purchases)[0]
      const p = top.ad.parts!
      best = {
        parts: { gancho: p.gancho.tipo, cuerpo: p.cuerpo.tipo, cierre: p.cierre.tipo },
        ads: group.length, purchases, roas, accountRoas,
        purchaseShare: totalPurchases > 0 ? purchases / totalPurchases : 0,
        clips: {
          gancho: clipOf(top, "gancho", PART_METRIC.gancho[fmt].main),
          cuerpo: clipOf(top, "cuerpo", PART_METRIC.cuerpo[fmt].main),
          cierre: clipOf(top, "cierre", PART_METRIC.cierre[fmt].main),
        },
      }
    }
    recipe[fmt] = best
  }

  return { coverage: { analyzed: creatives.filter((i) => i.ad.parts).length, total: creatives.length }, rows, recipe }
}
