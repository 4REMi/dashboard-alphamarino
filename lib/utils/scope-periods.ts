// Periodos del Alcance del servicio (cálculo puro, sin base de datos).
// Un proyecto define su periodo: sus ciclos (paid media), mensual desde un
// día ancla, cada N semanas, o mes calendario.

export type ScopePeriodMode = "cycles" | "monthly" | "weeks" | "calendar"

export interface ScopePeriodRule {
  mode: ScopePeriodMode
  anchor: string | null // YYYY-MM-DD (monthly/weeks)
  weeks: number | null
}

export interface ScopePeriod {
  start: string
  end: string
  label: string
}

const pad = (n: number) => String(n).padStart(2, "0")
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m, d))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}
const parts = (s: string) => s.split("-").map(Number) as [number, number, number]
export const addDays = (s: string, n: number) => { const [y, m, d] = parts(s); return iso(y, m - 1, d + n) }
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

export function todayIso() {
  const t = new Date()
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

export function rangeLabel(start: string, end: string) {
  const f = (s: string, withYear: boolean) => new Date(s + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) })
  return `${f(start, false)} – ${f(end, true)}`
}

// Inicio del periodo que contiene `date`.
function startOf(rule: ScopePeriodRule, date: string): string {
  const [y, m, d] = parts(date)
  if (rule.mode === "calendar") return iso(y, m - 1, 1)
  if (rule.mode === "weeks" && rule.anchor && rule.weeks) {
    const len = rule.weeks * 7
    const diff = Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(rule.anchor + "T00:00:00Z")) / 86_400_000)
    return addDays(rule.anchor, Math.floor(diff / len) * len)
  }
  // monthly (ancla = día del mes)
  const day = rule.anchor ? parts(rule.anchor)[2] : 1
  const thisMonth = iso(y, m - 1, Math.min(day, daysInMonth(y, m - 1)))
  if (thisMonth <= date) return thisMonth
  return iso(y, m - 2, Math.min(day, daysInMonth(y, m - 2)))
}

function nextStart(rule: ScopePeriodRule, start: string): string {
  const [y, m] = parts(start)
  if (rule.mode === "calendar") return iso(y, m, 1)
  if (rule.mode === "weeks" && rule.weeks) return addDays(start, rule.weeks * 7)
  const day = rule.anchor ? parts(rule.anchor)[2] : 1
  return iso(y, m, Math.min(day, daysInMonth(y, m)))
}

// Periodos desde el que contiene `from` hasta `extra` periodos después del
// que contiene `until`. Para ciclos se usan los ciclos reales.
export function computePeriods(
  rule: ScopePeriodRule,
  cycles: { start_date: string; end_date: string }[],
  from: string,
  until: string,
  extra = 0,
): ScopePeriod[] {
  if (rule.mode === "cycles") {
    const sorted = [...cycles].sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
    if (sorted.length) {
      return sorted
        .filter((c) => c.end_date >= from)
        .map((c) => ({ start: c.start_date, end: c.end_date, label: rangeLabel(c.start_date, c.end_date) }))
    }
    rule = { mode: "monthly", anchor: from, weeks: null }
  }
  const out: ScopePeriod[] = []
  let start = startOf(rule, from)
  let after = 0
  for (let guard = 0; guard < 400; guard++) {
    const next = nextStart(rule, start)
    const end = addDays(next, -1)
    out.push({ start, end, label: rule.mode === "calendar" ? monthLabel(start) : rangeLabel(start, end) })
    if (end >= until) { if (after >= extra) break; after++ }
    start = next
  }
  return out
}

function monthLabel(start: string) {
  const s = new Date(start + "T00:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function describeRule(rule: ScopePeriodRule): string {
  if (rule.mode === "cycles") return "Ciclos del proyecto"
  if (rule.mode === "calendar") return "Mes calendario"
  if (rule.mode === "weeks") return `Cada ${rule.weeks} semana${rule.weeks === 1 ? "" : "s"}`
  return `Mensual desde el día ${rule.anchor ? Number(rule.anchor.slice(8)) : 1}`
}

// monthly = por periodo; quarterly/biannual = cada 3/6 periodos.
export const CADENCE_EVERY: Record<string, number> = { monthly: 1, quarterly: 3, biannual: 6 }
