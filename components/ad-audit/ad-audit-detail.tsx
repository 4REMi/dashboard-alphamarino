"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  biggestDrop, curvePoints, formatMetric, formatMoney, formatSec, metricById, retentionAt,
  type Counters, type CurvePoint, type MetricDef, type MetricId,
} from "@/lib/ad-audit/metrics"
import type { AuditAdView, AuditAdsetView } from "@/lib/ad-audit/queries"
import { CMP_CLASS, VerdictChip, breakSummary } from "@/components/ad-audit/ui"

// Con quién comparar: el ganador con mejor CPA del mismo conjunto; si no hay,
// el anuncio con más gasto (que no sea este).
function pickComparison(ad: AuditAdView, adset: AuditAdsetView): AuditAdView | null {
  const others = adset.ads.filter((a) => a.id !== ad.id && a.format === ad.format)
  const winners = others.filter((a) => a.evaluation.verdict === "win" && a.evaluation.metrics.cpa.value !== null)
    .sort((x, y) => (x.evaluation.metrics.cpa.value ?? Infinity) - (y.evaluation.metrics.cpa.value ?? Infinity))
  return winners[0] ?? others.sort((x, y) => y.counters.spend - x.counters.spend)[0] ?? null
}

const CASCADE: { step: string; count: keyof Counters; metric?: MetricId; videoOnly?: boolean }[] = [
  { step: "Impresiones", count: "impressions" },
  { step: "Reproducciones de 3 s", count: "video_3s", metric: "hook", videoOnly: true },
  { step: "Reproducciones al 50 %", count: "video_p50", metric: "hold", videoOnly: true },
  { step: "Clics de salida", count: "outbound_clicks", metric: "ctr" },
  { step: "Visitas a la página", count: "landing_page_views", metric: "click_visit" },
  { step: "Agregados al carrito", count: "add_to_cart", metric: "visit_cart" },
  { step: "Pagos iniciados", count: "initiate_checkout", metric: "cart_checkout" },
  { step: "Compras", count: "purchases", metric: "checkout_purchase" },
]

