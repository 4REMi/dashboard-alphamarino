// Cálculos puros de campañas manuales (fuera del archivo "use server",
// que solo puede exportar funciones async).

export interface ManualSnapshot {
  id: string
  as_of: string
  spend: number
  impressions: number | null
  clicks: number | null
  results: number | null
}

export interface ManualTotals {
  spend: number
  impressions: number | null
  clicks: number | null
  results: number | null
}

export const STALE_DAYS = 7

const pad = (n: number) => String(n).padStart(2, "0")
export function isoToday() {
  const t = new Date()
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}
export function isoAddDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// Lo de un rango = última captura dentro del rango − última captura
// antes del rango (las capturas son acumulados).
export function totalsForRange(snapshots: ManualSnapshot[], start: string | null, end: string | null): { totals: ManualTotals | null; asOf: string | null } {
  const sorted = [...snapshots].sort((a, b) => (a.as_of < b.as_of ? -1 : 1))
  const inRange = sorted.filter((s) => (!start || s.as_of >= start) && (!end || s.as_of <= end))
  const last = inRange[inRange.length - 1]
  if (!last) return { totals: null, asOf: null }
  const before = start ? [...sorted].reverse().find((s) => s.as_of < start) : undefined
  const diff = (a: number | null, b: number | null | undefined) => (a === null ? null : Math.max(0, a - (b ?? 0)))
  return {
    asOf: last.as_of,
    totals: {
      spend: Math.max(0, last.spend - (before?.spend ?? 0)),
      impressions: diff(last.impressions, before?.impressions),
      clicks: diff(last.clicks, before?.clicks),
      results: diff(last.results, before?.results),
    },
  }
}

export function derivedMetrics(t: ManualTotals | null) {
  if (!t) return { ctr: null, cpc: null, cpa: null }
  return {
    ctr: t.impressions && t.clicks !== null ? (t.clicks / t.impressions) * 100 : null,
    cpc: t.clicks ? t.spend / t.clicks : null,
    cpa: t.results ? t.spend / t.results : null,
  }
}
