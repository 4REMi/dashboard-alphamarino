"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createConcept, updateConcept, promoteConcept, deleteConcept } from "@/lib/actions/creatives"
import { ANGLE_GUIDE, AWARENESS_LABELS, CONCEPT_STATUS_COLORS } from "@/lib/constants/creatives"
import type { CreativeConcept } from "@/lib/types"
import { Sparkles, Star, ChevronDown, ChevronUp, Trash2, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

const ORGANIZING_PRINCIPLES = ["Pain-First", "Desire-First"] as const
const STATUSES = ["Active", "Archived", "Transmuted", "Evergreen"] as const

interface ConceptModalProps {
  projectId: string
  cycleId: string | null
  concept?: CreativeConcept | null
  isAdminOrSubadmin: boolean
  open: boolean
  onClose: () => void
}

export function ConceptModal({ projectId, cycleId, concept, isAdminOrSubadmin, open, onClose }: ConceptModalProps) {
  const isEdit = !!concept
  const [isPending, startTransition] = useTransition()
  const [showAngleGuide, setShowAngleGuide] = useState(false)
  const [selectedAngle, setSelectedAngle] = useState(concept?.angle_type ?? "")

  const guideEntry = ANGLE_GUIDE.find((a) => a.name === selectedAngle)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (cycleId) fd.set("cycle_id", cycleId)
    startTransition(async () => {
      if (isEdit) {
        await updateConcept(concept.id, projectId, fd)
      } else {
        await createConcept(projectId, fd)
      }
      onClose()
    })
  }

  function handlePromote() {
    if (!concept) return
    startTransition(async () => {
      await promoteConcept(concept.id, projectId)
      onClose()
    })
  }

  function handleDelete() {
    if (!concept) return
    if (!confirm("¿Eliminar este concepto?")) return
    startTransition(async () => {
      await deleteConcept(concept.id, projectId)
      onClose()
    })
  }

  const fieldCls = "w-full text-sm border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
  const labelCls = "text-xs font-medium text-muted-foreground"

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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

        {/* Evolution chain */}
        {concept?.parent && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-center gap-2">
            <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              Evolución de: <span className="font-medium">{concept.parent.angle_type ?? "concepto anterior"}</span>
              {" "}·{" "}<span className={CONCEPT_STATUS_COLORS[concept.parent.status]}>{concept.parent.status}</span>
              {concept.parent.insight && <span className="ml-2 italic">"{concept.parent.insight}"</span>}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Two-panel body */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">

            {/* ── LEFT PANEL: What (strategic) ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estrategia</p>

              {/* Principio + Ángulo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={labelCls}>Principio</label>
                  <select name="organizing_principle" defaultValue={concept?.organizing_principle ?? ""} className={fieldCls}>
                    <option value="">— seleccionar —</option>
                    {ORGANIZING_PRINCIPLES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Tipo de ángulo</label>
                  <select
                    name="angle_type"
                    defaultValue={concept?.angle_type ?? ""}
                    className={fieldCls}
                    onChange={(e) => { setSelectedAngle(e.target.value); setShowAngleGuide(false) }}
                  >
                    <option value="">— seleccionar —</option>
                    {ANGLE_GUIDE.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Angle guide */}
              {selectedAngle && guideEntry && (
                <div className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 bg-purple-50/60 text-xs font-medium text-purple-700 hover:bg-purple-50"
                    onClick={() => setShowAngleGuide((v) => !v)}
                  >
                    <span>Guía: {selectedAngle}</span>
                    {showAngleGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showAngleGuide && (
                    <div className="px-3 py-2.5 space-y-1.5 text-xs text-muted-foreground bg-purple-50/20">
                      <p><span className="font-medium text-foreground">Mecanismo:</span> {guideEntry.mechanism}</p>
                      <p><span className="font-medium text-foreground">Cuándo usar:</span> {guideEntry.when_to_use}</p>
                      <p><span className="font-medium text-foreground">Ejemplo de hook:</span> <em>"{guideEntry.hook_example}"</em></p>
                    </div>
                  )}
                </div>
              )}

              {/* Persona */}
              <div className="space-y-1">
                <label className={labelCls}>Persona objetivo *</label>
                <input name="target_persona" defaultValue={concept?.target_persona ?? ""} required placeholder="Ej. Mujer 28-45, emprendedora, producto premium" className={fieldCls} />
              </div>

              {/* Dolor / Deseo */}
              <div className="space-y-1">
                <label className={labelCls}>Dolor / Deseo central *</label>
                <input name="pain_or_desire" defaultValue={concept?.pain_or_desire ?? ""} required placeholder="El problema o deseo que activa el anuncio" className={fieldCls} />
              </div>

              {/* Hook */}
              <div className="space-y-1">
                <label className={labelCls}>Hook propuesto</label>
                <textarea name="proposed_hook" defaultValue={concept?.proposed_hook ?? ""} rows={3} placeholder="Primera línea del anuncio" className={fieldCls} />
              </div>

              {/* Status — edit only */}
              {isEdit && (
                <div className="space-y-1">
                  <label className={labelCls}>Status</label>
                  <select name="status" defaultValue={concept?.status ?? "Active"} className={fieldCls}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* ── RIGHT PANEL: Why (psychology + admin) ── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Psicología</p>

              {/* Awareness */}
              <div className="space-y-1">
                <label className={labelCls}>Awareness Stage</label>
                <select name="awareness_stage" defaultValue={concept?.awareness_stage ?? ""} className={fieldCls}>
                  <option value="">—</option>
                  {[1,2,3,4,5].map((n) => (
                    <option key={n} value={n}>{n} — {AWARENESS_LABELS[n]}</option>
                  ))}
                </select>
              </div>

              {/* Emotional insight */}
              <div className="space-y-1">
                <label className={labelCls}>Insight emocional</label>
                <textarea name="emotional_insight" defaultValue={concept?.emotional_insight ?? ""} rows={3} placeholder="Tensión interna del buyer persona" className={fieldCls} />
              </div>

              {/* Central tension */}
              <div className="space-y-1">
                <label className={labelCls}>Tensión central</label>
                <textarea name="central_tension" defaultValue={concept?.central_tension ?? ""} rows={3} placeholder="El conflicto que el ad resuelve" className={fieldCls} />
              </div>

              {/* Mechanism */}
              <div className="space-y-1">
                <label className={labelCls}>Mecanismo psicológico</label>
                <textarea name="mechanism" defaultValue={concept?.mechanism ?? ""} rows={2} placeholder="Por qué este ángulo funciona para esta persona" className={fieldCls} />
              </div>

              {/* References */}
              <div className="space-y-1">
                <label className={labelCls}>Referencias / Inspiración</label>
                <textarea name="ref_links" defaultValue={concept?.ref_links ?? ""} rows={2} placeholder="Links o descripciones de referencia" className={fieldCls} />
              </div>

              {/* Insight — admin only */}
              {isAdminOrSubadmin && (
                <div className="space-y-1 border-t pt-3">
                  <label className={cn(labelCls, "flex items-center gap-1")}>
                    <Star className="w-3 h-3 text-amber-500" />
                    Insight estratégico (solo admin/subadmin)
                  </label>
                  <textarea name="insight" defaultValue={concept?.insight ?? ""} rows={3} placeholder="Qué funcionó, qué no, aprendizajes del ciclo" className={fieldCls} />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between pt-4 mt-2 border-t gap-2">
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
