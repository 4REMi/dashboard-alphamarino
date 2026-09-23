"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { PaidMediaCycle, PaidMediaContext, CycleDeliverableStatus } from "@/lib/types"
import { CAMPAIGN_STATUS_LABELS, DELIVERABLE_STATUS_LABELS } from "@/lib/types"
import { openNewCycle, updateCycle, closeCycle, suggestNextCycleStartDate, updateCycleStartDay, updateCycleDates, updateProjectAutoCloseCycles } from "@/lib/actions/projects"
import type { AdPerformanceCard } from "@/lib/actions/paid-media-performance"
import type { MetricKey } from "@/lib/constants/paid-media-metrics"
import { formatCycleRange } from "@/lib/utils"
import { CreativePerformanceGrid } from "./creative-performance-grid"

interface Props {
  projectId: string
  activeCycle: PaidMediaCycle | null
  context: PaidMediaContext | null
  canEdit: boolean
  // Separate from canEdit — a real per-person permission override
  // (edit_cycle_dates), not hardcoded to admin/subadmin like the rest of
  // this card.
  canEditDates: boolean
  isAdminOrSubadmin: boolean
  autoCloseCycles: boolean
  initialCards?: AdPerformanceCard[]
  hasMetaConnected?: boolean
  cycleStartDay?: number | null
}

function addOneMonthMinusOneDay(startDate: string): string {
  if (!startDate) return ""
  const d = new Date(startDate + "T00:00:00")
  d.setMonth(d.getMonth() + 1)
  d.setDate(d.getDate() - 1)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const STATUS_PILL: Record<CycleDeliverableStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
}

function CycleStartDaySetting({ projectId, value, canEdit }: { projectId: string; value: number | null | undefined; canEdit: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [day, setDay] = useState(value ? String(value) : "")
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const parsed = day ? Number(day) : null
    startTransition(async () => {
      await updateCycleStartDay(projectId, parsed)
      setEditing(false)
      router.refresh()
    })
  }

  if (!canEdit && !value) return null

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-5 py-2 border-b border-border bg-muted/20">
      <span>Día fijo de ciclo:</span>
      {editing ? (
        <>
          <input
            type="number" min="1" max="31" value={day}
            onChange={(e) => setDay(e.target.value)}
            placeholder="ej. 27"
            className="w-16 rounded border border-input bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button onClick={handleSave} disabled={isPending} className="text-primary hover:underline disabled:opacity-50">
            {isPending ? "Guardando…" : "Guardar"}
          </button>
          <button onClick={() => { setEditing(false); setDay(value ? String(value) : "") }} className="hover:text-foreground">
            Cancelar
          </button>
        </>
      ) : (
        <>
          <span className="font-medium text-foreground">{value ?? "sin definir"}</span>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="text-primary hover:underline">
              Editar
            </button>
          )}
        </>
      )}
    </div>
  )
}

function CycleDatesEditor({ startDate, endDate, isPending, onSave, onCancel }: {
  startDate: string
  endDate: string
  isPending: boolean
  onSave: (startDate: string, endDate: string) => void
  onCancel: () => void
}) {
  const [start, setStart] = useState(startDate)
  const [end, setEnd] = useState(endDate)

  return (
    <div className="px-5 py-3 border-b border-border bg-amber-50/50 dark:bg-amber-950/20">
      <p className="text-xs text-muted-foreground mb-2">
        Corrige las fechas si se abrió el ciclo con un error — no afecta los conceptos/creativos ya ligados a él.
      </p>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha inicio</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha fin</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button
          onClick={() => onSave(start, end)}
          disabled={isPending || !start || !end}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        <button onClick={onCancel} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
      </div>
    </div>
  )
}

function AutoCloseCyclesSetting({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      await updateProjectAutoCloseCycles(projectId, !enabled)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-5 py-2 border-b border-border bg-muted/20">
      <span>Auto-cerrar ciclos vencidos en este proyecto:</span>
      <button
        onClick={toggle}
        disabled={isPending}
        className={`font-medium disabled:opacity-50 ${enabled ? "text-primary" : "hover:text-foreground"}`}
        title="Sin esto activado, un ciclo vencido solo avisa por Telegram — nunca se cierra solo"
      >
        {enabled ? "Activado — click para desactivar" : "Desactivado — click para activar"}
      </button>
    </div>
  )
}

