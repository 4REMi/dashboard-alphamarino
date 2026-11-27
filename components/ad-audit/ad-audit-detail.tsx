"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  biggestDrop, computeMetric, curvePoints, formatMetric, formatMoney, formatSec, lostDuring, metricById, retentionAt,
  type Counters, type CurvePoint, type MetricDef, type MetricId, type ResultKind,
} from "@/lib/ad-audit/metrics"
import type { AuditAdView, AuditAdsetView, CampaignAuditView } from "@/lib/ad-audit/queries"
import { PART_LABEL, type PartKey } from "@/lib/ad-audit/parts"
import { queueAuditAnalyses } from "@/lib/actions/ad-audits"
import { CMP_CLASS, VerdictChip, breakSummary } from "@/components/ad-audit/ui"

// ── Utilidades ────────────────────────────────────────────────────

// Con quién comparar por defecto: el ganador con mejor costo por resultado
// del mismo conjunto; si no hay, el de más gasto (que no sea este).
function defaultComparison(ad: AuditAdView, adset: AuditAdsetView): AuditAdView | null {
  const others = adset.ads.filter((a) => a.id !== ad.id && a.format === ad.format)
  const winners = others.filter((a) => a.evaluation.verdict === "win" && a.evaluation.metrics.cpr.value !== null)
    .sort((x, y) => (x.evaluation.metrics.cpr.value ?? Infinity) - (y.evaluation.metrics.cpr.value ?? Infinity))
  return winners[0] ?? others.sort((x, y) => y.counters.spend - x.counters.spend)[0] ?? null
}

// "0:03-0:07" → [3, 7]
function parseRange(t: string): [number, number] | null {
  const m = t.match(/(\d+):(\d{2})\s*[-–]\s*(\d+):(\d{2})/)
  if (!m) return null
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])]
}

const MOMENT_CLASS: Record<string, string> = {
  gancho: "bg-violet-500/25 text-violet-800 dark:text-violet-200",
  problema: "bg-orange-500/20 text-orange-800 dark:text-orange-200",
  "demostración": "bg-sky-500/20 text-sky-800 dark:text-sky-200",
  "prueba social": "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
  oferta: "bg-amber-500/25 text-amber-800 dark:text-amber-200",
  cta: "bg-rose-500/20 text-rose-800 dark:text-rose-200",
}
const momentClass = (m: string) => MOMENT_CLASS[m.toLowerCase()] ?? "bg-muted text-muted-foreground"

interface Moment { from: number; to: number; momento: string; que_pasa: string; lost: number | null }

function momentsOf(ad: AuditAdView, pts: CurvePoint[]): Moment[] {
  return ad.structure.map((s) => {
    const r = parseRange(s.t)
    return r ? { from: r[0], to: r[1], momento: s.momento, que_pasa: s.que_pasa, lost: pts.length > 1 ? lostDuring(pts, r[0], r[1]) : null } : null
  }).filter(Boolean) as Moment[]
}

// Pasos del embudo comparable por cada 1,000 impresiones, según el tipo de resultado.
function funnelSteps(kind: ResultKind, isVideo: boolean, resultLabel: string): { key: keyof Counters; label: string }[] {
  const steps: { key: keyof Counters; label: string }[] = []
  if (isVideo) steps.push({ key: "video_3s", label: "Detienen (3 s)" }, { key: "video_p50", label: "Llegan a la mitad" })
  steps.push({ key: "outbound_clicks", label: "Hacen clic" })
  if (kind === "purchase" || kind === "lead") steps.push({ key: "landing_page_views", label: "Visitan la página" })
  if (kind === "purchase") steps.push({ key: "add_to_cart", label: "Agregan al carrito" }, { key: "initiate_checkout", label: "Inician pago" })
  steps.push({ key: "results", label: resultLabel })
  return steps
}

const per1000 = (c: Counters, k: keyof Counters) => (c.impressions > 0 ? (c[k] / c.impressions) * 1000 : 0)
const fmtPer = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("es-MX") : n >= 10 ? n.toFixed(0) : n.toFixed(1))

// ── Componente ────────────────────────────────────────────────────

