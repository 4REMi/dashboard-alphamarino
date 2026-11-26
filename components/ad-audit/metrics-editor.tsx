"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { COUNTER_KEYS, COUNTER_LABEL, METRICS, type Counters, type MetricDef } from "@/lib/ad-audit/metrics"
import { resetMetricOverride, saveMetricOverride } from "@/lib/actions/ad-audits"

// Pantalla «Métricas de auditoría»: cada métrica = numerador ÷ denominador
// (conteos que trae la extensión) + muestra mínima para juzgarla.
export function MetricsEditor({ defs, canEdit }: { defs: MetricDef[]; canEdit: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ num: keyof Counters; den: keyof Counters; minKey: keyof Counters; minValue: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const select = (value: string, onChange: (v: keyof Counters) => void, label: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}
      <select value={value} onChange={(e) => onChange(e.target.value as keyof Counters)}
        className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-foreground">
        {COUNTER_KEYS.map((k) => <option key={k} value={k}>{COUNTER_LABEL[k]}</option>)}
      </select>
    </label>
  )

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[1fr_2.4fr_0.8fr_1.4fr_0.9fr] gap-3 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Métrica</span><span>Fórmula</span><span>Vista</span><span>Muestra mínima</span><span></span>
          </div>
          {defs.map((d) => {
            const factory = METRICS.find((m) => m.id === d.id)!
            const changed = factory.num !== d.num || factory.den !== d.den || factory.min.key !== d.min.key || factory.min.value !== d.min.value
            const isEditing = editing === d.id && draft
            return (
              <div key={d.id} className="border-b border-border/60 px-4 py-3 last:border-0">
                <div className="grid grid-cols-[1fr_2.4fr_0.8fr_1.4fr_0.9fr] items-center gap-3 text-sm">
                  <span className="font-semibold">{d.label}{changed && <span className="ml-1.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">cambiada</span>}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-muted px-2 py-0.5">{COUNTER_LABEL[d.num]}</span>
                    <span className="text-muted-foreground">÷</span>
                    <span className="rounded-md bg-muted px-2 py-0.5">{COUNTER_LABEL[d.den]}</span>
                  </span>
                  <span className="text-muted-foreground">{d.view === "creative" ? "Creativo" : "Tienda"}</span>
                  <span className="text-muted-foreground">{d.min.label}</span>
                  <span className="flex justify-end gap-2">
                    {canEdit && !isEditing && (
                      <button onClick={() => { setEditing(d.id); setDraft({ num: d.num, den: d.den, minKey: d.min.key, minValue: d.min.value }); setError(null) }}
                        className="h-9 rounded-lg border border-border px-3 text-sm">Editar</button>
                    )}
                    {canEdit && changed && !isEditing && (
                      <button disabled={pending} onClick={() => start(async () => { await resetMetricOverride(d.id); router.refresh() })}
                        className="h-9 rounded-lg px-3 text-sm text-muted-foreground">Restaurar</button>
                    )}
                  </span>
                </div>
                {isEditing && (
                  <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-muted/50 p-3">
                    {select(draft.num, (v) => setDraft({ ...draft, num: v }), "Numerador")}
                    <span className="pb-2 text-muted-foreground">÷</span>
                    {select(draft.den, (v) => setDraft({ ...draft, den: v }), "Denominador")}
                    {select(draft.minKey, (v) => setDraft({ ...draft, minKey: v }), "Muestra mínima de")}
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">Cantidad
                      <input type="number" min={0} value={draft.minValue} onChange={(e) => setDraft({ ...draft, minValue: Number(e.target.value) })}
                        className="h-10 w-28 rounded-lg border border-border bg-background px-2 text-sm text-foreground" />
                    </label>
                    <button disabled={pending} onClick={() => start(async () => {
                      try {
                        await saveMetricOverride({ metricId: d.id, num: draft.num, den: draft.den, minKey: draft.minKey, minValue: draft.minValue })
                        setEditing(null); router.refresh()
                      } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar") }
                    })} className={cn("h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground", pending && "opacity-60")}>Guardar</button>
                    <button onClick={() => setEditing(null)} className="h-10 rounded-lg px-3 text-sm text-muted-foreground">Cancelar</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
