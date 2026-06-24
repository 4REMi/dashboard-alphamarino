"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { createConcept, updateConcept, promoteConcept, deleteConcept } from "@/lib/actions/creatives"
import { ANGLE_GUIDE, AWARENESS_LABELS, CONCEPT_STATUS_COLORS, PRODUCTION_STATUS_COLORS, VERDICT_COLORS } from "@/lib/constants/creatives"
import type { CreativeConcept, CreativeAsset, FunnelStage } from "@/lib/types"
import { Sparkles, Star, ChevronDown, ChevronUp, Trash2, ArrowUpRight, Plus, Info } from "lucide-react"
import { cn } from "@/lib/utils"

const ORGANIZING_PRINCIPLES = ["Pain-First", "Desire-First"] as const
const FUNNEL_STAGES: FunnelStage[] = ["TOF", "MOF", "BOF"]
const STATUSES = ["Active", "Archived", "Transmuted", "Evergreen"] as const

const SECTIONS = ["Identificación", "Ángulo", "Mecanismo"] as const

interface ConceptModalProps {
  projectId: string
  cycleId: string | null
  concept?: CreativeConcept | null
  assets?: CreativeAsset[]
  isAdminOrSubadmin: boolean
  open: boolean
  brandLineId?: string | null
  onRefresh?: () => void
  onClose: () => void
  onNewAsset?: () => void
}

function FieldLabel({ label, tooltip, required }: { label: string; tooltip?: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}{required && " *"}
      </span>
      {tooltip && (
        <span title={tooltip} className="cursor-help inline-flex text-muted-foreground/40 hover:text-muted-foreground transition-colors">
          <Info className="w-3 h-3" />
        </span>
      )}
    </div>
  )
}

