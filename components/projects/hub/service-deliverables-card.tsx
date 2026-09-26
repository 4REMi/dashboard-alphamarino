"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getAvailableServiceOffers, attachServiceOfferToProject, detachServiceOfferFromProject,
  addCustomDeliverable, deleteCustomDeliverable, getScopeOverview, setScopePeriodRule,
  updateDeliverableFulfilled, updatePeriodExpectedQuantity, updatePeriodText,
  type ScopeOverview, type ScopeLine,
} from "@/lib/actions/service-deliverables"
import type { ServiceOffer, ProjectDeliverablePeriod, DeliverableCadence } from "@/lib/types"
import { describeRule, type ScopePeriodMode } from "@/lib/utils/scope-periods"
import { Plus, X, Check, Loader2, Pencil, ChevronRight, Minus, Settings2, History } from "lucide-react"
import { cn } from "@/lib/utils"

// Alcance del servicio: lo que el cliente tiene contratado vs. lo que se
// le entregó, por periodo del proyecto (sus ciclos, mensual desde un día,
// cada N semanas…). Pensado para no volverse una lista interminable:
// historial arriba (un punto por periodo, con hover), grupos plegables
// (por periodo / arranque / continuo), lo completo se colapsa y las
// acciones de edición aparecen al pasar el cursor.

interface Props {
  projectId: string
  // Admin/subadmin: ofertas, entregables personalizados, regla de periodo,
  // editar texto/cantidad de un periodo.
  // canMark: admin/subadmin OR manage_tasks — marcar entregado.
  canManage: boolean
  canMark: boolean
}

type OfferOption = Pick<ServiceOffer, "id" | "category" | "name" | "deliverables">

const CADENCE_LABEL: Record<DeliverableCadence, string> = {
  once: "Una vez (arranque)",
  monthly: "Por periodo",
  quarterly: "Cada 3 periodos",
  biannual: "Cada 6 periodos",
  continuous: "Continuo (sin conteo)",
}
const OFFER_COLORS = ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500"]

// Cumplimiento sin que la sobre-entrega de una línea tape lo que falta en otra.
function completion(rows: ProjectDeliverablePeriod[]) {
  const expected = rows.reduce((s, r) => s + r.expected_quantity, 0)
  const done = rows.reduce((s, r) => s + Math.min(r.fulfilled_quantity, r.expected_quantity), 0)
  return { expected, done, pct: expected ? done / expected : 1 }
}

function tone(pct: number, isCurrent: boolean, empty: boolean) {
  if (empty) return { dot: "bg-muted border-border", text: "text-muted-foreground" }
  if (pct >= 1) return { dot: "bg-emerald-500 border-emerald-500", text: "text-emerald-700 dark:text-emerald-400" }
  if (isCurrent) return { dot: "bg-background border-primary", text: "text-primary" }
  if (pct >= 0.5) return { dot: "bg-amber-400 border-amber-400", text: "text-amber-700 dark:text-amber-400" }
  return { dot: "bg-red-500 border-red-500", text: "text-red-600" }
}

const rowTone = (r: ProjectDeliverablePeriod) =>
  r.fulfilled_quantity >= r.expected_quantity ? "bg-emerald-500" : r.fulfilled_quantity > 0 ? "bg-amber-400" : "bg-muted-foreground/30"

