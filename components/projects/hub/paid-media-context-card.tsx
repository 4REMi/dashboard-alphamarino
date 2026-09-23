"use client"

import { useState, useTransition } from "react"
import type { PaidMediaContext, MainObjective, TrendWindow } from "@/lib/types"
import { PAID_MEDIA_PLATFORMS, MAIN_OBJECTIVES } from "@/lib/types"
import { METRIC_DEFS, type MetricKey } from "@/lib/constants/paid-media-metrics"
import { upsertPaidMediaContext } from "@/lib/actions/projects"
import { AutoTextarea } from "@/components/ui/auto-textarea"

interface Props {
  projectId: string
  context: PaidMediaContext | null
  canEdit: boolean
}

const TREND_WINDOW_LABELS: Record<TrendWindow, string> = {
  previous_day: "vs. día anterior",
  cycle_avg: "vs. promedio del ciclo",
  baseline: "vs. primer día del ciclo",
}

// Reconstruido desde cero — la versión anterior comparaba un "real"
// tecleado a mano (real_spend/roas_real/cpa_real/cpl_real) contra un
// target que tampoco se llenaba. Esta versión es puramente informativa
// (objetivo + plataformas + notas) más las preferencias de qué métricas
// y qué ventana de tendencia mostrar en el grid creative-first de abajo
// — la vigilancia real de threshold es terreno del agente, no de un
// formulario aparte.
export function PaidMediaContextCard({ projectId, context, canEdit }: Props) {
  const [editing, setEditing] = useState(!context)
  const [isPending, startTransition] = useTransition()
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(context?.platforms ?? [])
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(context?.display_metrics ?? ["spend", "cost_per_result"])

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }

  function toggleMetric(key: string) {
    setSelectedMetrics((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key])
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    selectedPlatforms.forEach((p) => fd.append("platforms", p))
    fd.delete("display_metrics")
    selectedMetrics.forEach((m) => fd.append("display_metrics", m))
    startTransition(async () => {
      await upsertPaidMediaContext(projectId, fd)
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Contexto de Cuenta</h3>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Editar
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {context?.platforms.map((p) => (
            <span key={p} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{p}</span>
          ))}
          {!context?.platforms.length && <span className="text-xs text-muted-foreground">Sin plataformas</span>}
        </div>

        {context?.main_objective && (
          <div>
            <p className="text-xs text-muted-foreground">Objetivo</p>
            <p className="text-sm font-medium text-foreground">{MAIN_OBJECTIVES[context.main_objective as MainObjective]}</p>
          </div>
        )}

        <div className="border-t border-border pt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Métricas del grid:</span>
          {(context?.display_metrics ?? []).map((m) => (
            <span key={m} className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-foreground">
              {METRIC_DEFS[m as MetricKey]?.label ?? m}
            </span>
          ))}
          <span className="text-xs text-muted-foreground ml-2">
            {TREND_WINDOW_LABELS[context?.trend_window ?? "previous_day"]}
          </span>
        </div>

        {context?.account_notes && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notas de cuenta</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{context.account_notes}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-sm text-foreground">Contexto de Cuenta</h3>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Plataformas activas</label>
        <div className="flex flex-wrap gap-2">
          {PAID_MEDIA_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedPlatforms.includes(p)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Objetivo principal</label>
        <select
          name="main_objective"
          defaultValue={context?.main_objective ?? "none"}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="none">Sin objetivo</option>
          {Object.entries(MAIN_OBJECTIVES).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      <div className="border-t border-border pt-3 space-y-2">
        <label className="text-xs font-medium text-muted-foreground block">
          Métricas a mostrar en el grid de creativos
        </label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(METRIC_DEFS) as MetricKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleMetric(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedMetrics.includes(key)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {METRIC_DEFS[key].label}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Ventana de tendencia (default — se puede ajustar por campaña desde el grid)
          </label>
          <select
            name="trend_window"
            defaultValue={context?.trend_window ?? "previous_day"}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {Object.entries(TREND_WINDOW_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Notas de cuenta <span className="text-muted-foreground/60">(briefing, buyer persona, restricciones, decisiones)</span>
        </label>
        <AutoTextarea
          name="account_notes"
          rows={4}
          defaultValue={context?.account_notes ?? ""}
          placeholder="El 'cerebro' de la cuenta…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="flex justify-end gap-2">
        {context && (
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={isPending} className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  )
}
