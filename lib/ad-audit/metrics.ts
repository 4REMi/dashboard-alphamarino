// Métricas de las auditorías de cuentas (Ad Lab → Auditorías).
// SIN "use server": lógica pura, la usan las páginas (servidor) y los
// componentes (cliente). Ver docs/agent-guides/auditorias.md.
//
// La base de datos guarda conteos crudos por anuncio y día (audit_ad_daily).
// Aquí se suman, se aplican las fórmulas y se comparan los anuncios DENTRO
// DEL MISMO CONJUNTO (misma audiencia, presupuesto y fechas) contra la
// mediana de sus compañeros. Las fórmulas son las de la agencia: cambiar una
// definición aquí recalcula todas las auditorías, incluidas las viejas.

export interface Counters {
  impressions: number
  spend: number
  video_3s: number
  video_p25: number
  video_p50: number
  video_p75: number
  video_p95: number
  video_p100: number
  thruplays: number
  outbound_clicks: number
  landing_page_views: number
  add_to_cart: number
  initiate_checkout: number
  purchases: number
  purchase_value: number
}

export const COUNTER_KEYS: (keyof Counters)[] = [
  "impressions", "spend", "video_3s", "video_p25", "video_p50", "video_p75", "video_p95", "video_p100",
  "thruplays", "outbound_clicks", "landing_page_views", "add_to_cart", "initiate_checkout", "purchases", "purchase_value",
]

export const zeroCounters = (): Counters =>
  Object.fromEntries(COUNTER_KEYS.map((k) => [k, 0])) as unknown as Counters

export function addCounters(into: Counters, row: Partial<Record<keyof Counters, number | string | null>>): Counters {
  for (const k of COUNTER_KEYS) into[k] += Number(row[k] ?? 0) || 0
  return into
}

// Nombres en español de cada conteo (para fórmulas y la pantalla de
// Métricas de auditoría).
export const COUNTER_LABEL: Record<keyof Counters, string> = {
  impressions: "Impresiones", spend: "Gasto", video_3s: "Reproducciones de 3 s",
  video_p25: "Reproducciones al 25 %", video_p50: "Reproducciones al 50 %", video_p75: "Reproducciones al 75 %",
  video_p95: "Reproducciones al 95 %", video_p100: "Reproducciones al 100 %", thruplays: "ThruPlays",
  outbound_clicks: "Clics de salida", landing_page_views: "Visitas a la página", add_to_cart: "Agregados al carrito",
  initiate_checkout: "Pagos iniciados", purchases: "Compras", purchase_value: "Valor de compras",
}

// Eventos de la tienda que una cuenta puede no mandar (píxel/CAPI incompleto).
export type StoreEvent = "landing_page_view" | "add_to_cart" | "initiate_checkout" | "purchase"

export type MetricId =
  | "hook" | "hold" | "ctr" | "cpa"
  | "click_visit" | "visit_cart" | "cart_checkout" | "checkout_purchase" | "session_cvr" | "aov" | "roas"

export interface MetricDef {
  id: MetricId
  label: string
  formula: string                 // texto para el tooltip
  num: keyof Counters
  den: keyof Counters
  view: "creative" | "store"
  format: "pct" | "money" | "ratio"
  higherIsBetter: boolean
  videoOnly?: boolean             // en imágenes no hay reproducciones
  // Muestra mínima para juzgar: el conteo `min.key` debe llegar a `min.value`.
  min: { key: keyof Counters; value: number; label: string }
  needs?: StoreEvent[]            // si la cuenta no manda el evento → "no medido"
}

