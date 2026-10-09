"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Radar, Target, Pencil, Quote, History, ChevronDown, RefreshCw, ShieldAlert, Bell, ArrowUpRight } from "lucide-react"
import { getProjectRadar, getRadarHistory } from "@/lib/actions/radar"
import type { RadarSnapshot } from "@/lib/radar/types"
import { StrategyDialog } from "@/components/radar/strategy-dialog"
import { PacingBar, RecCard, SeverityCounts, AdThumb, money, SEV_STYLE } from "@/components/radar/radar-ui"
import { cn } from "@/lib/utils"

// Radar de UN proyecto: estrategia del ciclo arriba (la apuesta, en grande),
// ritmo de gasto, 4 números y como máximo 5 recomendaciones. Se usa en el
// Hub Paid Media y como detalle en /radar.

const MAX_VISIBLE = 5

export function ProjectRadar({ projectId, initial, embedded = false, onChanged, projectHref }: { projectId: string; initial?: RadarSnapshot | null; embedded?: boolean; onChanged?: () => void; projectHref?: string }) {
  const [snap, setSnap] = useState<RadarSnapshot | null>(initial ?? null)
  const [loading, setLoading] = useState(!initial)
  const [error, setError] = useState<string | null>(null)
  const [strategyOpen, setStrategyOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getRadarHistory>> | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    getProjectRadar(projectId).then((s) => { setSnap(s); setError(null) }).catch((e) => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false))
  }, [projectId])
  useEffect(() => { if (initial) setSnap(initial); else load() }, [initial, load])
  useEffect(() => { setShowAll(false); setHistory(null) }, [projectId])

  const changed = () => { load(); onChanged?.() }

  if (error) return <p className="text-sm text-red-600 p-4">{error.includes("radar_") ? "Falta correr la migración 111 en Supabase." : error}</p>
  if (!snap) return <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Leyendo la cuenta…</div>

  const S = snap.strategy
  const visible = showAll ? snap.recs : snap.recs.slice(0, MAX_VISIBLE)
  const top = snap.recs[0]?.severity

  return (
    <div className={cn("space-y-4", !embedded && "")}>
      {/* Encabezado */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", top ? SEV_STYLE[top].chip : SEV_STYLE.good.chip)}><Radar className="w-5 h-5" /></div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold">{embedded ? "Radar" : snap.projectName}</h3>
            <SeverityCounts counts={snap.counts} />
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {snap.cycle ? `Ciclo ${snap.cycle.start} → ${snap.cycle.end} · día ${snap.cycle.day} de ${snap.cycle.days}` : "Sin ciclo activo"}
            {snap.lastSyncAt && ` · datos de ${new Date(snap.lastSyncAt).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
        {projectHref && <a href={projectHref} className="h-8 px-2.5 rounded-lg border border-border text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">Abrir proyecto<ArrowUpRight className="w-3 h-3" /></a>}
        <button onClick={load} title="Recalcular" className="h-8 w-8 rounded-lg border border-border inline-flex items-center justify-center text-muted-foreground hover:text-foreground"><RefreshCw className="w-3.5 h-3.5" /></button>
        {snap.canEdit && snap.cycle && (
          <button onClick={() => setStrategyOpen(true)} className={cn("h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5", S ? "border border-border hover:bg-muted" : "bg-primary text-primary-foreground")}>
            {S ? <Pencil className="w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />}{S ? "Ajustar estrategia" : "Definir estrategia"}
          </button>
        )}
        </div>
      </div>

      {/* Estrategia del ciclo */}
      {S ? (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex gap-2.5">
            <Quote className="w-4 h-4 text-primary shrink-0 mt-1" />
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-snug text-balance">{S.bet}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{S.confirmed_by_name ?? "Equipo"} · {new Date(S.confirmed_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {S.lines.map((l) => (
              <span key={l.key} className="text-[11px] rounded-full border border-border px-2.5 py-1 inline-flex items-center gap-1.5">
                <b>{l.name}</b><span className="text-muted-foreground">{l.channel} · {l.conversion}{l.target_cpr ? ` · meta ${money(l.target_cpr, snap.currency)}` : ""}</span>
              </span>
            ))}
            <span className={cn("text-[11px] rounded-full px-2.5 py-1 inline-flex items-center gap-1", S.budget_guard === "auto_pause" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-muted text-muted-foreground")}>
              {S.budget_guard === "auto_pause" ? <><ShieldAlert className="w-3 h-3" />Pausa automática al 100%</> : <><Bell className="w-3 h-3" />Avisos 80/90%</>}
            </span>
          </div>
        </div>
      ) : snap.cycle && (
        <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-5 flex items-center gap-4 flex-wrap">
          <Target className="w-8 h-8 text-primary shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <p className="font-semibold">Este ciclo no tiene estrategia</p>
            <p className="text-xs text-muted-foreground">Sin estrategia el Radar no alerta: presupuesto, líneas con su meta, conceptos a probar y la apuesta del ciclo. ~5 minutos.</p>
          </div>
          {snap.canEdit && <button onClick={() => setStrategyOpen(true)} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Definir estrategia</button>}
        </div>
      )}

      {/* Ritmo + números */}
      {snap.pacing && snap.cycle && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4"><PacingBar pacing={snap.pacing} currency={snap.currency} day={snap.cycle.day} days={snap.cycle.days} /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 border-t border-border divide-x divide-border [&>*:nth-child(3)]:border-t md:[&>*:nth-child(3)]:border-t-0 [&>*:nth-child(4)]:border-t md:[&>*:nth-child(4)]:border-t-0">
            <Kpi label="Costo por resultado" value={money(snap.kpis.cpr, snap.currency)} sub={snap.kpis.targetCpr ? `meta ${money(snap.kpis.targetCpr, snap.currency)}` : undefined}
              tone={snap.kpis.cpr && snap.kpis.targetCpr ? (snap.kpis.cpr <= snap.kpis.targetCpr ? "good" : snap.kpis.cpr > snap.kpis.targetCpr * 1.2 ? "bad" : "warn") : undefined} />
            <Kpi label="Resultados" value={snap.kpis.results.toLocaleString("es-MX")} />
            <Kpi label="Frecuencia media" value={snap.kpis.frequency ? snap.kpis.frequency.toFixed(1) : "—"} tone={snap.kpis.frequency && snap.kpis.frequency >= 3 ? "warn" : undefined} />
            <Kpi label="CTR" value={snap.kpis.ctr != null ? `${snap.kpis.ctr.toFixed(2)}%` : "—"} />
          </div>
          {snap.channels.length > 1 && (
            <div className="border-t border-border px-4 py-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              {snap.channels.map((c) => <span key={c.channel}><b className="text-foreground">{c.channel}</b> {money(c.spend, snap.currency, true)} · {c.results} res.</span>)}
            </div>
          )}
        </div>
      )}

      {/* Resumen (por reglas, máx. 2 frases) */}
      {snap.cycle && <p className="text-sm text-muted-foreground px-1">{snap.summary}</p>}

      {/* Recomendaciones */}
      <div className="space-y-2.5">
        {visible.map((r) => (
          <RecCard key={r.key} rec={r} projectId={projectId} currency={snap.currency} canEdit={snap.canEdit} onStrategy={() => setStrategyOpen(true)} onChanged={changed} />
        ))}
        {snap.recs.length > MAX_VISIBLE && (
          <button onClick={() => setShowAll((v) => !v)} className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 inline-flex items-center justify-center gap-1">
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAll && "rotate-180")} />
            {showAll ? "Ver solo las 5 más importantes" : `${snap.recs.length - MAX_VISIBLE} más de menor impacto`}
          </button>
        )}
      </div>

      {/* Lo que más gasta (miniaturas) */}
      {snap.topAds.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lo que más invierte este ciclo</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {snap.topAds.map((ad) => (
              <div key={ad.adId} className="w-[92px] shrink-0">
                <AdThumb ad={ad} size={92} />
                <p className="text-[10px] mt-1 line-clamp-2 leading-tight">{ad.conceptName ?? <span className="text-amber-600">Sin concepto</span>}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial */}
      <div>
        <button onClick={() => (history ? setHistory(null) : getRadarHistory(projectId).then(setHistory))} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />{history ? "Ocultar historial" : `Historial${snap.hiddenCount ? ` · ${snap.hiddenCount} resuelta${snap.hiddenCount === 1 ? "" : "s"} este ciclo` : ""}`}
        </button>
        {history && (
          <ul className="mt-2 space-y-1.5">
            {history.length === 0 && <li className="text-xs text-muted-foreground">Nada todavía.</li>}
            {history.map((h) => (
              <li key={h.id} className="text-xs flex gap-2">
                <span className={cn("mt-1 w-2 h-2 rounded-full shrink-0", h.outcome === "applied" ? "bg-emerald-500" : h.outcome === "auto" ? "bg-violet-500" : "bg-muted-foreground/40")} />
                <span className="min-w-0"><b>{h.outcome === "applied" ? "Aplicada" : h.outcome === "auto" ? "Automático" : "Descartada"}</b>{h.reason ? ` (“${h.reason}”)` : ""} · {h.detail}
                  <span className="text-muted-foreground"> · {h.who ?? "Radar"}, {new Date(h.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <StrategyDialog projectId={projectId} open={strategyOpen} onOpenChange={setStrategyOpen} onSaved={changed} />
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone === "good" && "text-emerald-600 dark:text-emerald-400", tone === "warn" && "text-amber-600 dark:text-amber-400", tone === "bad" && "text-red-600 dark:text-red-400")}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
