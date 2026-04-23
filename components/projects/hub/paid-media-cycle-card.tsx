"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { PaidMediaCycle, PaidMediaContext, CycleDeliverableStatus, MetaCampaign } from "@/lib/types"
import { CAMPAIGN_STATUS_LABELS, DELIVERABLE_STATUS_LABELS } from "@/lib/types"
import { openNewCycle, updateCycle, closeCycle } from "@/lib/actions/projects"
import { MetaCampaignsPanel } from "./meta-campaigns-panel"

interface Props {
  projectId: string
  activeCycle: PaidMediaCycle | null
  context: PaidMediaContext | null
  canEdit: boolean
  initialCampaigns?: MetaCampaign[]
  hasMetaConnected?: boolean
}

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

function formatCycleMonth(iso: string) {
  const d = new Date(iso + "T00:00:00")
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`
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

export function PaidMediaCycleCard({ projectId, activeCycle, context, canEdit, initialCampaigns = [], hasMetaConnected = false }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [showOpenForm, setShowOpenForm] = useState(false)

  const today = new Date()
  const [newCycleYear, setNewCycleYear] = useState(String(today.getFullYear()))
  const [newCycleMonthNum, setNewCycleMonthNum] = useState(String(today.getMonth() + 1).padStart(2, "0"))

  const [isPending, startTransition] = useTransition()

  const MONTHS_LABEL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
  const years = Array.from({ length: 5 }, (_, i) => String(today.getFullYear() - 1 + i))

  function handleOpenCycle() {
    startTransition(async () => {
      await openNewCycle(projectId, `${newCycleYear}-${newCycleMonthNum}`)
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
      <div className="rounded-xl border border-dashed border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Ciclo Activo</h3>
          {canEdit && (
            <button onClick={() => setShowOpenForm(true)} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors">
              Abrir ciclo
            </button>
          )}
        </div>
        {showOpenForm ? (
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mes</label>
              <select value={newCycleMonthNum} onChange={(e) => setNewCycleMonthNum(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {MONTHS_LABEL.map((name, i) => (
                  <option key={i} value={String(i + 1).padStart(2, "0")}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Año</label>
              <select value={newCycleYear} onChange={(e) => setNewCycleYear(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={handleOpenCycle} disabled={isPending} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">Abrir</button>
            <button onClick={() => setShowOpenForm(false)} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin ciclo activo. Abre uno cuando el cliente realice el pago del mes.</p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Ciclo Activo — {formatCycleMonth(activeCycle.cycle_month)}</h3>
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
