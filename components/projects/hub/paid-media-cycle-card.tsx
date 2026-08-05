"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { PaidMediaCycle, PaidMediaContext, CycleDeliverableStatus, MetaCampaign } from "@/lib/types"
import { CAMPAIGN_STATUS_LABELS, DELIVERABLE_STATUS_LABELS } from "@/lib/types"
import { openNewCycle, updateCycle, closeCycle, suggestNextCycleStartDate, updateCycleStartDay } from "@/lib/actions/projects"
import { formatCycleRange } from "@/lib/utils"
import { MetaCampaignsPanel } from "./meta-campaigns-panel"

interface Props {
  projectId: string
  activeCycle: PaidMediaCycle | null
  context: PaidMediaContext | null
  canEdit: boolean
  initialCampaigns?: MetaCampaign[]
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

function KpiCompare({ label, real, target, format }: { label: string; real: number | null; target: number | null; format: (v: number) => string }) {
  if (real === null) return <KpiEmpty label={label} />
  const good = target === null ? null : real >= target
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${good === null ? "" : good ? "text-green-500" : "text-destructive"}`}>
        {format(real)}
        {good !== null && <span className="ml-1 text-xs">{good ? "▲" : "▼"}</span>}
      </p>
      {target !== null && (
        <p className="text-xs text-muted-foreground">Obj: {format(target)}</p>
      )}
    </div>
  )
}

function KpiEmpty({ label }: { label: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-bold text-muted-foreground/50">—</p>
    </div>
  )
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

export function PaidMediaCycleCard({ projectId, activeCycle, context, canEdit, initialCampaigns = [], hasMetaConnected = false, cycleStartDay = null }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
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

  return (
    <div className="rounded-xl border border-border bg-card">
      <CycleStartDaySetting projectId={projectId} value={cycleStartDay} canEdit={canEdit} />
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Ciclo Activo — {formatCycleRange(activeCycle.start_date, activeCycle.end_date)}</h3>
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
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Inversión real ($)</label>
              <input name="real_spend" type="number" step="any" defaultValue={activeCycle.real_spend ?? ""}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: "roas_real", label: "ROAS real" },
              { name: "cpa_real", label: "CPA real ($)" },
              { name: "cpl_real", label: "CPL real ($)" },
            ].map(({ name, label }) => (
              <div key={name}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                <input name={name} type="number" step="any"
                  defaultValue={(activeCycle as unknown as Record<string, number | null>)[name] ?? ""}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {context?.main_objective === "leads" ? "Leads generados" : "Ventas / Resultados"}
            </label>
            <input name="real_results" type="number" step="any" defaultValue={activeCycle.real_results ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
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
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCompare label="Inversión" real={activeCycle.real_spend} target={context?.monthly_ad_budget ?? null}
              format={(v) => `$${v.toLocaleString()}`} />
            <KpiCompare label="ROAS" real={activeCycle.roas_real} target={context?.target_roas ?? null}
              format={(v) => `${v}x`} />
            <KpiCompare label="CPA" real={activeCycle.cpa_real} target={context?.target_cpa ?? null}
              format={(v) => `$${v}`} />
            {context?.main_objective === "leads" ? (
              <KpiCompare label="Leads" real={activeCycle.real_results} target={context?.target_leads_per_month ?? null}
                format={(v) => v.toString()} />
            ) : (
              <KpiCompare label="CPL" real={activeCycle.cpl_real} target={context?.target_cpl ?? null}
                format={(v) => `$${v}`} />
            )}
          </div>

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

      {/* Meta campaigns breakdown — shown when cycle is active (not in edit mode) */}
      {!editing && (
        <div className="border-t border-border">
          <MetaCampaignsPanel
            projectId={projectId}
            cycleId={activeCycle.id}
            campaigns={initialCampaigns}
            hasCredentials={hasMetaConnected}
            canEdit={canEdit}
          />
        </div>
      )}
    </div>
  )
}
