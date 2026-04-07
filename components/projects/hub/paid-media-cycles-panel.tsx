"use client"

import { useState, useTransition } from "react"
import type { PaidMediaCycle, PaidMediaCycleDeliverable } from "@/lib/types"
import {
  createPaidMediaCycle,
  updatePaidMediaCycle,
  toggleCycleDeliverable,
  addCycleDeliverable,
} from "@/lib/actions/projects"

interface Props {
  projectId: string
  initialCycles: PaidMediaCycle[]
  isAdmin: boolean
}

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function formatCycleMonth(iso: string) {
  const d = new Date(iso + "T00:00:00")
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`
}

export function PaidMediaCyclesPanel({ projectId, initialCycles, isAdmin }: Props) {
  const [cycles, setCycles] = useState<PaidMediaCycle[]>(initialCycles)
  const [activeCycleId, setActiveCycleId] = useState<string | null>(cycles[0]?.id ?? null)
  const [isPending, startTransition] = useTransition()
  const [showNewCycle, setShowNewCycle] = useState(false)
  const [newCycleMonth, setNewCycleMonth] = useState("")
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null)
  const [newDeliverableTitle, setNewDeliverableTitle] = useState("")
  const [addingDeliverableFor, setAddingDeliverableFor] = useState<string | null>(null)

  const activeCycle = cycles.find((c) => c.id === activeCycleId) ?? null

  function handleCreateCycle() {
    if (!newCycleMonth) return
    startTransition(async () => {
      const created = await createPaidMediaCycle(projectId, newCycleMonth + "-01")
      const fullCycle: PaidMediaCycle = { ...created, deliverables: [] }
      setCycles((prev) => [fullCycle, ...prev])
      setActiveCycleId(fullCycle.id)
      setShowNewCycle(false)
      setNewCycleMonth("")
    })
  }

  function handleUpdateCycle(e: React.FormEvent<HTMLFormElement>, cycleId: string) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updatePaidMediaCycle(cycleId, projectId, fd)
      setEditingCycleId(null)
    })
  }

  function handleToggleDeliverable(deliverable: PaidMediaCycleDeliverable) {
    const newDone = !deliverable.done
    setCycles((prev) =>
      prev.map((c) =>
        c.id === activeCycleId
          ? {
              ...c,
              deliverables: c.deliverables?.map((d) =>
                d.id === deliverable.id ? { ...d, done: newDone } : d
              ),
            }
          : c
      )
    )
    startTransition(async () => {
      await toggleCycleDeliverable(deliverable.id, newDone, projectId)
    })
  }

  function handleAddDeliverable(cycleId: string) {
    if (!newDeliverableTitle.trim()) return
    startTransition(async () => {
      await addCycleDeliverable(cycleId, projectId, newDeliverableTitle.trim())
      setCycles((prev) =>
        prev.map((c) =>
          c.id === cycleId
            ? {
                ...c,
                deliverables: [
                  ...(c.deliverables ?? []),
                  {
                    id: crypto.randomUUID(),
                    cycle_id: cycleId,
                    title: newDeliverableTitle.trim(),
                    done: false,
                    due_date: null,
                    created_at: new Date().toISOString(),
                  },
                ],
              }
            : c
        )
      )
      setNewDeliverableTitle("")
      setAddingDeliverableFor(null)
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">Ciclos Mensuales</h3>
        {isAdmin && (
          <button
            onClick={() => setShowNewCycle(true)}
            className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
          >
            + Nuevo Ciclo
          </button>
        )}
      </div>

      {/* New cycle form */}
      {showNewCycle && (
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Mes</label>
            <input
              type="month"
              value={newCycleMonth}
              onChange={(e) => setNewCycleMonth(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={handleCreateCycle}
            disabled={isPending || !newCycleMonth}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Crear
          </button>
          <button
            onClick={() => setShowNewCycle(false)}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="flex">
        {/* Cycle tabs (left) */}
        <div className="w-44 border-r border-border flex-shrink-0">
          {cycles.length === 0 && (
            <p className="text-xs text-muted-foreground p-4">Sin ciclos aún</p>
          )}
          {cycles.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCycleId(c.id)}
              className={`w-full text-left px-4 py-3 text-sm border-b border-border transition-colors ${
                c.id === activeCycleId
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {formatCycleMonth(c.cycle_month)}
              {c.status === "closed" && (
                <span className="ml-1 text-xs opacity-60">(cerrado)</span>
              )}
            </button>
          ))}
        </div>

        {/* Cycle detail (right) */}
        <div className="flex-1 p-5 space-y-4">
          {!activeCycle ? (
            <p className="text-sm text-muted-foreground">Selecciona un ciclo</p>
          ) : editingCycleId === activeCycle.id ? (
            <form onSubmit={(e) => handleUpdateCycle(e, activeCycle.id)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: "budget_spent", label: "Gasto Real ($)", val: activeCycle.budget_spent },
                  { name: "impressions", label: "Impresiones", val: activeCycle.impressions },
                  { name: "clicks", label: "Clicks", val: activeCycle.clicks },
                  { name: "conversions", label: "Conversiones", val: activeCycle.conversions },
                  { name: "cpa", label: "CPA Real ($)", val: activeCycle.cpa },
                  { name: "roas", label: "ROAS Real (x)", val: activeCycle.roas },
                ].map(({ name, label, val }) => (
                  <div key={name}>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                    <input
                      name={name}
                      type="number"
                      step="any"
                      defaultValue={val ?? ""}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notas</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={activeCycle.notes ?? ""}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Estado</label>
                <select
                  name="status"
                  defaultValue={activeCycle.status}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="active">Activo</option>
                  <option value="closed">Cerrado</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingCycleId(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                <button type="submit" disabled={isPending} className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {isPending ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <h4 className="font-semibold text-foreground">{formatCycleMonth(activeCycle.cycle_month)}</h4>
                {isAdmin && (
                  <button onClick={() => setEditingCycleId(activeCycle.id)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Editar KPIs</button>
                )}
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-3 gap-3">
                <KpiStat label="Gasto" value={activeCycle.budget_spent ? `$${activeCycle.budget_spent.toLocaleString()}` : "—"} />
                <KpiStat label="Impresiones" value={activeCycle.impressions?.toLocaleString() ?? "—"} />
                <KpiStat label="Clicks" value={activeCycle.clicks?.toLocaleString() ?? "—"} />
                <KpiStat label="Conversiones" value={activeCycle.conversions?.toLocaleString() ?? "—"} />
                <KpiStat label="CPA Real" value={activeCycle.cpa ? `$${activeCycle.cpa}` : "—"} />
                <KpiStat label="ROAS Real" value={activeCycle.roas ? `${activeCycle.roas}x` : "—"} />
              </div>

              {activeCycle.notes && (
                <p className="text-sm text-muted-foreground">{activeCycle.notes}</p>
              )}

              {/* Deliverables */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entregables</p>
                  <button
                    onClick={() => setAddingDeliverableFor(activeCycle.id)}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    + Agregar
                  </button>
                </div>
                <div className="space-y-1.5">
                  {activeCycle.deliverables?.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={d.done}
                        onChange={() => handleToggleDeliverable(d)}
                        className="w-4 h-4 rounded border-border accent-primary"
                      />
                      <span className={`text-sm flex-1 ${d.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {d.title}
                      </span>
                      {d.due_date && (
                        <span className="text-xs text-muted-foreground">{d.due_date}</span>
                      )}
                    </label>
                  ))}
                  {addingDeliverableFor === activeCycle.id && (
                    <div className="flex gap-2 pt-1">
                      <input
                        autoFocus
                        value={newDeliverableTitle}
                        onChange={(e) => setNewDeliverableTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDeliverable(activeCycle.id) } if (e.key === "Escape") setAddingDeliverableFor(null) }}
                        placeholder="Nombre del entregable"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button onClick={() => handleAddDeliverable(activeCycle.id)} disabled={isPending} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50 transition-colors">
                        OK
                      </button>
                    </div>
                  )}
                  {!activeCycle.deliverables?.length && addingDeliverableFor !== activeCycle.id && (
                    <p className="text-xs text-muted-foreground">Sin entregables</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}
