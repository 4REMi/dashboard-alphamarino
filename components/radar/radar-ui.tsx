"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ArrowUpRight, Check, Loader2, Pause, ListPlus, Target, X, Undo2, ImageOff, TrendingDown, TrendingUp, Flame, Layers, Link2, FlaskConical, Clock, Gauge, Rocket } from "lucide-react"
import { applyRec, dismissRec, undoRec } from "@/lib/actions/radar"
import { DISMISS_REASONS, type RadarAdRef, type RadarRec, type RadarRule, type RadarSeverity, type RadarSnapshot } from "@/lib/radar/types"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

// Piezas visuales del Radar. Código de color fijo en todo el dashboard:
// rojo = urgente, ámbar = atención, verde = oportunidad.

export const SEV_STYLE: Record<RadarSeverity, { label: string; stripe: string; chip: string; dot: string; text: string; ring: string }> = {
  crit: { label: "Urgente", stripe: "bg-red-500", chip: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300", dot: "bg-red-500", text: "text-red-600 dark:text-red-400", ring: "ring-red-200 dark:ring-red-900" },
  warn: { label: "Atención", stripe: "bg-amber-400", chip: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300", dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-200 dark:ring-amber-900" },
  good: { label: "Oportunidad", stripe: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-200 dark:ring-emerald-900" },
}

export const RULE_META: Record<RadarRule, { label: string; Icon: typeof Gauge }> = {
  strategy: { label: "Estrategia", Icon: Target },
  pacing: { label: "Ritmo de gasto", Icon: Gauge },
  underspend: { label: "Subinversión", Icon: TrendingDown },
  line_cpr: { label: "Costo por resultado", Icon: TrendingUp },
  kill: { label: "Apagar", Icon: Pause },
  graduate: { label: "Graduar", Icon: Rocket },
  fatigue: { label: "Fatiga", Icon: Flame },
  structure: { label: "Estructura", Icon: Layers },
  unlinked: { label: "Sin concepto", Icon: Link2 },
  testing: { label: "Pruebas", Icon: FlaskConical },
  stale: { label: "Datos", Icon: Clock },
}

export function money(n: number | null | undefined, currency: string, compact = false) {
  if (n == null || !isFinite(n)) return "—"
  try { return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: compact || n >= 100 ? 0 : 2 }).format(n) }
  catch { return `${n.toFixed(0)} ${currency}` }
}