export function AdAuditDetail({ ad, adset, view, currency, backHref, metrics, basePath }: {
  ad: AuditAdView; adset: AuditAdsetView; view: CampaignAuditView; currency: string; backHref: string; metrics: MetricDef[]; basePath: string
}) {
  const router = useRouter()
  const [pendingQueue, startQueue] = useTransition()
  const [queued, setQueued] = useState<Set<string>>(new Set())
  const [otherId, setOtherId] = useState<string>(defaultComparison(ad, adset)?.id ?? "")
  const all = useMemo(() => view.adsets.flatMap((s) => s.ads.map((a) => ({ a, set: s }))), [view])
  const other = all.find((x) => x.a.id === otherId)?.a ?? null
  const otherSet = all.find((x) => x.a.id === otherId)?.set ?? null
  const crossAdset = !!otherSet && otherSet.id !== adset.id

  const isVideo = ad.format === "video"
  const mainRef = useRef<HTMLVideoElement>(null)
  const otherRef = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)

  const pts = useMemo(() => curvePoints(ad.curve, ad.durationSec), [ad])
  const otherPts = useMemo(() => (other ? curvePoints(other.curve, other.durationSec) : []), [other])
  const drop = useMemo(() => biggestDrop(pts), [pts])
  const maxSec = Math.max(pts.at(-1)?.sec ?? 0, otherPts.at(-1)?.sec ?? 0, ad.durationSec ?? 0, other?.durationSec ?? 0, 1)
  const myMoments = useMemo(() => momentsOf(ad, pts), [ad, pts])
  const otherMoments = useMemo(() => (other ? momentsOf(other, otherPts) : []), [other, otherPts])

  const seekBoth = (sec: number) => {
    for (const v of [mainRef.current, otherRef.current]) if (v) v.currentTime = Math.min(sec, (v.duration || sec + 1) - 0.05)
    setTime(sec)
  }
  const seekOne = (which: "main" | "other", sec: number) => {
    const v = which === "main" ? mainRef.current : otherRef.current
    if (v) v.currentTime = Math.min(sec, (v.duration || sec + 1) - 0.05)
    if (which === "main") setTime(sec)
  }
  // Cada video salta a SU propia parte (el cuerpo de uno contra el del otro).
  const jumpToPart = (p: PartKey) => {
    const a = ad.parts?.[p]?.desde
    const b = other?.parts?.[p]?.desde
    if (a != null) seekOne("main", a)
    if (b != null) seekOne("other", b)
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

  const analyze = (id: string) => startQueue(async () => {
    await queueAuditAnalyses(view.campaign.id, [id])
    setQueued((q) => new Set(q).add(id))
    router.refresh()
  })

  const e = ad.evaluation
  const kind = adset.result.kind
  const steps = funnelSteps(kind, isVideo && (!other || other.format === "video"), adset.result.label)

  // Dónde se separan: el paso (tasa de un paso al siguiente) con la mayor
  // diferencia relativa entre los dos anuncios.
  let gap: { label: string; rel: number } | null = null
  if (other) {
    for (let i = 0; i < steps.length; i++) {
      const prevA = i === 0 ? ad.counters.impressions : ad.counters[steps[i - 1].key]
      const prevB = i === 0 ? other.counters.impressions : other.counters[steps[i - 1].key]
      if (prevA < 50 || prevB < 50) continue
      const ra = ad.counters[steps[i].key] / prevA
      const rb = other.counters[steps[i].key] / prevB
      if (rb <= 0) continue
      const rel = (ra - rb) / rb
      if (!gap || Math.abs(rel) > Math.abs(gap.rel)) gap = { label: `${i === 0 ? "impresión" : steps[i - 1].label.toLowerCase()} → ${steps[i].label.toLowerCase()}`, rel }
    }
  }

  const val = (a: AuditAdView, id: MetricId) => {
    const m = computeMetric(metricById(id, metrics), a.counters, { isVideo: a.format === "video", missing: view.campaign.missing_events, kind })
    return formatMetric(metricById(id, metrics), m.value, currency)
  }
  const costIds: MetricId[] = kind === "purchase" ? ["cpm", "cpc", "cpr", "aov", "roas"] : ["cpm", "cpc", "cpr"]
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : "—")

  const bigStats = (a: AuditAdView) => (
    <div className="flex flex-wrap gap-x-6 gap-y-1">
      <div><p className="text-[11px] text-muted-foreground">Gasto</p><p className="text-xl font-bold tabular-nums">{formatMoney(a.counters.spend, currency)}</p><p className="text-[11px] text-muted-foreground">{(a.evaluation.spendShare * 100).toFixed(1)} % de su conjunto</p></div>
      <div><p className="text-[11px] text-muted-foreground">{adset.result.label}</p><p className="text-xl font-bold tabular-nums">{Math.round(a.counters.results).toLocaleString("es-MX")}</p><p className="text-[11px] text-muted-foreground">{val(a, "cpr")} por resultado</p></div>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado: gasto y resultados en grande */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href={backHref} className="text-xs text-muted-foreground hover:underline">← {adset.name}</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{ad.name}</h1>
            <VerdictChip evaluation={e} />
          </div>
          {bigStats(ad)}
          <p className="text-sm text-muted-foreground">{breakSummary(e, currency, metrics)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Comparar con
            <select value={otherId} onChange={(ev) => setOtherId(ev.target.value)} className="h-10 min-w-[260px] rounded-lg border border-border bg-background px-2 text-sm text-foreground">
              <option value="">Sin comparar</option>
              <optgroup label={`Mismo conjunto · ${adset.name}`}>
                {adset.ads.filter((a) => a.id !== ad.id).map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {a.evaluation.verdict === "win" ? "Ganador" : a.evaluation.verdict === "lose" ? "Perdedor" : "—"} · {val(a, "cpr")}</option>
                ))}
              </optgroup>
              {view.adsets.filter((s) => s.id !== adset.id).map((s) => (
                <optgroup key={s.id} label={`Otro conjunto · ${s.name}`}>
                  {s.ads.map((a) => <option key={a.id} value={a.id}>{a.name} · otra audiencia</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {ad.landingUrl && <a href={ad.landingUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">Página de destino ↗</a>}
        </div>
      </div>
      {adset.result.stale && <p className="rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-2 text-sm">Capturada con una versión vieja de la extensión (solo guardaba compras): {adset.result.label.toLowerCase()} sale en 0 hasta volver a auditar con la v0.6.</p>}
      {crossAdset && <p className="rounded-lg border border-orange-500/40 bg-orange-500/5 px-3 py-2 text-sm">Estás comparando con un anuncio de otro conjunto ({otherSet?.name}): otra audiencia o presupuesto. Sirve para ver diferencias de creativo, no para decidir quién gana.</p>}

      {/* Qué cambia entre los dos */}
      {other && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Qué cambia entre los dos</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["gancho", "cuerpo", "cierre"] as PartKey[]).map((p) => {
              const a = ad.parts?.[p]?.tipo
              const b = other.parts?.[p]?.tipo
              const same = a && b && a === b
              return (
                <div key={p} className={cn("rounded-lg border px-3 py-2 text-sm", same ? "border-border" : "border-orange-500/40")}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{PART_LABEL[p]} · {a && b ? (same ? "igual" : "distinto") : "sin analizar"}</p>
                  <p><span className="font-semibold">{a ?? "—"}</span> <span className="text-muted-foreground">vs</span> {b ?? "—"}</p>
                </div>
              )
            })}
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p><span className="font-semibold text-foreground">{ad.name}:</span> {ad.conceptName ?? "sin análisis de concepto"}{ad.concept?.angle_type ? ` · ${ad.concept.angle_type}` : ""}{ad.concept?.awareness_stage ? ` · conciencia ${ad.concept.awareness_stage}` : ""}</p>
            <p><span className="font-semibold text-foreground">{other.name}:</span> {other.conceptName ?? "sin análisis de concepto"}{other.concept?.angle_type ? ` · ${other.concept.angle_type}` : ""}{other.concept?.awareness_stage ? ` · conciencia ${other.concept.awareness_stage}` : ""}</p>
          </div>
        </div>
      )}

      {/* Videos fijos a la izquierda (siguen a la vista mientras se recorre el
          análisis y se hace clic en la curva); en pantallas angostas van arriba. */}
      <div className={cn("grid items-start gap-5", other ? "lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]")}>
        <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4">
          <div className={cn("grid gap-3", other ? "grid-cols-2" : "mx-auto w-full max-w-[300px] grid-cols-1")}>
            {[{ a: ad, ref: mainRef, p: pts, tag: "Este anuncio" }, ...(other ? [{ a: other, ref: otherRef, p: otherPts, tag: crossAdset ? "Otro conjunto" : other.evaluation.verdict === "win" ? "Ganador del conjunto" : "Del conjunto" }] : [])].map(({ a, ref, p, tag }) => {
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
                    <span className="absolute left-1.5 top-1.5 max-w-[92%] truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white" title={`${tag} · ${a.name}`}>{tag}</span>
                    {a.format === "video" && (
                      <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-white">
                        <span className="block text-xl font-bold tabular-nums">{keep === null ? "—" : `${Math.round(keep)} %`}</span>
                        <span className="text-[11px] text-white/80">siguen en {formatSec(time)}</span>
                      </span>
                    )}
                  </div>
                  {other && (
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span className="truncate font-semibold" title={a.name}>{a.name}</span>
                      <span className="tabular-nums"><span className="text-base font-bold">{formatMoney(a.counters.spend, currency)}</span> <span className="text-muted-foreground">· {(a.evaluation.spendShare * 100).toFixed(0)} %</span></span>
                      <span className="tabular-nums"><span className="text-base font-bold">{Math.round(a.counters.results).toLocaleString("es-MX")}</span> <span className="text-muted-foreground">· {val(a, "cpr")} c/u</span></span>
                    </div>
                  )}
                  {!a.parts && a.format !== "other" && (
                    <button onClick={() => analyze(a.id)} disabled={pendingQueue || queued.has(a.id)}
                      className="h-9 rounded-lg border border-border px-2 text-xs font-semibold disabled:opacity-60">
                      {queued.has(a.id) ? "En la cola…" : "Analizar creativo"}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {isVideo && (
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Saltar a una parte del video">
              {ad.videoUrl && (
                <button onClick={togglePlay} className="col-span-4 h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  {playing ? "Pausar" : other ? "Reproducir ambos" : "Reproducir"}
                </button>
              )}
              {(["gancho", "cuerpo", "cierre"] as PartKey[]).map((p) => (
                <button key={p} onClick={() => jumpToPart(p)} disabled={ad.parts?.[p]?.desde == null}
                  title={other ? "Cada video salta a su propia parte" : undefined}
                  className="flex h-12 min-w-0 flex-col items-start justify-center rounded-lg border border-border px-2 text-left text-xs disabled:opacity-40">
                  <span className="font-bold">{PART_LABEL[p]}</span>
                  <span className="w-full truncate text-muted-foreground tabular-nums">{ad.parts?.[p]?.desde != null ? formatSec(ad.parts[p].desde!) : "—"}{other?.parts?.[p]?.desde != null ? ` · ${formatSec(other.parts[p].desde!)}` : ""}</span>
                </button>
              ))}
              {drop && drop.lostShare > 0 && (
                <button onClick={() => seekBoth(drop.from)} title={`Mayor caída después del gancho: se va el ${Math.round(drop.lostShare * 100)} %`} className="flex h-12 min-w-0 flex-col items-start justify-center rounded-lg border border-orange-500/60 px-2 text-left text-xs text-orange-700 dark:text-orange-300">
                  <span className="font-bold tabular-nums">{formatSec(drop.from)}</span><span className="w-full truncate">−{Math.round(drop.lostShare * 100)} %</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {/* Retención + estructura alineada */}
          {isVideo && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">Retención y estructura</h2>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded bg-orange-500" />{ad.name}</span>
                  {other && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-emerald-500" />{other.name}</span>}
                </div>
              </div>
              {pts.length > 1 ? (
                <RetentionChart pts={pts} otherPts={otherPts} maxSec={maxSec} time={time} drop={drop} onSeek={seekBoth} />
              ) : (
                <p className="text-sm text-muted-foreground">Meta no dio la curva de retención de este anuncio.</p>
              )}
              {/* Momentos del análisis, alineados con el eje de la gráfica */}
              {[{ a: ad, ms: myMoments, which: "main" as const }, ...(other ? [{ a: other, ms: otherMoments, which: "other" as const }] : [])].map(({ a, ms, which }) => (
                <div key={a.id} className="mt-2">
                  <p className="mb-1 text-[11px] text-muted-foreground">{a.name}{ms.length === 0 ? " · sin análisis de estructura" : ""}</p>
                  {ms.length > 0 && (
                    <div className="relative h-8" style={{ marginLeft: `${(40 / 640) * 100}%`, marginRight: `${(16 / 640) * 100}%` }}>
                      {ms.map((m, i) => (
                        <button key={i} onClick={() => seekOne(which, m.from)} title={`${formatSec(m.from)}–${formatSec(m.to)} · ${m.momento}: ${m.que_pasa}`}
                          className={cn("absolute top-0 h-8 overflow-hidden truncate rounded px-1 text-left text-[10px] font-semibold", momentClass(m.momento))}
                          style={{ left: `${(Math.min(m.from, maxSec) / maxSec) * 100}%`, width: `calc(${(Math.max(0.5, Math.min(m.to, maxSec) - Math.min(m.from, maxSec)) / maxSec) * 100}% - 2px)` }}>
                          {m.momento}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <p className="mt-2 text-xs text-muted-foreground">Clic en la gráfica: ambos videos van a ese segundo. Clic en un momento: ese video salta ahí.</p>
            </div>
          )}

          {/* Retención por momento */}
          {isVideo && (myMoments.length > 0 || otherMoments.length > 0) && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-base font-semibold">Cuánta gente se va en cada momento</h2>
              <div className={cn("grid gap-4", other ? "md:grid-cols-2" : "")}>
                {[{ a: ad, ms: myMoments, which: "main" as const }, ...(other ? [{ a: other, ms: otherMoments, which: "other" as const }] : [])].map(({ a, ms, which }) => {
                  const worst = ms.reduce<Moment | null>((w, m) => (m.lost !== null && m.from >= 3 && (!w || (m.lost / Math.max(1, m.to - m.from)) > ((w.lost ?? 0) / Math.max(1, w.to - w.from))) ? m : w), null)
                  return (
                    <div key={a.id} className="flex flex-col gap-1.5">
                      <p className="text-xs font-semibold">{a.name}</p>
                      {ms.length === 0 && <p className="text-xs text-muted-foreground">Sin análisis de estructura.</p>}
                      {ms.map((m, i) => (
                        <button key={i} onClick={() => seekOne(which, m.from)}
                          className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs", m === worst ? "border-orange-500 bg-orange-500/10" : "border-border")}>
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", momentClass(m.momento))}>{m.momento}</span>
                          <span className="min-w-0 truncate" title={m.que_pasa}><span className="tabular-nums text-muted-foreground">{formatSec(m.from)}–{formatSec(m.to)}</span> {m.que_pasa}</span>
                          <span className="font-semibold tabular-nums">{m.lost === null ? "—" : `se va ${Math.round(m.lost * 100)} %`}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">% de quienes seguían al empezar el momento. En naranja, el momento que más gente pierde por segundo (después del gancho).</p>
            </div>
          )}

          {/* Embudo comparado por cada 1,000 impresiones */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Embudo por cada 1,000 impresiones</h2>
              <span className="text-xs text-muted-foreground">Resultado: {adset.result.label}</span>
            </div>
            {gap && other && (
              <p className="mb-2 rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="font-semibold">Dónde se separan:</span> en {gap.label}, {ad.name} convierte {Math.abs(Math.round(gap.rel * 100))} % {gap.rel >= 0 ? "más" : "menos"} que {other.name}.
              </p>
            )}
            <div className="overflow-x-auto">
              <div className="min-w-[480px]">
                {steps.map((st) => {
                  const a = per1000(ad.counters, st.key)
                  const b = other ? per1000(other.counters, st.key) : null
                  const max = Math.max(a, b ?? 0, 0.0001)
                  const rel = b && b > 0 ? (a - b) / b : null
                  const metricForStep: Partial<Record<keyof Counters, MetricId>> = { video_3s: "hook", video_p50: "hold", outbound_clicks: "ctr", landing_page_views: "click_visit", add_to_cart: "visit_cart", initiate_checkout: "cart_checkout", results: kind === "purchase" ? "checkout_purchase" : "result_rate" }
                  const isBreak = e.breakAt === metricForStep[st.key]
                  return (
                    <div key={st.key} className={cn("grid grid-cols-[1.3fr_2fr_auto] items-center gap-3 border-b border-border/60 px-2 py-2 text-sm last:border-0", isBreak && "rounded-lg bg-orange-500/10 outline outline-1 outline-orange-500")}>
                      <span>{st.label}</span>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2"><div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.max(1, (a / max) * 100)}%` }} /><span className="text-xs tabular-nums">{fmtPer(a)}</span></div>
                        {b !== null && <div className="flex items-center gap-2"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(1, (b / max) * 100)}%` }} /><span className="text-xs tabular-nums text-muted-foreground">{fmtPer(b)}</span></div>}
                      </div>
                      <span className={cn("text-xs font-semibold tabular-nums", rel === null ? "text-muted-foreground" : rel >= 0 ? CMP_CLASS.better : CMP_CLASS.worse)}>{rel === null ? "" : `${rel >= 0 ? "+" : ""}${Math.round(rel * 100)} %`}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Naranja: {ad.name}{other ? ` · verde: ${other.name}` : ""}. Normalizado por impresiones para comparar anuncios con distinto gasto.{ad.counters.results < 20 ? ` ${Math.round(ad.counters.results)} resultados: el final del embudo tiene confianza baja.` : ""}</p>
          </div>

          {/* Costos, alcance y retención en puntos fijos */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-base font-semibold">Costos y entrega</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-1 font-semibold" /><th className="py-1 font-semibold">{ad.name}</th>{other && <th className="py-1 font-semibold">{other.name}</th>}</tr></thead>
                <tbody>
                  {costIds.map((id) => (
                    <tr key={id} className="border-t border-border/60"><td className="py-1.5 text-muted-foreground" title={metricById(id, metrics).formula}>{metricById(id, metrics).label}</td><td className="py-1.5 font-semibold tabular-nums">{val(ad, id)}</td>{other && <td className="py-1.5 tabular-nums">{val(other, id)}</td>}</tr>
                  ))}
                  <tr className="border-t border-border/60"><td className="py-1.5 text-muted-foreground">Alcance</td><td className="py-1.5 font-semibold tabular-nums">{ad.reach?.toLocaleString("es-MX") ?? "—"}</td>{other && <td className="py-1.5 tabular-nums">{other.reach?.toLocaleString("es-MX") ?? "—"}</td>}</tr>
                  <tr className="border-t border-border/60"><td className="py-1.5 text-muted-foreground" title="Veces que cada persona lo vio en promedio">Frecuencia</td><td className="py-1.5 font-semibold tabular-nums">{ad.frequency?.toFixed(2) ?? "—"}</td>{other && <td className="py-1.5 tabular-nums">{other.frequency?.toFixed(2) ?? "—"}</td>}</tr>
                  {isVideo && <tr className="border-t border-border/60"><td className="py-1.5 text-muted-foreground">Tiempo promedio visto</td><td className="py-1.5 font-semibold tabular-nums">{ad.avgWatchSec != null ? `${ad.avgWatchSec.toFixed(1)} s` : "—"}</td>{other && <td className="py-1.5 tabular-nums">{other.avgWatchSec != null ? `${other.avgWatchSec.toFixed(1)} s` : "—"}</td>}</tr>}
                </tbody>
              </table>
              {(ad.reach == null) && <p className="mt-2 text-[11px] text-muted-foreground">Alcance, frecuencia y tiempo visto llegan al volver a auditar con la extensión v0.6.</p>}
            </div>
            {isVideo && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 text-base font-semibold">Retención en puntos fijos</h2>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-1 font-semibold">De quienes pasan 3 s</th><th className="py-1 font-semibold">{ad.name}</th>{other && <th className="py-1 font-semibold">{other.name}</th>}</tr></thead>
                  <tbody>
                    {([["video_p25", "Llegan al 25 %"], ["video_p50", "Llegan al 50 %"], ["video_p75", "Llegan al 75 %"], ["video_p95", "Llegan al 95 %"], ["video_p100", "Lo ven completo"], ["thruplays", "ThruPlay"]] as [keyof Counters, string][]).map(([k, label]) => (
                      <tr key={k} className="border-t border-border/60"><td className="py-1.5 text-muted-foreground">{label}</td><td className="py-1.5 font-semibold tabular-nums">{pct(ad.counters[k], ad.counters.video_3s)}</td>{other && <td className="py-1.5 tabular-nums">{pct(other.counters[k], other.counters.video_3s)}</td>}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tendencia semanal: fatiga */}
          {ad.weekly.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-1 text-base font-semibold">Tendencia por semana</h2>
              <p className="mb-3 text-xs text-muted-foreground">Para ver fatiga: un anuncio que ganaba y se está cayendo, o uno que empezó mal y mejoró.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {([["hook", "Hook rate"], ["ctr", "CTR"], ["cpr", "Costo por resultado"]] as [MetricId, string][])
                  .filter(([id]) => id !== "hook" || isVideo)
                  .map(([id, label]) => <Trend key={id} label={label} id={id} ad={ad} other={other} metrics={metrics} currency={currency} kind={kind} missing={view.campaign.missing_events} />)}
              </div>
            </div>
          )}
          <Link href={`${basePath}`} className="sr-only">Volver a la campaña</Link>
        </div>
      </div>
    </div>
  )
}

function Trend({ label, id, ad, other, metrics, currency, kind, missing }: {
  label: string; id: MetricId; ad: AuditAdView; other: AuditAdView | null; metrics: MetricDef[]; currency: string; kind: ResultKind; missing: CampaignAuditView["campaign"]["missing_events"]
}) {
  const def = metricById(id, metrics)
  const series = (a: AuditAdView) => a.weekly.map((w) => {
    const m = computeMetric(def, w.counters, { isVideo: a.format === "video", missing, kind })
    // Por semana, la muestra mínima es la de la métrica completa: si no llega, hueco.
    return { week: w.week, v: m.den > 0 && w.counters.impressions >= 200 ? m.value : null }
  })
  const sa = series(ad)
  const sb = other ? series(other) : []
  const weeks = [...new Set([...sa, ...sb].map((x) => x.week))].sort()
  const vals = [...sa, ...sb].map((x) => x.v).filter((v): v is number => v !== null)
  if (weeks.length < 2 || vals.length < 2) return <div className="text-xs text-muted-foreground">{label}: pocas semanas con datos</div>
  const min = Math.min(...vals), max = Math.max(...vals)
  const W = 220, H = 60, P = 4
  const x = (w: string) => P + (weeks.indexOf(w) / Math.max(1, weeks.length - 1)) * (W - 2 * P)
  const y = (v: number) => H - P - ((v - min) / Math.max(1e-9, max - min)) * (H - 2 * P)
  const path = (s: { week: string; v: number | null }[]) => s.filter((p) => p.v !== null).map((p) => `${x(p.week).toFixed(1)},${y(p.v as number).toFixed(1)}`).join(" ")
  const last = sa.filter((p) => p.v !== null).at(-1)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{last ? formatMetric(def, last.v, currency) : "—"}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label} por semana`}>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="stroke-border" />
        {sb.length > 1 && <polyline points={path(sb)} fill="none" strokeWidth={1.5} strokeDasharray="4 3" className="stroke-emerald-500" />}
        <polyline points={path(sa)} fill="none" strokeWidth={2.5} className="stroke-orange-500" />
        {last && <circle cx={x(last.week)} cy={y(last.v as number)} r={3} className="fill-orange-500" />}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums"><span>{weeks[0].slice(5)}</span><span>{weeks.at(-1)!.slice(5)}</span></div>
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
      aria-label={`Curva de retención${drop ? `; mayor caída después del gancho entre ${formatSec(drop.from)} y ${formatSec(drop.to)}` : ""}`}
      onClick={(ev) => {
        const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect()
        const px = ((ev.clientX - r.left) / r.width) * W
        onSeek(Math.max(0, Math.min(maxSec, ((px - L) / (W - L - R)) * maxSec)))
      }}
    >
      <rect x={L} y={T} width={Math.max(0, x(3) - L)} height={H - T - B} className="fill-violet-500/10" />
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