// Las fórmulas de la agencia (hold rate = 50 % ÷ 3 s, atribución 7 días clic).
export const METRICS: MetricDef[] = [
  { id: "hook", label: "Hook rate", formula: "Reproducciones de 3 s ÷ impresiones", num: "video_3s", den: "impressions", view: "creative", format: "pct", higherIsBetter: true, videoOnly: true, min: { key: "impressions", value: 1000, label: "1,000 impresiones" } },
  { id: "hold", label: "Hold rate", formula: "Reproducciones al 50 % ÷ reproducciones de 3 s", num: "video_p50", den: "video_3s", view: "creative", format: "pct", higherIsBetter: true, videoOnly: true, min: { key: "video_3s", value: 500, label: "500 reproducciones de 3 s" } },
  { id: "ctr", label: "CTR", formula: "Clics de salida ÷ impresiones", num: "outbound_clicks", den: "impressions", view: "creative", format: "pct", higherIsBetter: true, min: { key: "impressions", value: 1000, label: "1,000 impresiones" } },
  { id: "cpa", label: "CPA", formula: "Gasto ÷ compras (7 días después del clic)", num: "spend", den: "purchases", view: "creative", format: "money", higherIsBetter: false, min: { key: "purchases", value: 3, label: "3 compras" }, needs: ["purchase"] },
  { id: "click_visit", label: "Clic → visita", formula: "Visitas a la página ÷ clics de salida", num: "landing_page_views", den: "outbound_clicks", view: "store", format: "pct", higherIsBetter: true, min: { key: "outbound_clicks", value: 100, label: "100 clics" }, needs: ["landing_page_view"] },
  { id: "visit_cart", label: "Visita → carrito", formula: "Agregados al carrito ÷ visitas a la página", num: "add_to_cart", den: "landing_page_views", view: "store", format: "pct", higherIsBetter: true, min: { key: "landing_page_views", value: 100, label: "100 visitas" }, needs: ["landing_page_view", "add_to_cart"] },
  { id: "cart_checkout", label: "Carrito → checkout", formula: "Pagos iniciados ÷ agregados al carrito", num: "initiate_checkout", den: "add_to_cart", view: "store", format: "pct", higherIsBetter: true, min: { key: "add_to_cart", value: 20, label: "20 carritos" }, needs: ["add_to_cart", "initiate_checkout"] },
  { id: "checkout_purchase", label: "Checkout → compra", formula: "Compras ÷ pagos iniciados", num: "purchases", den: "initiate_checkout", view: "store", format: "pct", higherIsBetter: true, min: { key: "initiate_checkout", value: 10, label: "10 pagos iniciados" }, needs: ["initiate_checkout", "purchase"] },
  { id: "session_cvr", label: "Conv. sesión", formula: "Compras ÷ visitas a la página", num: "purchases", den: "landing_page_views", view: "store", format: "pct", higherIsBetter: true, min: { key: "landing_page_views", value: 100, label: "100 visitas" }, needs: ["landing_page_view", "purchase"] },
  { id: "aov", label: "AOV", formula: "Valor de compras ÷ compras", num: "purchase_value", den: "purchases", view: "store", format: "money", higherIsBetter: true, min: { key: "purchases", value: 5, label: "5 compras" }, needs: ["purchase"] },
  { id: "roas", label: "ROAS", formula: "Valor de compras ÷ gasto", num: "purchase_value", den: "spend", view: "store", format: "ratio", higherIsBetter: true, min: { key: "purchases", value: 5, label: "5 compras" }, needs: ["purchase"] },
]

export const metricById = (id: MetricId, defs: MetricDef[] = METRICS) => defs.find((m) => m.id === id)!

// Cambios de la agencia a las fórmulas (tabla audit_metric_overrides,
// pantalla Métricas de auditoría). Se aplican sobre METRICS; lo que no se
// cambió queda como está.
export interface MetricOverride {
  metric_id: MetricId
  num: keyof Counters
  den: keyof Counters
  min_key: keyof Counters
  min_value: number
}

export function applyOverrides(overrides: MetricOverride[]): MetricDef[] {
  return METRICS.map((m) => {
    const o = overrides.find((x) => x.metric_id === m.id)
    if (!o || !(o.num in COUNTER_LABEL) || !(o.den in COUNTER_LABEL) || !(o.min_key in COUNTER_LABEL)) return m
    return {
      ...m,
      num: o.num,
      den: o.den,
      formula: `${COUNTER_LABEL[o.num]} ÷ ${COUNTER_LABEL[o.den]}`,
      min: { key: o.min_key, value: Math.max(0, Number(o.min_value) || 0), label: `${Number(o.min_value).toLocaleString("es-MX")} ${COUNTER_LABEL[o.min_key].toLowerCase()}` },
    }
  })
}

