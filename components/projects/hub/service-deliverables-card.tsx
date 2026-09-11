"use client"

import { useEffect, useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getAvailableServiceOffers, getProjectServiceOffers, attachServiceOfferToProject,
  detachServiceOfferFromProject, getProjectCustomDeliverables, addCustomDeliverable,
  deleteCustomDeliverable, getCurrentPeriodDeliverables, updateDeliverableFulfilled,
  updatePeriodExpectedQuantity, updatePeriodText,
} from "@/lib/actions/service-deliverables"
import type { ServiceOffer, ProjectServiceOffer, ProjectCustomDeliverable, ProjectDeliverablePeriod, DeliverableCadence } from "@/lib/types"
import { Plus, X, Check, Loader2, Pencil, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  projectId: string
  // Admin/subadmin: attach/detach offers, add/remove custom deliverables,
  // edit a period's text/expected quantity.
  // canMark: admin/subadmin OR manage_tasks — mark units as fulfilled.
  canManage: boolean
  canMark: boolean
}

type OfferOption = Pick<ServiceOffer, "id" | "category" | "name" | "deliverables">

const CADENCE_LABEL: Record<DeliverableCadence, string> = {
  once: "Una vez",
  monthly: "Mensual",
  quarterly: "Trimestral",
  biannual: "Semestral",
}

export function ServiceDeliverablesCard({ projectId, canManage, canMark }: Props) {
  const [attached, setAttached] = useState<ProjectServiceOffer[] | null>(null)
  const [customDeliverables, setCustomDeliverables] = useState<ProjectCustomDeliverable[]>([])
  const [periods, setPeriods] = useState<ProjectDeliverablePeriod[] | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [availableOffers, setAvailableOffers] = useState<OfferOption[]>([])
  const [isPending, startTransition] = useTransition()

  // Editing a period — text + quantity together, one inline mini-form.
  // Only affects THIS period (see updatePeriodText's comment) — same rule
  // as expected_quantity already had, kept consistent rather than adding a
  // second override model.
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const [editingQty, setEditingQty] = useState("")

  const [showAddCustom, setShowAddCustom] = useState(false)
  const [customText, setCustomText] = useState("")
  const [customCadence, setCustomCadence] = useState<DeliverableCadence>("once")
  const [customQty, setCustomQty] = useState("")

  function refresh() {
    startTransition(async () => {
      const [offers, custom, current] = await Promise.all([
        getProjectServiceOffers(projectId),
        getProjectCustomDeliverables(projectId),
        getCurrentPeriodDeliverables(projectId),
      ])
      setAttached(offers)
      setCustomDeliverables(custom)
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

  function handleAddCustom() {
    if (!customText.trim()) return
    startTransition(async () => {
      await addCustomDeliverable(projectId, customText, customCadence, customQty.trim() === "" ? null : Number(customQty))
      setCustomText(""); setCustomCadence("once"); setCustomQty("")
      setShowAddCustom(false)
      refresh()
    })
  }

  function handleDeleteCustom(id: string) {
    if (!confirm("¿Eliminar este entregable personalizado? El historial de periodos ya registrados se conserva.")) return
    startTransition(async () => {
      await deleteCustomDeliverable(id, projectId)
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

  function startEdit(period: ProjectDeliverablePeriod) {
    setEditingPeriodId(period.id)
    setEditingText(period.deliverable_text)
    setEditingQty(String(period.expected_quantity))
  }

  function saveEdit(period: ProjectDeliverablePeriod) {
    const n = Number(editingQty)
    const text = editingText.trim()
    setEditingPeriodId(null)
    if (!text || !Number.isFinite(n) || n < 0) return
    startTransition(async () => {
      const tasks: Promise<void>[] = []
      if (text !== period.deliverable_text) tasks.push(updatePeriodText(period.id, text, projectId))
      if (n !== period.expected_quantity) tasks.push(updatePeriodExpectedQuantity(period.id, n, projectId))
      await Promise.all(tasks)
      refresh()
    })
  }

  const attachedIds = new Set((attached ?? []).map((a) => a.service_offer_id))
  const periodsByOffer = new Map<string, ProjectDeliverablePeriod[]>()
  const customPeriodsById = new Map<string, ProjectDeliverablePeriod>()
  for (const p of periods ?? []) {
    if (p.service_offer_id) {
      const list = periodsByOffer.get(p.service_offer_id) ?? []
      list.push(p)
      periodsByOffer.set(p.service_offer_id, list)
    } else {
      customPeriodsById.set(p.deliverable_key, p)
    }
  }

  function renderPeriodRow(period: ProjectDeliverablePeriod) {
    const isEditing = editingPeriodId === period.id
    return (
      <div key={period.id} className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <Input
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              className="h-7 text-sm"
              autoFocus
            />
          ) : (
            <p className="text-sm truncate">{period.deliverable_text}</p>
          )}
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
          {isEditing ? (
            <input
              type="number"
              min="0"
              value={editingQty}
              onChange={(e) => setEditingQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(period) }}
              className="w-12 text-xs rounded border border-input bg-background px-1 py-0.5 ml-1"
            />
          ) : (
            <span className="text-xs text-muted-foreground ml-1">
              {period.fulfilled_quantity}/{period.expected_quantity}
            </span>
          )}
          {canManage && (
            isEditing ? (
              <button onClick={() => saveEdit(period)} title="Guardar" className="text-success hover:text-success/80 transition-colors ml-0.5">
                <Check className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => startEdit(period)}
                title="Editar texto/cantidad de este periodo — no afecta el catálogo ni otros proyectos"
                className="text-muted-foreground hover:text-foreground transition-colors ml-0.5"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )
          )}
        </div>
      </div>
    )
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
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => setShowAddCustom(true)}>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Entregable personalizado
            </Button>
            <Button size="sm" variant="outline" onClick={openPicker}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Agregar oferta
            </Button>
          </div>
        )}
      </div>

      {attached === null ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…
        </p>
      ) : attached.length === 0 && customDeliverables.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
          Sin ofertas ni entregables personalizados todavía.
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
                  <div className="space-y-2">{offerPeriods.map(renderPeriodRow)}</div>
                )}
              </div>
            )
          })}

          {customDeliverables.length > 0 && (
            <div className="border rounded-lg p-3 space-y-2.5">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                Entregables personalizados
              </p>
              <div className="space-y-2">
                {customDeliverables.map((cd) => {
                  const period = customPeriodsById.get(cd.id)
                  if (!period) return null
                  return (
                    <div key={cd.id} className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">{renderPeriodRow(period)}</div>
                      {canManage && (
                        <button
                          onClick={() => handleDeleteCustom(cd.id)}
                          title="Eliminar este entregable personalizado"
                          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 mt-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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

      {showAddCustom && (
        <Dialog open onOpenChange={setShowAddCustom}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Entregable personalizado</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground -mt-2">
              Para algo que este proyecto en particular tiene que entregar, sin que forme parte de ninguna oferta del catálogo.
            </p>
            <div className="space-y-2">
              <Input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Ej. Sesión de fotos de producto — entrega única"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={customCadence}
                  onChange={(e) => setCustomCadence(e.target.value as DeliverableCadence)}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                >
                  {(Object.keys(CADENCE_LABEL) as DeliverableCadence[]).map((c) => (
                    <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  min="0"
                  value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                  placeholder="Cantidad (opcional)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddCustom(false)}>Cancelar</Button>
              <Button onClick={handleAddCustom} disabled={!customText.trim() || isPending}>
                {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Agregar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