export function ConceptModal({ projectId, cycleId, concept, assets, isAdminOrSubadmin, open, brandLineId, onRefresh, onClose, onNewAsset }: ConceptModalProps) {
  const isEdit = !!concept
  const [isPending, startTransition] = useTransition()
  const [showAngleGuide, setShowAngleGuide] = useState(false)

  const [form, setForm] = useState({
    name:                 concept?.name ?? "",
    organizing_principle: concept?.organizing_principle ?? "",
    target_persona:       concept?.target_persona ?? "",
    angle_type:           concept?.angle_type ?? "",
    awareness_stage:      String(concept?.awareness_stage ?? ""),
    funnel_stage:         concept?.funnel_stage ?? "",
    why_it_works:         concept?.why_it_works ?? "",
    pain_point:           concept?.pain_point ?? "",
    objection:            concept?.objection ?? "",
    transformation:       concept?.transformation ?? "",
    ref_links:            concept?.ref_links ?? "",
    status:               concept?.status ?? "Active",
    insight:              concept?.insight ?? "",
  })

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const guideEntry = ANGLE_GUIDE.find((a) => a.name === form.angle_type)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.set(k, v))
    if (cycleId) fd.set("cycle_id", cycleId)
    const lineId = concept?.brand_line_id ?? brandLineId
    if (lineId) fd.set("brand_line_id", lineId)
    startTransition(async () => {
      if (isEdit) {
        await updateConcept(concept.id, projectId, fd)
      } else {
        await createConcept(projectId, fd)
      }
      onRefresh?.()
      onClose()
    })
  }

  function handlePromote() {
    if (!concept) return
    startTransition(async () => {
      await promoteConcept(concept.id, projectId)
      onRefresh?.()
      onClose()
    })
  }

  function handleDelete() {
    if (!concept) return
    if (!confirm("¿Eliminar este concepto?")) return
    startTransition(async () => {
      await deleteConcept(concept.id, projectId)
      onRefresh?.()
      onClose()
    })
  }

  const fieldCls = "w-full text-sm border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            {isEdit ? "Editar Concepto" : "Nuevo Concepto"}
            {concept?.status && (
              <Badge className={cn("text-xs ml-1", CONCEPT_STATUS_COLORS[concept.status])}>
                {concept.status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {concept?.parent && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-center gap-2">
            <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              Evolución de: <span className="font-medium">{concept.parent.angle_type ?? "concepto anterior"}</span>
              {" "}·{" "}<span className={CONCEPT_STATUS_COLORS[concept.parent.status]}>{concept.parent.status}</span>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Identificación ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Identificación</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <FieldLabel label="Nombre del concepto" tooltip="Título corto para identificar este concepto." />
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. Miedo al olvido" className={fieldCls} />
              </div>
              <div className="space-y-1">
                <FieldLabel label="Principio organizador" tooltip="Pain-First parte del dolor. Desire-First parte de la aspiración." />
                <select value={form.organizing_principle} onChange={(e) => set("organizing_principle", e.target.value)} className={fieldCls}>
                  <option value="">— seleccionar —</option>
                  {ORGANIZING_PRINCIPLES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <FieldLabel label="Persona objetivo" required tooltip="Quién ve este anuncio: demografía, situación, contexto." />
              <input value={form.target_persona} onChange={(e) => set("target_persona", e.target.value)} placeholder="Ej. Dueño de cafetería en México, 35-50 años" className={fieldCls} required />
            </div>
          </div>

          {/* ── Ángulo ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Ángulo</p>

            <div className="space-y-1">
              <FieldLabel label="Tipo de ángulo" tooltip="El mecanismo psicológico que estructura el mensaje." />
              <select value={form.angle_type} onChange={(e) => { set("angle_type", e.target.value); setShowAngleGuide(false) }} className={fieldCls}>
                <option value="">— seleccionar —</option>
                {ANGLE_GUIDE.map((a) => <option key={a.name} value={a.name}>{a.emoji} {a.name}</option>)}
              </select>
            </div>

            {form.angle_type && guideEntry && (
              <div className="border rounded-lg overflow-hidden">
                <button type="button" className="w-full flex items-center justify-between px-3 py-2 bg-purple-50/60 text-xs font-medium text-purple-700 hover:bg-purple-50" onClick={() => setShowAngleGuide((v) => !v)}>
                  <span>{guideEntry.emoji} Guía: {form.angle_type}</span>
                  {showAngleGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showAngleGuide && (
                  <div className="px-3 py-2.5 space-y-1.5 text-xs text-muted-foreground bg-purple-50/20">
                    <p><span className="font-medium text-foreground">Pregunta guía:</span> {guideEntry.guiding_question}</p>
                    <p><span className="font-medium text-foreground">Mecanismo:</span> {guideEntry.mechanism}</p>
                    <p><span className="font-medium text-foreground">Cuándo usar:</span> {guideEntry.when_to_use}</p>
                    <p><span className="font-medium text-foreground">Ejemplo de hook:</span> <em>&ldquo;{guideEntry.hook_example}&rdquo;</em></p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <FieldLabel label="Awareness Stage" tooltip="1 = No sabe que tiene el problema · 5 = Lista para comprar." />
                <select value={form.awareness_stage} onChange={(e) => set("awareness_stage", e.target.value)} className={fieldCls}>
                  <option value="">—</option>
                  {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} — {AWARENESS_LABELS[n]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <FieldLabel label="Funnel Stage" tooltip="TOF = frío. MOF = consideración. BOF = conversión." />
                <select value={form.funnel_stage} onChange={(e) => set("funnel_stage", e.target.value)} className={fieldCls}>
                  <option value="">—</option>
                  {FUNNEL_STAGES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Mecanismo ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Mecanismo</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <FieldLabel label="Pain Point" tooltip="El problema concreto que activa la atención." />
                <AutoTextarea value={form.pain_point} onChange={(e) => set("pain_point", e.target.value)} rows={2} placeholder="El dolor que activa este ángulo" className={fieldCls} />
              </div>
              <div className="space-y-1">
                <FieldLabel label="Objeción principal" tooltip="La resistencia que el ad debe superar." />
                <AutoTextarea value={form.objection} onChange={(e) => set("objection", e.target.value)} rows={2} placeholder="La duda que frena al buyer persona" className={fieldCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <FieldLabel label="¿Por qué funciona?" tooltip="Por qué este ángulo resuena con esta persona." />
                <AutoTextarea value={form.why_it_works} onChange={(e) => set("why_it_works", e.target.value)} rows={2} placeholder="El fundamento de que convierte" className={fieldCls} />
              </div>
              <div className="space-y-1">
                <FieldLabel label="Transformación" tooltip="El cambio prometido si toma acción." />
                <AutoTextarea value={form.transformation} onChange={(e) => set("transformation", e.target.value)} rows={2} placeholder="El antes y después" className={fieldCls} />
              </div>
            </div>

            <div className="space-y-1">
              <FieldLabel label="Referencias / Inspiración" tooltip="Links o descripciones de ads de referencia." />
              <input value={form.ref_links} onChange={(e) => set("ref_links", e.target.value)} placeholder="Links o descripciones de referencia" className={fieldCls} />
            </div>
          </div>

          {/* ── Edit-only fields ── */}
          {isEdit && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1">
                <FieldLabel label="Status" />
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className={fieldCls}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}

          {isAdminOrSubadmin && (
            <div className="space-y-1 border-t pt-4">
              <FieldLabel label="Insight estratégico" tooltip="Qué funcionó, qué no. Solo visible para admin/subadmin." />
              <AutoTextarea value={form.insight} onChange={(e) => set("insight", e.target.value)} rows={2} placeholder="Aprendizajes del ciclo" className={fieldCls} />
            </div>
          )}

          {/* Footer */}
          <DialogFooter className="flex items-center justify-between pt-2 border-t gap-2">
            <div className="flex gap-2">
              {isEdit && concept?.status !== "Evergreen" && isAdminOrSubadmin && (
                <Button type="button" variant="outline" size="sm" onClick={handlePromote} disabled={isPending}>
                  <Star className="w-3.5 h-3.5 mr-1 text-amber-500" />
                  Evergreen
                </Button>
              )}
              {isEdit && isAdminOrSubadmin && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={isPending}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={isPending || !isAdminOrSubadmin}>
                {isPending ? "Guardando..." : isEdit ? "Guardar" : "Crear concepto"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
