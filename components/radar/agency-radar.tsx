"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Target, Radar as RadarIcon } from "lucide-react"
import type { RadarSnapshot } from "@/lib/radar/types"
import { ProjectRadar } from "@/components/radar/project-radar"
import { PacingBar, SeverityCounts, SEV_STYLE } from "@/components/radar/radar-ui"
import { cn } from "@/lib/utils"

// Vista de agencia: "¿a quién atiendo hoy?". Izquierda, clientes por
// urgencia (color, ritmo de gasto, miniaturas); derecha, su Radar completo.

export function AgencyRadar({ initial, initialSelected }: { initial: RadarSnapshot[]; initialSelected?: string | null }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(initial.find((s) => s.projectId === initialSelected)?.projectId ?? initial[0]?.projectId ?? null)
  const snap = initial.find((s) => s.projectId === selected) ?? null
  const totals = initial.reduce((t, s) => ({ crit: t.crit + s.counts.crit, warn: t.warn + s.counts.warn, good: t.good + s.counts.good, missing: t.missing + (s.cycle && !s.strategy ? 1 : 0) }), { crit: 0, warn: 0, good: 0, missing: 0 })

  return (
    <div className="space-y-5">
      <header className="flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2"><RadarIcon className="w-6 h-6 text-primary" />Radar Paid Media</h1>
          <p className="text-sm text-muted-foreground">Lo que se salió de la estrategia de cada cliente, con el dato que lo disparó. Revisado con cada sincronización de Meta (3 veces al día).</p>
        </div>
        <div className="flex gap-2 text-xs flex-wrap">
          <Pill className={SEV_STYLE.crit.chip} n={totals.crit} label={totals.crit === 1 ? "urgente" : "urgentes"} />
          <Pill className={SEV_STYLE.warn.chip} n={totals.warn} label="atención" />
          <Pill className={SEV_STYLE.good.chip} n={totals.good} label={totals.good === 1 ? "oportunidad" : "oportunidades"} />
          {totals.missing > 0 && <Pill className="bg-primary/10 text-primary" n={totals.missing} label="sin estrategia" />}
        </div>
      </header>

      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No hay proyectos de paid media con ciclo activo{""} visibles para ti.</div>
      ) : (
        <div className="grid lg:grid-cols-[340px_1fr] gap-5 items-start">
          <nav className="space-y-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto pr-1">
            {initial.map((s) => {
              const top = s.recs[0]
              const missing = s.cycle && !s.strategy
              const sev = top ? SEV_STYLE[top.severity] : SEV_STYLE.good
              return (
                <button key={s.projectId} onClick={() => setSelected(s.projectId)}
                  className={cn("w-full text-left rounded-xl border bg-card overflow-hidden relative transition-shadow", selected === s.projectId ? "border-primary ring-2 ring-primary/20 shadow-sm" : "border-border hover:border-foreground/25")}>
                  <span className={cn("absolute inset-y-0 left-0 w-1", missing ? "bg-primary" : sev.stripe)} />
                  <div className="pl-4 pr-3 py-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{s.projectName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{s.clientName ?? ""}{s.cycle ? `${s.clientName ? " · " : ""}día ${s.cycle.day}/${s.cycle.days}` : ""}</p>
                      </div>
                      {missing ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary inline-flex items-center gap-1"><Target className="w-3 h-3" />Sin estrategia</span> : <SeverityCounts counts={s.counts} size="sm" />}
                    </div>
                    {s.pacing && s.cycle && <PacingBar pacing={s.pacing} currency={s.currency} day={s.cycle.day} days={s.cycle.days} compact />}
                    {top && !missing && <p className={cn("text-xs leading-snug line-clamp-2", sev.text)}>{top.title}</p>}
                  </div>
                </button>
              )
            })}
          </nav>

          <section className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5 min-w-0">
            {snap ? (
              <>
                <ProjectRadar key={snap.projectId} projectId={snap.projectId} initial={snap} onChanged={() => router.refresh()} projectHref={`/projects/${snap.projectId}#radar`} />
              </>
            ) : <p className="text-sm text-muted-foreground">Elige un cliente.</p>}
          </section>
        </div>
      )}
    </div>
  )
}

function Pill({ className, n, label }: { className: string; n: number; label: string }) {
  return <span className={cn("rounded-full px-2.5 py-1 font-semibold tabular-nums", className, !n && "opacity-50")}>{n} {label}</span>
}
