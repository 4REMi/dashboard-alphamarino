"use client"

import { useEffect, useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  getAvailableServiceOffers, getProjectServiceOffers, attachServiceOfferToProject,
  detachServiceOfferFromProject, getCurrentPeriodDeliverables, updateDeliverableFulfilled,
  updatePeriodExpectedQuantity,
} from "@/lib/actions/service-deliverables"
import type { ServiceOffer, ProjectServiceOffer, ProjectDeliverablePeriod } from "@/lib/types"
import { Plus, X, Check, Loader2, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  projectId: string
  // Admin/subadmin: attach/detach offers, edit a period's expected quantity.
  // canMark: admin/subadmin OR manage_tasks — mark units as fulfilled.
  canManage: boolean
  canMark: boolean
}

type OfferOption = Pick<ServiceOffer, "id" | "category" | "name" | "deliverables">

export function ServiceDeliverablesCard({ projectId, canManage, canMark }: Props) {
  const [attached, setAttached] = useState<ProjectServiceOffer[] | null>(null)
  const [periods, setPeriods] = useState<ProjectDeliverablePeriod[] | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [availableOffers, setAvailableOffers] = useState<OfferOption[]>([])
  const [isPending, startTransition] = useTransition()
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState("")

  function refresh() {
    startTransition(async () => {
      const [offers, current] = await Promise.all([
        getProjectServiceOffers(projectId),
        getCurrentPeriodDeliverables(projectId),
      ])
      setAttached(offers)
      setPeriods(current)
    })
  }

  useEffect(() => { refresh() }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  function openPicker() {
    getAvailableServiceOffers().then(setAvailableOffers)
    setShowPicker(true)
  }

  function handleAttach(offerId: string) {
    startTransition(async () => {
      await attachServiceOfferToProject(projectId, offerId)
      setShowPicker(false)
      refresh()
    })
  }

  function handleDetach(offerId: string) {
    if (!confirm("¿Quitar esta oferta del proyecto? El historial de periodos ya registrados se conserva.")) return
    startTransition(async () => {
      await detachServiceOfferFromProject(projectId, offerId)
      refresh()
    })
  }

  function toggleUnit(period: ProjectDeliverablePeriod, unitIndex: number) {
    // Clicking a checked unit un-checks it and everything after it; clicking
    // an unchecked one checks it and everything before it — keeps the
    // "fulfilled_quantity" integer honest as a simple running count.
    const next = unitIndex < period.fulfilled_quantity ? unitIndex : unitIndex + 1
    startTransition(async () => {
      await updateDeliverableFulfilled(period.id, next, projectId)
      refresh()
    })
  }

  function startEditExpected(period: ProjectDeliverablePeriod) {
    setEditingPeriodId(period.id)
    setEditingValue(String(period.expected_quantity))
  }

  function saveExpected(period: ProjectDeliverablePeriod) {
    const n = Number(editingValue)
    setEditingPeriodId(null)
    if (!Number.isFinite(n) || n < 0) return
    startTransition(async () => {
      await updatePeriodExpectedQuantity(period.id, n, projectId)
      refresh()
    })
  }

  const attachedIds = new Set((attached ?? []).map((a) => a.service_offer_id))
  const periodsByOffer = new Map<string, ProjectDeliverablePeriod[]>()
  for (const p of periods ?? []) {
    const list = periodsByOffer.get(p.service_offer_id) ?? []
    list.push(p)
    periodsByOffer.set(p.service_offer_id, list)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Alcance del servicio</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lo que el cliente tiene contratado y lo que se le ha entregado este periodo — no se relaciona con las tareas internas del proyecto.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openPicker} className="flex-shrink-0">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Agregar oferta
          </Button>
        )}
      </div>

      {attached === null ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…
        </p>
      ) : attached.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
          Sin ofertas de servicio adjuntas todavía.
        </p>
      ) : (
        <div className="space-y-4">
          {attached.map((a) => {
            const offer = a.service_offer
            if (!offer) return null
            const offerPeriods = periodsByOffer.get(offer.id) ?? []
            return (
              <div key={a.id} className="border rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{offer.name}</p>
                  {canManage && (
                    <button
                      onClick={() => handleDetach(offer.id)}
                      title="Quitar del proyecto"
                      className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {offerPeriods.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Esta oferta no tiene entregables definidos.</p>
                ) : (
                  <div className="space-y-2">
                    {offerPeriods.map((period) => (
                      <div key={period.id} className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{period.deliverable_text}</p>
                          <p className="text-[11px] text-muted-foreground">{period.period_label}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {Array.from({ length: period.expected_quantity }, (_, i) => (
                            <button
                              key={i}
                              disabled={!canMark || isPending}
                              onClick={() => toggleUnit(period, i)}
                              title={i < period.fulfilled_quantity ? "Entregado — click para revertir" : "Marcar como entregado"}
                              className={cn(
                                "w-5 h-5 rounded flex items-center justify-center border transition-colors disabled:opacity-50",
                                i < period.fulfilled_quantity
                                  ? "bg-success text-success-foreground border-success"
                                  : "border-border text-transparent hover:border-primary/40"
                              )}
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          ))}
                          <span className="text-xs text-muted-foreground ml-1">
                            {period.fulfilled_quantity}/{period.expected_quantity}
                          </span>
                          {canManage && (
                            editingPeriodId === period.id ? (
                              <input
                                type="number"
                                min="0"
                                autoFocus
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={() => saveExpected(period)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveExpected(period) }}
                                className="w-12 text-xs rounded border border-input bg-background px-1 py-0.5 ml-1"
                              />
                            ) : (
                              <button
                                onClick={() => startEditExpected(period)}
                                title="Ajustar cantidad esperada de este periodo"
                                className="text-muted-foreground hover:text-foreground transition-colors ml-0.5"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showPicker && (
        <Dialog open onOpenChange={setShowPicker}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Agregar oferta al proyecto</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {availableOffers.filter((o) => !attachedIds.has(o.id)).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Sin ofertas disponibles.</p>
              ) : (
                availableOffers.filter((o) => !attachedIds.has(o.id)).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => handleAttach(o.id)}
                    disabled={isPending}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/40 transition-all text-sm disabled:opacity-50"
                  >
                    <span className="font-medium">{o.name}</span>
                    <span className="text-xs text-muted-foreground block">{o.category} · {o.deliverables.length} entregable{o.deliverables.length !== 1 ? "s" : ""}</span>
                  </button>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPicker(false)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