export function SeverityCounts({ counts, size = "md" }: { counts: Record<RadarSeverity, number>; size?: "sm" | "md" }) {
  const order: RadarSeverity[] = ["crit", "warn", "good"]
  const any = order.some((s) => counts[s])
  if (!any) return <span className={cn("inline-flex items-center gap-1 rounded-full font-semibold", SEV_STYLE.good.chip, size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5")}><Check className="w-3 h-3" />En orden</span>
  return (
    <span className="inline-flex items-center gap-1">
      {order.filter((s) => counts[s]).map((s) => (
        <span key={s} title={SEV_STYLE[s].label} className={cn("inline-flex items-center justify-center rounded-md font-bold tabular-nums", SEV_STYLE[s].chip, size === "sm" ? "text-[10px] min-w-[18px] h-[18px] px-1" : "text-xs min-w-[22px] h-[22px] px-1.5")}>{counts[s]}</span>
      ))}
    </span>
  )
}

// Barra de ritmo: lo gastado (color según desvío), una marca de dónde
// deberías ir hoy y una sombra con la proyección al cierre.
export function PacingBar({ pacing, currency, day, days, compact }: { pacing: NonNullable<RadarSnapshot["pacing"]>; currency: string; day: number; days: number; compact?: boolean }) {
  const scale = Math.max(pacing.budget, pacing.projection, pacing.spend) * 1.02 || 1
  const w = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  const ratio = pacing.expected > 0 ? pacing.spend / pacing.expected : 1
  const tone = pacing.pct >= 100 || ratio > 1.2 ? "bg-red-500" : ratio > 1.08 ? "bg-amber-400" : ratio < 0.75 && day >= 5 ? "bg-sky-400" : "bg-emerald-500"
  return (
    <div className="space-y-1.5">
      {!compact && (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span><b className="text-base tabular-nums">{money(pacing.spend, currency, true)}</b> <span className="text-muted-foreground">de {money(pacing.budget, currency, true)}</span></span>
          <span className="text-muted-foreground tabular-nums">Día {day}/{days} · proyección <b className={cn(pacing.projection > pacing.budget * 1.08 ? "text-red-600 dark:text-red-400" : "text-foreground")}>{money(pacing.projection, currency, true)}</b></span>
        </div>
      )}
      <div className={cn("relative rounded-full bg-muted overflow-hidden", compact ? "h-1.5" : "h-3")}>
        <div className="absolute inset-y-0 left-0 bg-foreground/10" style={{ width: w(pacing.projection) }} title={`Proyección: ${money(pacing.projection, currency, true)}`} />
        <div className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: w(pacing.spend) }} />
        <div className="absolute inset-y-[-2px] w-[2px] bg-foreground/70" style={{ left: w(pacing.expected) }} title={`Esperado hoy: ${money(pacing.expected, currency, true)}`} />
        <div className="absolute inset-y-0 w-px bg-foreground/40 border-l border-dashed" style={{ left: w(pacing.budget) }} title="Presupuesto pactado" />
      </div>
      {!compact && (
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className={cn("w-2 h-2 rounded-full", tone)} />Gastado</span>
          <span className="inline-flex items-center gap-1"><span className="w-[2px] h-2.5 bg-foreground/70" />Esperado hoy</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-foreground/10" />Proyección al cierre</span>
        </div>
      )}
    </div>
  )
}

export function AdThumb({ ad, size = 56, className }: { ad: RadarAdRef; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className={cn("relative shrink-0 rounded-md overflow-hidden bg-muted border border-border", className)} style={{ width: size, height: size * 1.25 }} title={`${ad.name}${ad.conceptName ? ` · ${ad.conceptName}` : ""}`}>
      {ad.thumb && !broken
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={ad.thumb} alt="" className="w-full h-full object-cover" onError={() => setBroken(true)} />
        : <span className="absolute inset-0 flex items-center justify-center text-muted-foreground"><ImageOff className="w-4 h-4" /></span>}
    </div>
  )
}

type CardState = "idle" | "confirm" | "dismiss" | "done" | "dismissed"

