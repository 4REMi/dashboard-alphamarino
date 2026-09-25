// Cálculo puro, separado de lib/actions/paid-media-performance.ts porque
// un archivo "use server" solo puede exportar funciones async — esto lo
// necesitan tanto ese archivo (agregación por ad) como
// lib/actions/relationship-map.ts (agregación por campaña, reusando el
// mismo cálculo sobre el merge de varios ads).
import type { MetaAdDailyStat, TrendWindow } from "@/lib/types"
import { METRIC_DEFS, type MetricKey } from "@/lib/constants/paid-media-metrics"

interface DayTotals {
  spend: number
  impressions: number
  clicks: number
  results: number
  purchase_value: number
  reach: number
  link_clicks: number
  video_views: number
}

function sumDays(stats: MetaAdDailyStat[]): DayTotals {
  return stats.reduce((acc, s) => ({
    spend:          acc.spend + (s.spend ?? 0),
    impressions:    acc.impressions + (s.impressions ?? 0),
    clicks:         acc.clicks + (s.clicks ?? 0),
    results:        acc.results + (s.results ?? 0),
    purchase_value: acc.purchase_value + (s.purchase_value ?? 0),
    // reach NO se suma día a día (un mismo usuario alcanzado dos días
    // distintos no son dos personas) — se toma el máximo diario como
    // aproximación razonable sin pedirle a Meta un reach acumulado aparte.
    reach:          Math.max(acc.reach, s.reach ?? 0),
    link_clicks:    acc.link_clicks + (s.link_clicks ?? 0),
    video_views:    acc.video_views + (s.video_views ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, results: 0, purchase_value: 0, reach: 0, link_clicks: 0, video_views: 0 })
}

function deriveMetric(key: MetricKey, t: DayTotals): number | null {
  switch (key) {
    case "spend":        return t.spend || null
    case "results":      return t.results || null
    case "ctr":          return t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null
    case "cpc":          return t.clicks > 0 ? t.spend / t.clicks : null
    case "cpm":          return t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null
    case "cost_per_result": return t.results > 0 ? t.spend / t.results : null
    case "roas":         return t.spend > 0 ? t.purchase_value / t.spend : null
    case "clicks":       return t.clicks || null
    case "impressions":  return t.impressions || null
    case "reach":         return t.reach || null
    case "frequency":     return t.reach > 0 ? t.impressions / t.reach : null
    case "link_clicks":   return t.link_clicks || null
    case "cost_per_link_click": return t.link_clicks > 0 ? t.spend / t.link_clicks : null
    case "video_views":   return t.video_views || null
    case "purchase_value": return t.purchase_value || null
  }
}

function pctChange(latest: number | null, compare: number | null): number | null {
  if (latest === null || compare === null || compare === 0) return null
  return ((latest - compare) / Math.abs(compare)) * 100
}

export interface MetricPoint {
  value: number | null
  trendPct: number | null
  higherIsBetter: boolean
}

// Suma por fecha las filas diarias de varios ads en una sola fila
// sintética por día — así el mismo cálculo de tendencia (día anterior/
// promedio del ciclo/baseline) que ya usa un ad individual sirve igual
// para el agregado de una campaña completa, sin que un día con 3 ads
// termine contando 3 veces por error.
export function mergeDailyStatsByDate(rows: MetaAdDailyStat[]): MetaAdDailyStat[] {
  const byDate = new Map<string, MetaAdDailyStat>()
  for (const row of rows) {
    const existing = byDate.get(row.date)
    if (!existing) {
      byDate.set(row.date, { ...row })
    } else {
      existing.spend = (existing.spend ?? 0) + (row.spend ?? 0)
      existing.impressions = (existing.impressions ?? 0) + (row.impressions ?? 0)
      existing.clicks = (existing.clicks ?? 0) + (row.clicks ?? 0)
      existing.results = (existing.results ?? 0) + (row.results ?? 0)
      existing.purchase_value = (existing.purchase_value ?? 0) + (row.purchase_value ?? 0)
      existing.link_clicks = (existing.link_clicks ?? 0) + (row.link_clicks ?? 0)
      existing.video_views = (existing.video_views ?? 0) + (row.video_views ?? 0)
      // reach no se suma entre ads del mismo día (personas alcanzadas se
      // solapan entre creativos) — se toma el máximo, misma lógica que
      // sumDays más abajo.
      existing.reach = Math.max(existing.reach ?? 0, row.reach ?? 0)
    }
  }
  return Array.from(byDate.values())
}

// Reemplaza alcance/frecuencia aproximados (derivados de filas diarias)
// por los que Meta deduplicó sobre todo el ciclo — los únicos que
// coinciden con Ads Manager. Sin tendencia: comparar alcance de un día
// contra otro no tiene equivalente directo en Ads Manager, y mostrar un %
// calculado con la aproximación sería engañoso.
export function withMetaReach(
  metrics: Record<MetricKey, MetricPoint>,
  meta: { reach: number | null; frequency: number | null } | undefined,
  resultsType?: string | null,
): Record<MetricKey, MetricPoint> {
  if (!meta) return metrics
  const out = {
    ...metrics,
    reach: { ...metrics.reach, value: meta.reach, trendPct: null },
    frequency: { ...metrics.frequency, value: meta.frequency, trendPct: null },
  }
  // Campañas de alcance: el resultado ES el alcance, y sumado día a día
  // cuenta varias veces a la misma persona — se usa el deduplicado.
  if (resultsType === "reach" && meta.reach) {
    const spend = metrics.spend.value
    out.results = { ...metrics.results, value: meta.reach, trendPct: null }
    out.cost_per_result = { ...metrics.cost_per_result, value: spend ? (spend / meta.reach) * 1000 : null, trendPct: null }
  }
  return out
}

export function resultsTypeOf(rows: MetaAdDailyStat[]): string | null {
  return rows.find((r) => r.results_type)?.results_type ?? null
}

function avgTotals(days: MetaAdDailyStat[]): DayTotals {
  const t = sumDays(days)
  const n = days.length
  return {
    spend: t.spend / n,
    impressions: t.impressions / n,
    clicks: t.clicks / n,
    results: t.results / n,
    purchase_value: t.purchase_value / n,
    reach: t.reach / n,
    link_clicks: t.link_clicks / n,
    video_views: t.video_views / n,
  }
}

// Mismos presets de comparación que ofrece Meta Ads Manager — "últimos N
// días" se lee como el promedio de esos N días inmediatamente ANTERIORES
// al último día con datos (nunca incluye ese último día, o estaría
// comparándose contra sí mismo).
const WINDOW_DAYS: Partial<Record<TrendWindow, number>> = { last_3d: 3, last_7d: 7, last_14d: 14 }

// Calcula la tendencia según la ventana elegida (por proyecto, o el
// override puntual de esta campaña) — comparando valores DIARIOS (nunca
// acumulados), para que el % refleje un movimiento real y no solo "lleva
// más días corriendo". Genérico sobre las filas diarias que reciba —
// sirve igual para un ad individual o para el merge de varios (campaña).
export function computeMetricsForAd(dailyRows: MetaAdDailyStat[], window: TrendWindow): Record<MetricKey, MetricPoint> {
  const sorted = [...dailyRows].sort((a, b) => a.date < b.date ? -1 : 1)
  const cycleTotals = sumDays(sorted)
  const lastDay = sorted[sorted.length - 1]
  const lastDayTotals = lastDay ? sumDays([lastDay]) : null

  let compareTotals: DayTotals | null = null
  if (lastDayTotals) {
    if (window === "previous_day") {
      const prevDay = sorted[sorted.length - 2]
      compareTotals = prevDay ? sumDays([prevDay]) : null
    } else if (window === "baseline") {
      const firstDay = sorted[0]
      compareTotals = (firstDay && firstDay !== lastDay) ? sumDays([firstDay]) : null
    } else {
      const windowSize = WINDOW_DAYS[window] ?? 7
      const otherDays = sorted.slice(Math.max(0, sorted.length - 1 - windowSize), sorted.length - 1)
      compareTotals = otherDays.length > 0 ? avgTotals(otherDays) : null
    }
  }

  const result = {} as Record<MetricKey, MetricPoint>
  for (const key of Object.keys(METRIC_DEFS) as MetricKey[]) {
    const value = deriveMetric(key, cycleTotals)
    const latestDayValue = lastDayTotals ? deriveMetric(key, lastDayTotals) : null
    const compareValue = compareTotals ? deriveMetric(key, compareTotals) : null
    result[key] = { value, trendPct: pctChange(latestDayValue, compareValue), higherIsBetter: METRIC_DEFS[key].higherIsBetter }
  }
  // Ads Manager reporta el costo por resultado de alcance/impresiones por
  // cada 1,000 (igual que el CPM), no por persona/impresión.
  const resultsType = resultsTypeOf(sorted)
  if ((resultsType === "reach" || resultsType === "impressions") && result.cost_per_result.value !== null) {
    result.cost_per_result = { ...result.cost_per_result, value: result.cost_per_result.value * 1000 }
  }
  return result
}