// Orden del embudo para "dónde se rompe": la primera etapa con muestra
// suficiente que queda claramente por debajo de la mediana del conjunto.
export const FUNNEL_ORDER: MetricId[] = ["hook", "hold", "ctr", "click_visit", "visit_cart", "cart_checkout", "checkout_purchase"]

// Diferencia relativa contra la mediana a partir de la cual algo se marca
// mejor/peor (por debajo de esto es "en la media") y se considera ruptura.
export const NEUTRAL_BAND = 0.05
export const BREAK_THRESHOLD = 0.15

export interface MetricValue {
  value: number | null
  num: number
  den: number
  sampleOk: boolean
  status: "ok" | "na" | "not_measured" | "small_sample"
}

export function computeMetric(def: MetricDef, c: Counters, opts: { isVideo: boolean; missing: StoreEvent[] }): MetricValue {
  const num = c[def.num]
  const den = c[def.den]
  if (def.videoOnly && !opts.isVideo) return { value: null, num, den, sampleOk: false, status: "na" }
  if (def.needs?.some((e) => opts.missing.includes(e))) return { value: null, num, den, sampleOk: false, status: "not_measured" }
  const value = den > 0 ? num / den : null
  const sampleOk = c[def.min.key] >= def.min.value && value !== null
  return { value, num, den, sampleOk, status: sampleOk ? "ok" : "small_sample" }
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

export type Comparison = "better" | "worse" | "neutral" | "none"

export function compare(def: MetricDef, value: number | null, med: number | null): { cmp: Comparison; rel: number | null } {
  if (value === null || med === null || med === 0) return { cmp: "none", rel: null }
  const rel = (value - med) / Math.abs(med)
  if (Math.abs(rel) < NEUTRAL_BAND) return { cmp: "neutral", rel }
  const higher = rel > 0
  return { cmp: higher === def.higherIsBetter ? "better" : "worse", rel }
}

// ── Anuncios dentro de un conjunto ────────────────────────────────

export interface AuditAdInput {
  id: string
  isVideo: boolean
  counters: Counters
}

export type Verdict = "win" | "lose" | "starved" | "nodata" | "alone"

export interface AdEvaluation {
  id: string
  spendShare: number
  metrics: Record<MetricId, MetricValue & { median: number | null; cmp: Comparison; rel: number | null }>
  verdict: Verdict
  verdictReason: string
  hiddenWinner: boolean           // poco gasto pero buenas señales tempranas
  breakAt: MetricId | null        // primera etapa del embudo que se rompe
}

const MIN_IMPRESSIONS = 1000
const STARVED_SHARE = 0.05

export function evaluateAdset(ads: AuditAdInput[], missing: StoreEvent[], defs: MetricDef[] = METRICS): { evaluations: AdEvaluation[]; medians: Record<MetricId, number | null>; totals: Counters } {
  const totals = ads.reduce((acc, a) => addCounters(acc, a.counters as unknown as Record<keyof Counters, number>), zeroCounters())

  const raw = ads.map((a) => ({
    ad: a,
    values: Object.fromEntries(defs.map((m) => [m.id, computeMetric(m, a.counters, { isVideo: a.isVideo, missing })])) as Record<MetricId, MetricValue>,
  }))

  const medians = Object.fromEntries(defs.map((m) => [
    m.id,
    median(raw.filter((r) => r.values[m.id].sampleOk).map((r) => r.values[m.id].value as number)),
  ])) as Record<MetricId, number | null>

  const comparableForCpa = raw.filter((r) => r.values.cpa.sampleOk).length

  const evaluations = raw.map(({ ad, values }): AdEvaluation => {
    const metrics = Object.fromEntries(defs.map((m) => {
      const v = values[m.id]
      const { cmp, rel } = v.sampleOk ? compare(m, v.value, medians[m.id]) : { cmp: "none" as Comparison, rel: null }
      return [m.id, { ...v, median: medians[m.id], cmp, rel }]
    })) as AdEvaluation["metrics"]

    const spendShare = totals.spend > 0 ? ad.counters.spend / totals.spend : 0
    const early = [metrics.hook, metrics.ctr].filter((x) => x.sampleOk)
    const hiddenWinner = early.length > 0 && early.every((x) => x.cmp === "better")

    let verdict: Verdict
    let verdictReason: string
    if (ad.counters.impressions < MIN_IMPRESSIONS) {
      verdict = "nodata"
      verdictReason = `${ad.counters.impressions.toLocaleString("es-MX")} impresiones: muy pocas para juzgar`
    } else if (spendShare < STARVED_SHARE && ads.length > 1) {
      verdict = "starved"
      verdictReason = hiddenWinner
        ? "Meta casi no le dio gasto, pero sus señales tempranas son buenas: posible ganador escondido"
        : "Meta casi no le dio gasto"
    } else if (!metrics.cpa.sampleOk) {
      verdict = "nodata"
      verdictReason = metrics.cpa.status === "not_measured" ? "La cuenta no mide compras" : `${ad.counters.purchases} compras: muy pocas para juzgar el CPA`
    } else if (comparableForCpa < 2) {
      verdict = "alone"
      verdictReason = "No hay otro anuncio con suficientes compras para comparar en este conjunto"
    } else {
      verdict = metrics.cpa.cmp === "worse" ? "lose" : "win"
      verdictReason = verdict === "win" ? "CPA igual o mejor que la mediana del conjunto" : "CPA peor que la mediana del conjunto"
    }

    let breakAt: MetricId | null = null
    for (const id of FUNNEL_ORDER) {
      const m = metrics[id]
      if (m.cmp === "worse" && m.rel !== null && Math.abs(m.rel) >= BREAK_THRESHOLD) { breakAt = id; break }
    }

    return { id: ad.id, spendShare, metrics, verdict, verdictReason, hiddenWinner, breakAt }
  })

  return { evaluations, medians, totals }
}

// ── Formato ───────────────────────────────────────────────────────

export function formatMetric(def: MetricDef, value: number | null, currency = "MXN"): string {
  if (value === null || !Number.isFinite(value)) return "—"
  if (def.format === "pct") return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)} %`
  if (def.format === "ratio") return value.toFixed(1)
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
}

export function formatMoney(value: number, currency = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
}

// ── Curva de retención (video_play_curve_actions de Meta) ────────
// 22 puntos: 0–14 = segundos 0 a 14; 15–17 = tramos de 5 s (15, 20, 25);
// 18–20 = tramos de 10 s (30, 40, 50); 21 = 60 s o más.
export const CURVE_SECONDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30, 40, 50, 60]

export interface CurvePoint { sec: number; pct: number }

export function curvePoints(curve: unknown, durationSec?: number | null): CurvePoint[] {
  if (!Array.isArray(curve)) return []
  const pts = curve
    .map((v, i) => ({ sec: CURVE_SECONDS[i], pct: Number(v) }))
    .filter((p) => p.sec !== undefined && Number.isFinite(p.pct))
  const limit = durationSec && durationSec > 0 ? Math.ceil(durationSec) : Infinity
  return pts.filter((p) => p.sec <= limit)
}

export function retentionAt(points: CurvePoint[], sec: number): number | null {
  if (points.length === 0) return null
  if (sec <= points[0].sec) return points[0].pct
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (sec <= b.sec) return a.pct + ((sec - a.sec) / (b.sec - a.sec)) * (b.pct - a.pct)
  }
  return points[points.length - 1].pct
}

// Mayor caída en un tramo (desde el segundo 1, para no contar el scroll
// inicial). Regresa el tramo y cuánto se perdió de quienes seguían viendo.
export function biggestDrop(points: CurvePoint[]): { from: number; to: number; lostShare: number } | null {
  let best: { from: number; to: number; lostShare: number } | null = null
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a.pct <= 0) continue
    const lostShare = (a.pct - b.pct) / a.pct
    // Por segundo: después del 15 los tramos son de 5–10 s y si no siempre
    // "ganarían" solo por ser más largos.
    const perSec = lostShare / Math.max(1, b.sec - a.sec)
    const bestPerSec = best ? best.lostShare / Math.max(1, best.to - best.from) : -Infinity
    if (perSec > bestPerSec) best = { from: a.sec, to: b.sec, lostShare }
  }
  return best
}

export function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