export function PaidMediaCycleCard({ projectId, activeCycle, context, canEdit, canEditDates, isAdminOrSubadmin, autoCloseCycles, initialCards = [], hasMetaConnected = false, cycleStartDay = null }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [editingDates, setEditingDates] = useState(false)
  const [showOpenForm, setShowOpenForm] = useState(false)

  const [newStartDate, setNewStartDate] = useState("")
  const [newEndDate, setNewEndDate] = useState("")

  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!showOpenForm) return
    suggestNextCycleStartDate(projectId).then((suggested) => {
      setNewStartDate(suggested)
      setNewEndDate(addOneMonthMinusOneDay(suggested))
    })
  }, [showOpenForm, projectId])

  function handleStartDateChange(value: string) {
    setNewStartDate(value)
    setNewEndDate(addOneMonthMinusOneDay(value))
  }

  function handleOpenCycle() {
    if (!newStartDate || !newEndDate) return
    startTransition(async () => {
      await openNewCycle(projectId, newStartDate, newEndDate)
      setShowOpenForm(false)
      router.refresh()
    })
  }

  function handleUpdateCycle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeCycle) return
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateCycle(activeCycle.id, projectId, fd)
      setEditing(false)
    })
  }

  function handleSaveDates(startDate: string, endDate: string) {
    if (!activeCycle) return
    startTransition(async () => {
      try {
        await updateCycleDates(activeCycle.id, projectId, startDate, endDate)
        setEditingDates(false)
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : "No se pudieron guardar las fechas")
      }
    })
  }

  function handleClose() {
    if (!activeCycle || !confirm("¿Cerrar este ciclo? Ya no se podrán editar sus métricas.")) return
    startTransition(async () => {
      await closeCycle(activeCycle.id, projectId)
      router.refresh()
    })
  }

  // No active cycle
  if (!activeCycle) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card">
        <CycleStartDaySetting projectId={projectId} value={cycleStartDay} canEdit={canEdit} />
        <div className="flex items-center justify-between p-5 pb-3">
          <h3 className="font-semibold text-sm text-foreground">Ciclo Activo</h3>
          {canEdit && (
            <button onClick={() => setShowOpenForm(true)} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors">
              Abrir ciclo
            </button>
          )}
        </div>
        <div className="px-5 pb-5">
          {showOpenForm ? (
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha inicio</label>
                <input type="date" value={newStartDate} onChange={(e) => handleStartDateChange(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha fin</label>
                <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <button onClick={handleOpenCycle} disabled={isPending || !newStartDate || !newEndDate} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">Abrir</button>
              <button onClick={() => setShowOpenForm(false)} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin ciclo activo. Abre uno cuando el cliente realice el pago del mes.</p>
          )}
        </div>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = activeCycle.end_date < today

  return (
    <div className="rounded-xl border border-border bg-card">
      <CycleStartDaySetting projectId={projectId} value={cycleStartDay} canEdit={canEdit} />
      {isAdminOrSubadmin && (
        <AutoCloseCyclesSetting projectId={projectId} enabled={autoCloseCycles} />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground">Ciclo Activo — {formatCycleRange(activeCycle.start_date, activeCycle.end_date)}</h3>
            {isOverdue && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Vencido
              </span>
            )}
            {canEditDates && (
              <button onClick={() => setEditingDates((v) => !v)} className="text-[11px] text-primary hover:underline">
                {editingDates ? "Cancelar" : "Corregir fechas"}
              </button>
            )}
          </div>
          {activeCycle.campaign_status && (
            <span className="text-xs text-muted-foreground">{CAMPAIGN_STATUS_LABELS[activeCycle.campaign_status]}</span>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setEditing(!editing)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {editing ? "Cancelar" : "Editar"}
            </button>
            <button onClick={handleClose} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
              Cerrar ciclo
            </button>
          </div>
        )}
      </div>

      {editingDates && (
        <CycleDatesEditor
          startDate={activeCycle.start_date}
          endDate={activeCycle.end_date}
          isPending={isPending}
          onSave={handleSaveDates}
          onCancel={() => setEditingDates(false)}
        />
      )}

      {editing ? (
        <form onSubmit={handleUpdateCycle} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Estado campañas</label>
              <select name="campaign_status" defaultValue={activeCycle.campaign_status ?? "none"}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="none">Sin estado</option>
                {Object.entries(CAMPAIGN_STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "report_status", label: "Estado del reporte", val: activeCycle.report_status },
              { name: "creative_status", label: "Estado producción creativa", val: activeCycle.creative_status },
            ].map(({ name, label, val }) => (
              <div key={name}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                <select name={name} defaultValue={val}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {Object.entries(DELIVERABLE_STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha de corte</label>
              <input name="report_cutoff_date" type="date" defaultValue={activeCycle.report_cutoff_date ?? ""}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha entrega reporte</label>
              <input name="report_delivery_date" type="date" defaultValue={activeCycle.report_delivery_date ?? ""}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="submit" disabled={isPending} className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      ) : (
        <div className="p-5 space-y-4">
          {/* Deliverables */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Reporte del mes", status: activeCycle.report_status },
              { label: "Producción creativa", status: activeCycle.creative_status },
            ].map(({ label, status }) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <span className="text-sm text-foreground">{label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[status]}`}>
                  {DELIVERABLE_STATUS_LABELS[status]}
                </span>
              </div>
            ))}
          </div>

          {/* Dates */}
          {(activeCycle.report_cutoff_date || activeCycle.report_delivery_date) && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              {activeCycle.report_cutoff_date && <span>Corte: {activeCycle.report_cutoff_date}</span>}
              {activeCycle.report_delivery_date && <span>Entrega reporte: {activeCycle.report_delivery_date}</span>}
            </div>
          )}
        </div>
      )}

      {/* Grid creative-first — reemplaza la tabla de campañas de Meta */}
      {!editing && (
        <div className="border-t border-border">
          <CreativePerformanceGrid
            projectId={projectId}
            cycleId={activeCycle.id}
            initialCards={initialCards}
            displayMetrics={(context?.display_metrics ?? ["spend", "cost_per_result"]) as MetricKey[]}
            savedCampaignIds={context?.synced_campaign_ids ?? null}
            hasCredentials={hasMetaConnected}
            canEdit={canEdit}
          />
        </div>
      )}
    </div>
  )
}