export function ServiceDeliverablesCard({ projectId, canManage, canMark }: Props) {
  const [data, setData] = useState<ScopeOverview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null) // period start
  const [showPicker, setShowPicker] = useState(false)
  const [availableOffers, setAvailableOffers] = useState<OfferOption[]>([])
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [showRule, setShowRule] = useState(false)
  const [isPending, startTransition] = useTransition()

  function refresh() {
    getScopeOverview(projectId)
      .then((d) => { setData(d); setLoadError(null) })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(() => { refresh() }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = data?.periods.find((p) => p.isCurrent) ?? data?.periods[data.periods.length - 1] ?? null
  const period = data?.periods.find((p) => p.start === selected) ?? current
  const viewingPast = !!period && !!current && period.start !== current.start

  const lineByKey = useMemo(() => new Map((data?.lines ?? []).map((l) => [l.key, l])), [data])
  const offerIds = useMemo(() => [...new Set((data?.lines ?? []).map((l) => l.offerId).filter(Boolean) as string[])], [data])
  const offerColor = (id: string | null) => (id ? OFFER_COLORS[offerIds.indexOf(id) % OFFER_COLORS.length] : "bg-fuchsia-500")

  const periodRows = (start: string) => (data?.rows ?? []).filter((r) => r.period_start === start && lineByKey.get(r.deliverable_key)?.cadence !== "once")
  const onceRows = (data?.rows ?? []).filter((r) => lineByKey.get(r.deliverable_key)?.cadence === "once")
  const continuous = (data?.lines ?? []).filter((l) => l.cadence === "continuous")
  const selectedRows = period ? periodRows(period.start) : []
  const summary = completion(selectedRows)

  function mark(row: ProjectDeliverablePeriod, next: number) {
    setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === row.id ? { ...r, fulfilled_quantity: next, marked_late: r.marked_late || viewingPast } : r)) })
    startTransition(async () => { await updateDeliverableFulfilled(row.id, next, projectId) })
  }

  function openPicker() {
    getAvailableServiceOffers().then(setAvailableOffers)
    setShowPicker(true)
  }

  const attachedOffers = offerIds.map((id) => ({ id, name: data!.lines.find((l) => l.offerId === id)!.offerName! }))

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Encabezado + resumen del periodo */}
      <div className="px-5 pt-4 pb-3 flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h3 className="font-semibold text-sm text-foreground">Alcance del servicio</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Lo contratado vs. lo entregado, por periodo del proyecto.</p>
        </div>
        {data && period && selectedRows.length > 0 && (
          <div className="min-w-[220px]">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{viewingPast ? "Periodo" : "Periodo actual"} · <span className="text-foreground font-medium">{period.label}</span></span>
              <span className="font-semibold">{summary.done}/{summary.expected}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full transition-all", summary.pct >= 1 ? "bg-emerald-500" : viewingPast ? (summary.pct >= 0.5 ? "bg-amber-400" : "bg-red-500") : "bg-primary")} style={{ width: `${summary.pct * 100}%` }} />
            </div>
          </div>
        )}
        {canManage && (
          <div className="flex items-center gap-1">
            <button onClick={() => setShowRule(true)} title="Regla de periodo" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"><Settings2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {loadError && <p className="px-5 pb-4 text-xs text-red-600">{loadError}</p>}
      {!data && !loadError && (
        <p className="px-5 pb-4 text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</p>
      )}

      {data && data.lines.length === 0 && (
        <div className="px-5 pb-5">
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">Sin ofertas ni entregables personalizados todavía.</p>
        </div>
      )}

      {data && data.lines.length > 0 && (
        <>
          {/* Historial: un punto por periodo. Hover = detalle, click = ver/corregir ese periodo. */}
          {data.periods.length > 0 && (
            <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              {data.periods.map((p) => {
                const rows = periodRows(p.start)
                const c = completion(rows)
                const t = tone(c.pct, p.isCurrent, rows.length === 0)
                const missing = rows.filter((r) => r.fulfilled_quantity < r.expected_quantity)
                const isSel = period?.start === p.start
                return (
                  <div key={p.start} className="relative group">
                    <button
                      onClick={() => setSelected(p.isCurrent ? null : p.start)}
                      className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] transition-colors", isSel ? "border-foreground/40 bg-muted" : "border-transparent hover:bg-muted/60")}
                    >
                      <span className={cn("w-2.5 h-2.5 rounded-full border-2", t.dot)} />
                      <span className={cn("font-medium", t.text)}>{p.label.split(" – ")[0]}</span>
                      {rows.length > 0 && <span className="text-muted-foreground">{Math.round(c.pct * 100)}%</span>}
                    </button>
                    <div className="absolute left-0 top-full pt-1.5 z-30 hidden group-hover:block">
                      <div className="w-64 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3 text-xs space-y-1.5">
                        <p className="font-semibold">{p.label}{p.isCurrent && <span className="ml-1 font-normal text-primary">· actual</span>}</p>
                        {rows.length === 0 ? (
                          <p className="text-muted-foreground">Sin entregables en este periodo.</p>
                        ) : (
                          <>
                            <p className="text-muted-foreground">{c.done} de {c.expected} unidades entregadas</p>
                            {missing.length > 0 && (
                              <ul className="space-y-0.5">
                                {missing.slice(0, 5).map((r) => (
                                  <li key={r.id} className="flex gap-1.5"><span className="text-red-500">•</span><span className="truncate">{lineByKey.get(r.deliverable_key)?.text}</span><span className="ml-auto text-muted-foreground">{r.fulfilled_quantity}/{r.expected_quantity}</span></li>
                                ))}
                                {missing.length > 5 && <li className="text-muted-foreground">y {missing.length - 5} más</li>}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {viewingPast && (
            <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
              Viendo un periodo pasado — lo que marques queda como &quot;marcado después&quot;.
              <button onClick={() => setSelected(null)} className="ml-auto font-medium hover:underline">Volver al actual</button>
            </div>
          )}

          <div className="border-t border-border divide-y divide-border">
            <Group title="Por periodo" rows={selectedRows} defaultOpen lineByKey={lineByKey} offerColor={offerColor} showOffer={offerIds.length > 1}
              canMark={canMark} canManage={canManage} projectId={projectId} onMark={mark} onChanged={refresh} emptyText="Sin entregables recurrentes." />
            {onceRows.length > 0 && (
              <Group title="Arranque" rows={onceRows} defaultOpen={completion(onceRows).pct < 1} lineByKey={lineByKey} offerColor={offerColor} showOffer={offerIds.length > 1}
                canMark={canMark} canManage={canManage} projectId={projectId} onMark={mark} onChanged={refresh} />
            )}
            {continuous.length > 0 && (
              <div className="px-5 py-2.5 flex items-center gap-2 flex-wrap text-xs">
                <span className="font-semibold text-muted-foreground mr-1">Continuo</span>
                {continuous.map((l) => (
                  <span key={l.key} title={l.fullText} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted text-foreground">
                    <span className={cn("w-1.5 h-1.5 rounded-full", offerColor(l.offerId))} />{l.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Pie: ofertas y personalizados (admin) */}
      {data && canManage && (
        <div className="px-5 py-2.5 border-t border-border flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-muted-foreground">Ofertas:</span>
          {attachedOffers.map((o) => (
            <span key={o.id} className="group inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full border border-border">
              <span className={cn("w-1.5 h-1.5 rounded-full", offerColor(o.id))} />{o.name}
              <button
                onClick={() => {
                  if (!confirm(`¿Quitar "${o.name}" del proyecto? El historial ya registrado se conserva.`)) return
                  startTransition(async () => { await detachServiceOfferFromProject(projectId, o.id); refresh() })
                }}
                title="Quitar del proyecto"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              ><X className="w-3 h-3" /></button>
            </span>
          ))}
          <button onClick={openPicker} className="inline-flex items-center gap-1 text-primary hover:underline"><Plus className="w-3 h-3" />Oferta</button>
          <button onClick={() => setShowAddCustom(true)} className="inline-flex items-center gap-1 text-primary hover:underline"><Plus className="w-3 h-3" />Personalizado</button>
          <span className="ml-auto text-muted-foreground">Periodo: {describeRule(data.rule)}{data.ruleIsDefault ? " (automático)" : ""}</span>
        </div>
      )}

      {showPicker && (
        <Dialog open onOpenChange={setShowPicker}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-base">Agregar oferta al proyecto</DialogTitle></DialogHeader>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {availableOffers.filter((o) => !offerIds.includes(o.id)).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Sin ofertas disponibles.</p>
              ) : (
                availableOffers.filter((o) => !offerIds.includes(o.id)).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => startTransition(async () => { await attachServiceOfferToProject(projectId, o.id); setShowPicker(false); refresh() })}
                    disabled={isPending}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/40 transition-all text-sm disabled:opacity-50"
                  >
                    <span className="font-medium">{o.name}</span>
                    <span className="text-xs text-muted-foreground block">{o.category} · {o.deliverables.length} entregable{o.deliverables.length !== 1 ? "s" : ""}</span>
                  </button>
                ))
              )}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setShowPicker(false)}>Cerrar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showAddCustom && <CustomDialog projectId={projectId} onClose={() => setShowAddCustom(false)} onSaved={refresh} />}
      {showRule && data && <RuleDialog projectId={projectId} data={data} onClose={() => setShowRule(false)} onSaved={refresh} />}
    </div>
  )
}

// Grupo plegable. Lo pendiente arriba; lo completo se colapsa en una línea.
function Group({ title, rows, defaultOpen, lineByKey, offerColor, showOffer, canMark, canManage, projectId, onMark, onChanged, emptyText }: {
  title: string
  rows: ProjectDeliverablePeriod[]
  defaultOpen: boolean
  lineByKey: Map<string, ScopeLine>
  offerColor: (id: string | null) => string
  showOffer: boolean
  canMark: boolean
  canManage: boolean
  projectId: string
  onMark: (r: ProjectDeliverablePeriod, next: number) => void
  onChanged: () => void
  emptyText?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [showDone, setShowDone] = useState(false)
  const c = completion(rows)
  const sorted = [...rows].sort((a, b) => (lineByKey.get(a.deliverable_key)?.text ?? "").localeCompare(lineByKey.get(b.deliverable_key)?.text ?? ""))
  const pending = sorted.filter((r) => r.fulfilled_quantity < r.expected_quantity)
  const done = sorted.filter((r) => r.fulfilled_quantity >= r.expected_quantity)
  const rowProps = { lineByKey, offerColor, showOffer, canMark, canManage, projectId, onMark, onChanged }

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="w-full px-5 py-2.5 flex items-center gap-2 text-xs hover:bg-muted/30">
        <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="font-semibold">{title}</span>
        {rows.length > 0 && (
          <>
            <span className="text-muted-foreground">{c.done}/{c.expected}</span>
            {pending.length > 0
              ? <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-semibold">{pending.length} pendiente{pending.length === 1 ? "" : "s"}</span>
              : <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-semibold">Completo</span>}
          </>
        )}
      </button>
      {open && (
        <div className="pb-2">
          {rows.length === 0 && emptyText && <p className="px-5 pb-2 text-xs text-muted-foreground">{emptyText}</p>}
          {pending.map((r) => <Row key={r.id} row={r} {...rowProps} />)}
          {done.length > 0 && (
            pending.length === 0 || showDone ? (
              done.map((r) => <Row key={r.id} row={r} {...rowProps} />)
            ) : (
              <button onClick={() => setShowDone(true)} className="px-5 py-1 text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1">
                <Check className="w-3 h-3" /> {done.length} completo{done.length === 1 ? "" : "s"} — ver
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

function Row({ row, lineByKey, offerColor, showOffer, canMark, canManage, projectId, onMark, onChanged }: {
  row: ProjectDeliverablePeriod
  lineByKey: Map<string, ScopeLine>
  offerColor: (id: string | null) => string
  showOffer: boolean
  canMark: boolean
  canManage: boolean
  projectId: string
  onMark: (r: ProjectDeliverablePeriod, next: number) => void
  onChanged: () => void
}) {
  const line = lineByKey.get(row.deliverable_key)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(row.deliverable_text)
  const [qty, setQty] = useState(String(row.expected_quantity))
  const [, startTransition] = useTransition()
  const over = row.fulfilled_quantity - row.expected_quantity
  const label = line?.text ?? row.deliverable_text
  // El texto editado por periodo manda; si no, el texto de control.
  const shown = row.deliverable_text !== line?.fullText && row.deliverable_text !== line?.text ? row.deliverable_text : label

  function save() {
    const n = Number(qty)
    setEditing(false)
    if (!text.trim() || !Number.isFinite(n) || n < 0) return
    startTransition(async () => {
      if (text.trim() !== row.deliverable_text) await updatePeriodText(row.id, text.trim(), projectId)
      if (n !== row.expected_quantity) await updatePeriodExpectedQuantity(row.id, n, projectId)
      onChanged()
    })
  }

  return (
    <div className="group px-5 py-1.5 flex items-center gap-2.5 hover:bg-muted/30">
      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", rowTone(row))} />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {editing ? (
          <Input value={text} onChange={(e) => setText(e.target.value)} className="h-7 text-sm" autoFocus onKeyDown={(e) => { if (e.key === "Enter") save() }} />
        ) : (
          <p className="text-sm truncate" title={line?.fullText ?? row.deliverable_text}>{shown}</p>
        )}
        {showOffer && line && <span title={line.offerName ?? "Personalizado"} className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", offerColor(line.offerId))} />}
        {row.marked_late && <span className="text-[10px] text-amber-700 dark:text-amber-400 flex-shrink-0">marcado después</span>}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {editing ? (
          <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save() }}
            className="w-12 text-xs rounded border border-input bg-background px-1 py-0.5" />
        ) : row.expected_quantity <= 6 && over <= 0 ? (
          Array.from({ length: row.expected_quantity }, (_, i) => (
            <button
              key={i}
              disabled={!canMark}
              onClick={() => onMark(row, i < row.fulfilled_quantity ? i : i + 1)}
              title={i < row.fulfilled_quantity ? "Entregado — click para revertir" : "Marcar como entregado"}
              className={cn(
                "w-[18px] h-[18px] rounded flex items-center justify-center border transition-colors disabled:opacity-50",
                i < row.fulfilled_quantity ? "bg-emerald-500 text-white border-emerald-500" : "border-border text-transparent hover:border-primary/50",
              )}
            ><Check className="w-3 h-3" /></button>
          ))
        ) : (
          canMark && (
            <button onClick={() => onMark(row, Math.max(0, row.fulfilled_quantity - 1))} className="p-0.5 rounded border border-border text-muted-foreground hover:text-foreground"><Minus className="w-3 h-3" /></button>
          )
        )}
        {!editing && (
          <span className={cn("text-xs tabular-nums ml-1 min-w-[2.5rem] text-right", over > 0 ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-muted-foreground")}>
            {row.fulfilled_quantity}/{row.expected_quantity}{over > 0 && ` +${over}`}
          </span>
        )}
        {canMark && !editing && (
          <button onClick={() => onMark(row, row.fulfilled_quantity + 1)} title="Sumar uno (se permite entregar de más)"
            className="p-0.5 rounded border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-3 h-3" /></button>
        )}
        {canManage && (
          editing ? (
            <button onClick={save} title="Guardar" className="text-emerald-600 ml-1"><Check className="w-3.5 h-3.5" /></button>
          ) : (
            <button onClick={() => setEditing(true)} title="Editar texto/cantidad de ESTE periodo (el siguiente vuelve a tomar lo del catálogo)"
              className="ml-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="w-3 h-3" /></button>
          )
        )}
        {canManage && line?.customId && !editing && (
          <button
            onClick={() => {
              if (!confirm("¿Eliminar este entregable personalizado? El historial ya registrado se conserva.")) return
              startTransition(async () => { await deleteCustomDeliverable(line.customId!, projectId); onChanged() })
            }}
            title="Eliminar entregable personalizado"
            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          ><X className="w-3.5 h-3.5" /></button>
        )}
      </div>
    </div>
  )
}

function CustomDialog({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("")
  const [cadence, setCadence] = useState<DeliverableCadence>("monthly")
  const [qty, setQty] = useState("")
  const [isPending, startTransition] = useTransition()
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Entregable personalizado</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Algo que este proyecto tiene que entregar sin que forme parte de una oferta del catálogo.</p>
        <div className="space-y-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej. Sesión de fotos de producto" />
          <div className="grid grid-cols-2 gap-2">
            <select value={cadence} onChange={(e) => setCadence(e.target.value as DeliverableCadence)} className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm">
              {(Object.keys(CADENCE_LABEL) as DeliverableCadence[]).map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
            </select>
            <Input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Cantidad" disabled={cadence === "continuous"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!text.trim() || isPending}
            onClick={() => startTransition(async () => {
              await addCustomDeliverable(projectId, text, cadence, qty.trim() === "" ? null : Number(qty))
              onSaved(); onClose()
            })}
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RuleDialog({ projectId, data, onClose, onSaved }: { projectId: string; data: ScopeOverview; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<ScopePeriodMode | "auto">(data.ruleIsDefault ? "auto" : data.rule.mode)
  const [anchor, setAnchor] = useState(data.rule.anchor ?? "")
  const [weeks, setWeeks] = useState(String(data.rule.weeks ?? 2))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const options: { value: ScopePeriodMode | "auto"; label: string; hint: string }[] = [
    { value: "auto", label: "Automático", hint: data.hasCycles ? "Usa los ciclos del proyecto." : "Mensual desde la fecha de inicio del proyecto." },
    { value: "cycles", label: "Ciclos del proyecto", hint: "Cada ciclo (paid media) es un periodo." },
    { value: "monthly", label: "Mensual desde un día", hint: "Ej. del 15 al 14." },
    { value: "weeks", label: "Cada N semanas", hint: "Desde una fecha de inicio." },
    { value: "calendar", label: "Mes calendario", hint: "Del 1 al último día del mes." },
  ]
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">Periodo del alcance</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Define cada cuánto se miden los entregables &quot;por periodo&quot;. Periodos sin nada marcado se regeneran con la regla nueva; lo ya marcado se conserva.</p>
        <div className="space-y-1.5">
          {options.map((o) => (
            <label key={o.value} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm", mode === o.value ? "border-primary bg-primary/5" : "border-border")}>
              <input type="radio" checked={mode === o.value} onChange={() => setMode(o.value)} className="mt-1" />
              <span><span className="font-medium">{o.label}</span><span className="block text-xs text-muted-foreground">{o.hint}</span></span>
            </label>
          ))}
        </div>
        {(mode === "monthly" || mode === "weeks") && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs"><span className="text-muted-foreground">{mode === "monthly" ? "A partir de (su día es el corte)" : "Inicio"}</span>
              <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="mt-0.5" /></label>
            {mode === "weeks" && (
              <label className="text-xs"><span className="text-muted-foreground">Semanas</span>
                <Input type="number" min="1" value={weeks} onChange={(e) => setWeeks(e.target.value)} className="mt-0.5" /></label>
            )}
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={isPending} onClick={() => startTransition(async () => {
            try {
              await setScopePeriodRule(projectId, { mode: mode === "auto" ? null : mode, anchor: anchor || null, weeks: Number(weeks) || null })
              onSaved(); onClose()
            } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
          })}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
