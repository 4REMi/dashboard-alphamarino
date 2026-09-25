"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { PaidMediaCycle } from "@/lib/types"
import { updateCycleManualMetrics } from "@/lib/actions/projects"
import { formatCycleRange, cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"
import { CycleReviewModal } from "./cycle-review-modal"

interface Props {
  projectId: string
  cycles: PaidMediaCycle[]
  canEdit: boolean
}

// Un color por ciclo (en orden cronológico) para distinguirlos en el
// calendario y en la lista de abajo.
const CYCLE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"]
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"]

const pad = (n: number) => String(n).padStart(2, "0")
const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function durationDays(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number)
  const [ye, me, de] = end.split("-").map(Number)
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86_400_000) + 1
}

function fmtMoney(v: number | null) {
  return v === null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

export function PaidMediaCycleHistory({ projectId, cycles, canEdit }: Props) {
  const today = new Date()
  const todayIso = isoDate(today.getFullYear(), today.getMonth(), today.getDate())

  const ordered = useMemo(() => [...cycles].sort((a, b) => (a.start_date < b.start_date ? -1 : 1)), [cycles])
  const colorById = useMemo(
    () => new Map(ordered.map((c, i) => [c.id, CYCLE_COLORS[i % CYCLE_COLORS.length]])),
    [ordered],
  )

  // 12 meses terminando en el mes actual, o en el mes en que termina el
  // ciclo más tardío si va más allá (ej. un ciclo activo que acaba el mes
  // que entra).
  const months = useMemo(() => {
    const latestEnd = ordered.reduce((max, c) => (c.end_date > max ? c.end_date : max), todayIso)
    const [ly, lm] = latestEnd.split("-").map(Number)
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(ly, lm - 1 - (11 - i), 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }, [ordered, todayIso])

  // Si dos ciclos se traslapan un día, gana el que empezó después.
  const cycleForDay = (iso: string) => {
    let hit: PaidMediaCycle | null = null
    for (const c of ordered) if (c.start_date <= iso && iso <= c.end_date) hit = c
    return hit
  }

  if (cycles.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">Historial de Ciclos</h3>
        <p className="text-xs text-muted-foreground">Últimos 12 meses. Pasa el cursor sobre un día para ver su ciclo.</p>
      </div>

      <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-5 gap-y-4">
        {months.map(({ year, month }) => {
          const daysInMonth = new Date(year, month + 1, 0).getDate()
          const leading = (new Date(year, month, 1).getDay() + 6) % 7 // lunes primero
          const label = new Date(year, month, 1).toLocaleDateString("es-MX", { month: "short", year: "numeric" })
          return (
            <div key={`${year}-${month}`}>
              <p className="text-[11px] font-semibold text-foreground capitalize mb-1.5">{label}</p>
              <div className="grid grid-cols-7 gap-[3px] w-fit">
                {WEEKDAYS.map((w, i) => (
                  <span key={i} className="w-3.5 text-center text-[8px] text-muted-foreground/70">{w}</span>
                ))}
                {Array.from({ length: leading }, (_, i) => <span key={`pad-${i}`} className="w-3.5 h-3.5" />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const iso = isoDate(year, month, i + 1)
                  const cycle = cycleForDay(iso)
                  const color = cycle ? colorById.get(cycle.id) : undefined
                  return (
                    <span
                      key={iso}
                      title={cycle
                        ? `${formatCycleRange(cycle.start_date, cycle.end_date)} · ${durationDays(cycle.start_date, cycle.end_date)} días${cycle.is_active ? " · activo" : ""}`
                        : undefined}
                      className={cn(
                        "w-3.5 h-3.5 rounded-[3px]",
                        !cycle && "bg-muted",
                        iso === todayIso && "ring-1 ring-offset-1 ring-foreground/60",
                      )}
                      style={color ? { backgroundColor: color, opacity: cycle?.is_active ? 1 : 0.75 } : undefined}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-border divide-y divide-border">
        {[...ordered].reverse().map((cycle) => (
          <CycleRow key={cycle.id} cycle={cycle} color={colorById.get(cycle.id)!} projectId={projectId} canEdit={canEdit} />
        ))}
      </div>
    </div>
  )
}

function CycleRow({ cycle, color, projectId, canEdit }: { cycle: PaidMediaCycle; color: string; projectId: string; canEdit: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  // Solo el ciclo activo abierto por default — los pasados se consultan
  // de vez en cuando, no hace falta que ocupen espacio.
  const [open, setOpen] = useState(cycle.is_active)
  const [reviewMode, setReviewMode] = useState<"pending" | "edit" | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const num = (k: string) => {
      const raw = (fd.get(k) as string)?.trim()
      return raw ? Number(raw) : null
    }
    startTransition(async () => {
      await updateCycleManualMetrics(cycle.id, projectId, {
        real_spend: num("real_spend"),
        roas_real: num("roas_real"),
        cpa_real: num("cpa_real"),
        real_results: num("real_results"),
      })
      setEditing(false)
      router.refresh()
    })
  }

  const fields = [
    { key: "real_spend", label: "Inversión", value: cycle.real_spend, display: fmtMoney(cycle.real_spend) },
    { key: "roas_real", label: "ROAS", value: cycle.roas_real, display: cycle.roas_real === null ? "—" : `${cycle.roas_real}x` },
    { key: "cpa_real", label: "CPA", value: cycle.cpa_real, display: fmtMoney(cycle.cpa_real) },
    { key: "real_results", label: "Resultados", value: cycle.real_results, display: cycle.real_results?.toLocaleString("en-US") ?? "—" },
  ]

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-3 text-left"
        >
          <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="w-3 h-3 rounded-[3px] flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium text-foreground">{formatCycleRange(cycle.start_date, cycle.end_date)}</span>
        <span className="text-xs text-muted-foreground">{durationDays(cycle.start_date, cycle.end_date)} días</span>
        </button>
        {cycle.is_active && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Activo</span>
        )}
        {!cycle.is_active && cycle.review_pending && !cycle.next_cycle_id && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Repaso pendiente</span>
        )}
        {canEdit && !cycle.is_active && (cycle.review_pending || cycle.next_cycle_id) && (
          <button onClick={() => setReviewMode(cycle.next_cycle_id ? "edit" : "pending")} className="text-xs text-primary hover:underline">
            {cycle.next_cycle_id ? "Corregir lo que pasó al siguiente ciclo" : "Hacer repaso"}
          </button>
        )}
        {reviewMode && <CycleReviewModal projectId={projectId} cycleId={cycle.id} mode={reviewMode} onClose={() => setReviewMode(null)} />}
        {canEdit && !editing && open && (
          <button onClick={() => setEditing(true)} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
            Editar resumen
          </button>
        )}
      </div>

      {!open ? null : editing ? (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">Totales de todos los canales del ciclo (Meta, Google, TikTok…), capturados a mano.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {fields.map((f) => (
              <label key={f.key} className="text-xs">
                <span className="text-muted-foreground">{f.label}</span>
                <input
                  name={f.key}
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={f.value ?? ""}
                  className="mt-0.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
            <button type="submit" disabled={isPending} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {fields.map((f) => (
            <div key={f.key} className="bg-muted/30 rounded-lg px-2.5 py-1.5">
              <p className="text-muted-foreground">{f.label}</p>
              <p className="font-semibold text-foreground">{f.display}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