export function AdAuditDetail({ ad, adset, currency, backHref, metrics }: { ad: AuditAdView; adset: AuditAdsetView; currency: string; backHref: string; metrics: MetricDef[] }) {
  const other = useMemo(() => pickComparison(ad, adset), [ad, adset])
  const isVideo = ad.format === "video"
  const mainRef = useRef<HTMLVideoElement>(null)
  const otherRef = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)

  const pts = useMemo(() => curvePoints(ad.curve, ad.durationSec), [ad])
  const otherPts = useMemo(() => (other ? curvePoints(other.curve, other.durationSec) : []), [other])
  const drop = useMemo(() => biggestDrop(pts), [pts])
  const maxSec = Math.max(pts.at(-1)?.sec ?? 0, otherPts.at(-1)?.sec ?? 0, 1)

  const seek = (sec: number) => {
    for (const v of [mainRef.current, otherRef.current]) if (v) v.currentTime = Math.min(sec, (v.duration || sec + 1) - 0.05)
    setTime(sec)
  }
  const togglePlay = () => {
    const vids = [mainRef.current, otherRef.current].filter(Boolean) as HTMLVideoElement[]
    if (playing) vids.forEach((v) => v.pause())
    else vids.forEach((v) => { v.play().catch(() => {}) })
    setPlaying(!playing)
  }
  useEffect(() => {
    const v = mainRef.current
    if (!v) return
    const onTime = () => setTime(v.currentTime)
    const onEnd = () => setPlaying(false)
    v.addEventListener("timeupdate", onTime)
    v.addEventListener("ended", onEnd)
    return () => { v.removeEventListener("timeupdate", onTime); v.removeEventListener("ended", onEnd) }
  }, [])

  const moments: { sec: number; label: string; drop?: boolean }[] = [{ sec: 0, label: "Inicio" }]
  if (drop && drop.lostShare > 0) moments.push({ sec: drop.from, label: `Se va el ${Math.round(drop.lostShare * 100)} %`, drop: true })
  if (ad.durationSec) moments.push({ sec: Math.round(ad.durationSec / 2), label: "Mitad del video" })
  if (ad.durationSec && ad.durationSec > 4) moments.push({ sec: Math.max(0, Math.floor(ad.durationSec) - 3), label: "Cierre" })

  const e = ad.evaluation
  const money: MetricId[] = ["session_cvr", "aov", "cpa", "roas"]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href={backHref} className="text-xs text-muted-foreground hover:underline">← {adset.name}</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{ad.name}</h1>
            <VerdictChip evaluation={e} />
            <span className="text-sm text-muted-foreground">{(e.spendShare * 100).toFixed(1)} % del gasto del conjunto · {formatMoney(ad.counters.spend, currency)}</span>
          </div>
          <p className="text-sm text-muted-foreground">{breakSummary(e, currency, metrics)}</p>
        </div>
        {ad.landingUrl && <a href={ad.landingUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">Página de destino ↗</a>}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* Videos lado a lado */}
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {[{ a: ad, ref: mainRef, pts, tag: "Este anuncio" }, ...(other ? [{ a: other, ref: otherRef, pts: otherPts, tag: other.evaluation.verdict === "win" ? "Ganador del conjunto" : "Con más gasto del conjunto" }] : [])].map(({ a, ref, pts: p, tag }) => {
              const keep = retentionAt(p, time)
              return (
                <div key={a.id} className="flex flex-col gap-2">
                  <div className={cn("relative overflow-hidden rounded-2xl border-2 bg-muted", a.id === ad.id ? (e.verdict === "lose" ? "border-orange-500/60" : "border-border") : "border-emerald-500/50")}>
                    {a.format === "video" && a.videoUrl ? (
                      <video ref={ref} src={a.videoUrl} poster={a.posterUrl ?? undefined} preload="metadata" muted playsInline className="aspect-[9/16] w-full object-cover" />
                    ) : (a.imageUrl ?? a.posterUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.imageUrl ?? a.posterUrl ?? undefined} alt={a.name} className={cn("w-full object-cover", a.format === "video" ? "aspect-[9/16]" : "aspect-square")} />
                    ) : (
                      <div className={cn("flex w-full items-center justify-center text-xs text-muted-foreground", a.format === "video" ? "aspect-[9/16]" : "aspect-square")}>Sin archivo copiado</div>
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white">{tag} · {a.name}</span>
                    {a.format === "video" && (
                      <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-white">
                        <span className="block text-2xl font-bold tabular-nums">{keep === null ? "—" : `${Math.round(keep)} %`}</span>
                        <span className="text-xs text-white/80">siguen viendo en {formatSec(time)}</span>
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {!other && <p className="text-sm text-muted-foreground">No hay otro anuncio del mismo formato en este conjunto para comparar.</p>}
          {isVideo && (ad.videoUrl || pts.length > 1) && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Saltar a un momento del video">
              {ad.videoUrl && (
                <button onClick={togglePlay} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  {playing ? "Pausar" : other ? "Reproducir ambos" : "Reproducir"}
                </button>
              )}
              {moments.map((m) => (
                <button key={`${m.sec}-${m.label}`} onClick={() => seek(m.sec)}
                  className={cn("flex h-11 flex-col items-start justify-center rounded-lg border px-3 text-left text-xs",
                    m.drop ? "border-orange-500/60 text-orange-700 dark:text-orange-300" : "border-border")}>
                  <span className="font-bold tabular-nums">{formatSec(m.sec)}</span><span>{m.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Curva + embudo */}
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          {isVideo && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">Retención</h2>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded bg-orange-500" />Este anuncio</span>
                  {other && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-emerald-500" />{other.name}</span>}
                </div>
              </div>
              {pts.length > 1 ? (
                <RetentionChart pts={pts} otherPts={otherPts} maxSec={maxSec} time={time} drop={drop} onSeek={seek} />
              ) : (
                <p className="text-sm text-muted-foreground">Meta no dio la curva de retención de este anuncio.</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">% de reproducciones que siguen en cada segundo. Clic en la gráfica para llevar los videos a ese momento.</p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-base font-semibold">Embudo</h2>
            <div className="overflow-x-auto">
              <div className="min-w-[460px]">
                {CASCADE.filter((r) => !(r.videoOnly && !isVideo)).map((r) => {
                  const m = r.metric ? e.metrics[r.metric] : null
                  const def = r.metric ? metricById(r.metric, metrics) : null
                  const isBreak = r.metric && e.breakAt === r.metric
                  return (
                    <div key={r.step} className={cn("grid grid-cols-[1.6fr_0.8fr_1.4fr_0.9fr] items-center gap-3 border-b border-border/60 px-2 py-2 text-sm last:border-0",
                      isBreak && "rounded-lg bg-orange-500/10 outline outline-1 outline-orange-500")}>
                      <span>{r.step}</span>
                      <span className="tabular-nums text-muted-foreground">{ad.counters[r.count].toLocaleString("es-MX", { maximumFractionDigits: 0 })}</span>
                      <span className={cn("font-semibold tabular-nums", m ? (m.sampleOk ? CMP_CLASS[m.cmp] : "text-muted-foreground font-normal") : "")}>
                        {m && def ? (m.status === "not_measured" ? "no medido" : `${def.label} ${formatMetric(def, m.value, currency)}`) : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">{m && def && m.median !== null ? `med. ${formatMetric(def, m.median, currency)}` : ""}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {money.map((id) => {
                const m = e.metrics[id]
                const def = metricById(id, metrics)
                return (
                  <div key={id} className="rounded-lg border border-border bg-background px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{def.label}</p>
                    <p className={cn("text-lg font-bold tabular-nums", m.sampleOk ? CMP_CLASS[m.cmp] : "text-muted-foreground")}>{m.status === "not_measured" ? "no medido" : formatMetric(def, m.value, currency)}</p>
                    <p className="text-[11px] text-muted-foreground">{m.median !== null ? `med. ${formatMetric(def, m.median, currency)}` : "sin mediana"}</p>
                  </div>
                )
              })}
            </div>
            {ad.counters.purchases < 20 && (
              <p className="mt-2 text-xs text-muted-foreground">{ad.counters.purchases} compras: el final del embudo tiene confianza baja. Las etapas en gris no llegan a la muestra mínima.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function RetentionChart({ pts, otherPts, maxSec, time, drop, onSeek }: {
  pts: CurvePoint[]; otherPts: CurvePoint[]; maxSec: number; time: number
  drop: { from: number; to: number } | null; onSeek: (sec: number) => void
}) {
  const W = 640, H = 240, L = 40, R = 16, T = 10, B = 26
  const x = (s: number) => L + (Math.min(s, maxSec) / maxSec) * (W - L - R)
  const y = (p: number) => T + (1 - p / 100) * (H - T - B)
  const line = (p: CurvePoint[]) => p.map((q) => `${x(q.sec).toFixed(1)},${y(q.pct).toFixed(1)}`).join(" ")
  const ticks = [0, ...[0.25, 0.5, 0.75, 1].map((f) => Math.round(maxSec * f))]
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full cursor-crosshair"
      role="img"
      aria-label={`Curva de retención${drop ? `; mayor caída entre ${formatSec(drop.from)} y ${formatSec(drop.to)}` : ""}`}
      onClick={(ev) => {
        const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect()
        const px = ((ev.clientX - r.left) / r.width) * W
        onSeek(Math.max(0, Math.min(maxSec, ((px - L) / (W - L - R)) * maxSec)))
      }}
    >
      {drop && <rect x={x(drop.from)} y={T} width={Math.max(2, x(drop.to) - x(drop.from))} height={H - T - B} className="fill-orange-500/15" />}
      {[0, 50, 100].map((p) => (
        <g key={p}>
          <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} className="stroke-border" />
          <text x={L - 6} y={y(p) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{p} %</text>
        </g>
      ))}
      {otherPts.length > 1 && <polyline points={line(otherPts)} fill="none" strokeWidth={2} strokeDasharray="6 4" className="stroke-emerald-500" />}
      <polyline points={line(pts)} fill="none" strokeWidth={3} className="stroke-orange-500" />
      <line x1={x(time)} x2={x(time)} y1={T - 4} y2={H - B + 4} strokeWidth={2} className="stroke-foreground" />
      {ticks.map((s, i) => (
        <text key={i} x={x(s)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{formatSec(s)}</text>
      ))}
    </svg>
  )
}
