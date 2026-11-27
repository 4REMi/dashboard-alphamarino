"use client"

import { useRef } from "react"
import { cn } from "@/lib/utils"
import {
  formatMetric, metricById,
  type AdEvaluation, type MetricDef, type MetricId, type Verdict,
} from "@/lib/ad-audit/metrics"

export const VERDICT: Record<Verdict, { label: string; className: string }> = {
  win: { label: "Ganador", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  lose: { label: "Perdedor", className: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  starved: { label: "Sin oportunidad", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  nodata: { label: "Sin datos", className: "bg-muted text-muted-foreground" },
  alone: { label: "Sin con quién comparar", className: "bg-muted text-muted-foreground" },
}

export function VerdictChip({ evaluation }: { evaluation: AdEvaluation }) {
  const v = VERDICT[evaluation.verdict]
  return (
    <span title={evaluation.verdictReason} className={cn("inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", v.className)}>
      {v.label}{evaluation.verdict === "starved" && evaluation.hiddenWinner ? " · ¿ganador escondido?" : ""}
    </span>
  )
}

// Verde = mejor que la mediana del conjunto, naranja = peor.
// La flecha dice si el valor está arriba o abajo de la mediana.
export const CMP_CLASS = {
  better: "text-emerald-700 dark:text-emerald-300",
  worse: "text-orange-700 dark:text-orange-300",
  neutral: "text-foreground",
  none: "text-muted-foreground",
}

export function MetricCell({ id, defs, evaluation, currency, isBreak }: { id: MetricId; defs: MetricDef[]; evaluation: AdEvaluation; currency: string; isBreak?: boolean }) {
  const def = metricById(id, defs)
  const m = evaluation.metrics[id]
  if (m.status === "na") return <span className="text-muted-foreground" title="No aplica en imágenes">—</span>
  if (m.status === "not_measured") return <span className="text-xs text-muted-foreground" title="La cuenta no manda este evento">no medido</span>
  if (m.value === null) return <span className="text-muted-foreground">—</span>
  const arrow = m.rel === null || m.cmp === "neutral" ? "" : m.rel > 0 ? "↑ " : "↓ "
  // Meta a veces cuenta más visitas que clics (recargas, otra atribución):
  // se muestra topado en ~100 % en vez de un número que parece error.
  const capped = id === "click_visit" && m.value > 1
  const sample = `${m.num.toLocaleString("es-MX", { maximumFractionDigits: 0 })} / ${m.den.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`
  return (
    <span
      title={capped
        ? `Meta reporta más visitas (${Math.round(m.num)}) que clics (${Math.round(m.den)}): pasa con recargas o visitas atribuidas por otra vía.`
        : m.sampleOk
        ? `${sample} · mediana del conjunto ${formatMetric(def, m.median, currency)}`
        : `Muestra chica (${sample}); mínimo ${def.min.label}. No se compara.`}
      className={cn(
        "inline-flex w-fit rounded-md px-1.5 py-0.5 text-[13px] font-semibold tabular-nums",
        m.sampleOk ? CMP_CLASS[m.cmp] : "text-muted-foreground font-normal",
        isBreak && "outline outline-1 outline-orange-500",
      )}
    >
      {arrow}{capped ? "~100 %" : formatMetric(def, m.value, currency)}
    </span>
  )
}

export const BREAK_TEXT: Record<MetricId, string> = {
  hook: "Gancho: detiene poco",
  hold: "Cuerpo: la gente se va",
  ctr: "No genera clics",
  click_visit: "La página no carga o rebota",
  visit_cart: "Llegan sin intención de comprar",
  cart_checkout: "Abandonan antes de pagar",
  checkout_purchase: "Se caen en el pago",
  session_cvr: "Convierte poco",
  result_rate: "Pocos resultados por clic",
  cpr: "Costo por resultado alto",
  cpm: "CPM caro",
  cpc: "Clic caro",
  aov: "Ticket bajo",
  roas: "ROAS bajo",
}

export function breakSummary(e: AdEvaluation, currency: string, defs: MetricDef[]): string {
  if (!e.breakAt) return e.verdict === "nodata" || e.verdict === "starved" ? e.verdictReason : "No se rompe"
  const def = metricById(e.breakAt, defs)
  const m = e.metrics[e.breakAt]
  return `${BREAK_TEXT[e.breakAt]} · ${def.label} ${formatMetric(def, m.value, currency)} vs ${formatMetric(def, m.median, currency)}`
}

// Miniatura que reproduce el video sin sonido al pasar el mouse. preload
// "none": no se descarga nada hasta que alguien lo pide (costo de Storage).
export function HoverVideo({ videoUrl, posterUrl, imageUrl, className, label }: {
  videoUrl: string | null
  posterUrl: string | null
  imageUrl: string | null
  className?: string
  label: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  if (videoUrl) {
    return (
      <video
        ref={ref}
        src={videoUrl}
        poster={posterUrl ?? undefined}
        preload="none"
        muted
        playsInline
        loop
        aria-label={label}
        onMouseEnter={() => { ref.current?.play().catch(() => {}) }}
        onMouseLeave={() => { ref.current?.pause() }}
        className={cn("bg-muted object-cover", className)}
      />
    )
  }
  const src = imageUrl ?? posterUrl
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={label} loading="lazy" className={cn("bg-muted object-cover", className)} /> : <div className={cn("bg-muted", className)} aria-label={label} />
}