export function RecCard({ rec, projectId, currency, canEdit, onStrategy, onChanged }: { rec: RadarRec; projectId: string; currency: string; canEdit: boolean; onStrategy: () => void; onChanged: () => void }) {
  const [state, setState] = useState<CardState>("idle")
  const [result, setResult] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const toast = useToast()
  const sev = SEV_STYLE[rec.severity]
  const { Icon, label } = RULE_META[rec.rule]
  const a = rec.action
  void currency

  function primary() {
    if (!a) return
    if (a.kind === "strategy") return onStrategy()
    setState("confirm")
  }
  function confirm() {
    start(async () => {
      try { const r = await applyRec(projectId, rec.key); setResult(r.message); setState("done"); toast(r.message); onChanged() }
      catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); setState("idle") }
    })
  }
  function dismiss(reason: string) {
    start(async () => {
      try { await dismissRec(projectId, rec.key, reason); setResult(reason); setState("dismissed") }
      catch (e) { toast(e instanceof Error ? e.message : String(e), "error") }
    })
  }
  function undo() {
    start(async () => { await undoRec(projectId, rec.key); setState("idle"); setResult(null) })
  }

  const resolved = state === "done" || state === "dismissed"
  return (
    <article className={cn("relative rounded-xl border border-border bg-card overflow-hidden transition-opacity", resolved && "opacity-60")}>
      <span className={cn("absolute inset-y-0 left-0 w-1", sev.stripe)} />
      <div className="pl-4 pr-4 py-3.5 flex gap-3.5">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", sev.chip)}><Icon className="w-3 h-3" />{label}</span>
            <span className="text-[11px] text-muted-foreground truncate">{rec.where}</span>
            {rec.channel !== "Todos" && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">{rec.channel}</span>}
          </div>
          <h4 className="text-sm font-semibold leading-snug text-balance">{rec.title}</h4>
          {rec.evidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {rec.evidence.map((e, i) => (
                <span key={i} className="text-[11px] rounded-md border border-border bg-muted/40 px-2 py-0.5 tabular-nums">
                  <span className="text-muted-foreground">{e.label}: </span>
                  <b className={cn(e.tone === "bad" && "text-red-600 dark:text-red-400", e.tone === "good" && "text-emerald-600 dark:text-emerald-400")}>{e.value}</b>
                </span>
              ))}
            </div>
          )}

          {/* Acciones */}
          <div className="pt-1">
            {state === "idle" && (
              <div className="flex items-center gap-2 flex-wrap">
                {a && a.kind === "link" && (
                  <Link href={a.href} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90">{a.label}<ArrowUpRight className="w-3.5 h-3.5" /></Link>
                )}
                {a && a.kind !== "link" && canEdit && (
                  <button onClick={primary} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90">
                    {a.kind === "task" ? <ListPlus className="w-3.5 h-3.5" /> : a.kind === "strategy" ? <Target className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}{a.label}
                  </button>
                )}
                {canEdit && rec.rule !== "strategy" && (
                  <button onClick={() => setState("dismiss")} className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted">Descartar</button>
                )}
              </div>
            )}
            {state === "confirm" && a && (
              <div className={cn("rounded-lg ring-1 bg-muted/30 px-3 py-2.5 space-y-2", sev.ring)}>
                <p className="text-xs">
                  {a.kind === "pause_ads" || a.kind === "pause_campaigns"
                    ? <>Se hará <b>en Meta, ahora</b>: {a.label.toLowerCase()}. Queda anotado en la bitácora.</>
                    : <>Se creará la tarea <b>“{a.kind === "task" ? a.title : ""}”</b> asignada a ti. Queda anotado en la bitácora.</>}
                </p>
                <div className="flex gap-2">
                  <button onClick={confirm} disabled={isPending} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                    {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Confirmar
                  </button>
                  <button onClick={() => setState("idle")} disabled={isPending} className="h-8 px-3 rounded-lg border border-border text-xs">Cancelar</button>
                </div>
              </div>
            )}
            {state === "dismiss" && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">¿Por qué la descartas? (ajusta las reglas)</p>
                <div className="flex flex-wrap gap-1.5">
                  {DISMISS_REASONS.map((r) => (
                    <button key={r} onClick={() => dismiss(r)} disabled={isPending} className="h-7 px-2.5 rounded-full border border-border text-xs hover:bg-muted disabled:opacity-50">{r}</button>
                  ))}
                  <button onClick={() => setState("idle")} className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted inline-flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
            {state === "done" && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" />{result} · anotado en la bitácora</p>}
            {state === "dismissed" && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-2">Descartada: “{result}”
                <button onClick={undo} disabled={isPending} className="inline-flex items-center gap-1 text-foreground hover:underline"><Undo2 className="w-3 h-3" />Deshacer</button></p>
            )}
          </div>
        </div>

        {rec.ads.length > 0 && (
          <div className="hidden sm:flex shrink-0 gap-1.5 items-start">
            {rec.ads.slice(0, 3).map((ad) => <AdThumb key={ad.adId} ad={ad} size={rec.ads.length === 1 ? 72 : 52} />)}
            {rec.ads.length > 3 && <span className="text-[11px] text-muted-foreground self-center">+{rec.ads.length - 3}</span>}
          </div>
        )}
      </div>
      {rec.ads.length > 0 && (
        <div className="sm:hidden flex gap-1.5 px-4 pb-3">{rec.ads.slice(0, 4).map((ad) => <AdThumb key={ad.adId} ad={ad} size={44} />)}</div>
      )}
    </article>
  )
}
