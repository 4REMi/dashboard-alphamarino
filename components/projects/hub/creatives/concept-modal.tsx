"use client"

import { useState, useTransition, Fragment } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { createConcept, updateConcept, promoteConcept, deleteConcept } from "@/lib/actions/creatives"
import { ANGLE_GUIDE, AWARENESS_LABELS, CONCEPT_STATUS_COLORS, PRODUCTION_STATUS_COLORS, VERDICT_COLORS } from "@/lib/constants/creatives"
import type { CreativeConcept, CreativeAsset, FunnelStage } from "@/lib/types"
import { Sparkles, Star, ChevronDown, ChevronUp, Trash2, ArrowUpRight, Plus, Info, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const ORGANIZING_PRINCIPLES = ["Pain-First", "Desire-First"] as const
const FUNNEL_STAGES: FunnelStage[] = ["TOF", "MOF", "BOF"]
const STATUSES = ["Active", "Archived", "Transmuted", "Evergreen"] as const

const STEPS = [
  { label: "Identificación" },
  { label: "Ángulo" },
  { label: "Mecanismo" },
] as const

interface ConceptModalProps {
  projectId: string
  cycleId: string | null
  concept?: CreativeConcept | null
  assets?: CreativeAsset[]
  isAdminOrSubadmin: boolean
  open: boolean
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

export function ConceptModal({ projectId, cycleId, concept, assets, isAdminOrSubadmin, open, onRefresh, onClose, onNewAsset }: ConceptModalProps) {
  const isEdit = !!concept
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(0)
  const [showAngleGuide, setShowAngleGuide] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name:                 concept?.name ?? "",
    organizing_principle: concept?.organizing_principle ?? "",
    product_service:      concept?.product_service ?? "",
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

  function goNext() {
    if (step === 0) {
      if (!form.target_persona.trim()) { setStepError("La persona objetivo es obligatoria."); return }
    }
    setStepError(null)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goPrev() {
    setStepError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.set(k, v))
    if (cycleId) fd.set("cycle_id", cycleId)
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

        {/* Stepper */}
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => (
            <Fragment key={i}>
              <button
                type="button"
                onClick={() => { if (i < step) { setStepError(null); setStep(i) } }}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium transition-colors",
                  i === step ? "text-primary" :
                  i < step  ? "text-muted-foreground hover:text-foreground cursor-pointer" :
                              "text-muted-foreground/40 cursor-default"
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 transition-all",
                  i === step ? "bg-primary text-primary-foreground border-primary" :
                  i < step  ? "bg-muted border-muted-foreground/30 text-muted-foreground" :
                              "border-muted-foreground/20 text-muted-foreground/40"
                )}>
                  {i < step ? <Check className="w-2.5 h-2.5" /> : i + 1}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  "flex-1 h-px mx-3 transition-colors",
                  i < step ? "bg-muted-foreground/30" : "bg-border"
                )} />
              )}
            </Fragment>
          ))}
        </div>

        <form onSubmit={handleSubmit}>

          {/* ── Step 1: Identificación + Principio ── */}
          {step === 0 && (
            <div className="space-y-4">

              <div className="space-y-1">
                <FieldLabel
                  label="Nombre del concepto"
                  tooltip="Un título corto y descriptivo para identificar este concepto en la tabla. Opcional pero recomendado."
                />
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Ej. Miedo al olvido — dueño de cafetería"
                  className={fieldCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <FieldLabel
                    label="Principio organizador"
                    tooltip="Pain-First parte del dolor del buyer persona. Desire-First parte de su aspiración."
                  />
                  <select value={form.organizing_principle} onChange={(e) => set("organizing_principle", e.target.value)} className={fieldCls}>
                    <option value="">— seleccionar —</option>
                    {ORGANIZING_PRINCIPLES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <FieldLabel
                    label="Producto / Servicio"
                    tooltip="El producto o servicio específico que se promueve en este concepto."
                  />
                  <input
                    value={form.product_service}
                    onChange={(e) => set("product_service", e.target.value)}
                    placeholder="Ej. App de fidelización"
                    className={fieldCls}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <FieldLabel
                  label="Persona objetivo"
                  required
                  tooltip="Descripción específica de quién ve este anuncio: demografía, situación, industria o contexto de vida."
                />
                <input
                  value={form.target_persona}
                  onChange={(e) => set("target_persona", e.target.value)}
                  placeholder="Ej. Dueño de cafetería en México, 35-50 años, quiere fidelizar clientes"
                  className={fieldCls}
                />
              </div>

            </div>
          )}

          {/* ── Step 2: Ángulo + Awareness ── */}
          {step === 1 && (
            <div className="space-y-4">

              <div className="space-y-1">
                <FieldLabel
                  label="Tipo de ángulo"
                  tooltip="El mecanismo psicológico que estructura el mensaje del anuncio."
                />
                <select
                  value={form.angle_type}
                  onChange={(e) => { set("angle_type", e.target.value); setShowAngleGuide(false) }}
                  className={fieldCls}
                >
                  <option value="">— seleccionar —</option>
                  {ANGLE_GUIDE.map((a) => <option key={a.name} value={a.name}>{a.emoji} {a.name}</option>)}
                </select>
              </div>

              {/* Angle guide accordion */}
              {form.angle_type && guideEntry && (
                <div className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 bg-purple-50/60 text-xs font-medium text-purple-700 hover:bg-purple-50"
                    onClick={() => setShowAngleGuide((v) => !v)}
                  >
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
                  <FieldLabel
                    label="Awareness Stage"
                    tooltip="Qué tan consciente está la persona del problema y la solución. 1 = No sabe que tiene el problema · 5 = Lista para comprar."
                  />
                  <select value={form.awareness_stage} onChange={(e) => set("awareness_stage", e.target.value)} className={fieldCls}>
                    <option value="">—</option>
                    {[1,2,3,4,5].map((n) => (
                      <option key={n} value={n}>{n} — {AWARENESS_LABELS[n]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <FieldLabel
                    label="Funnel Stage"
                    tooltip="TOF = Top of Funnel (frío). MOF = Middle (consideración). BOF = Bottom (conversión)."
                  />
                  <select value={form.funnel_stage} onChange={(e) => set("funnel_stage", e.target.value)} className={fieldCls}>
                    <option value="">—</option>
                    {FUNNEL_STAGES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

            </div>
          )}

          {/* ── Step 3: Mecanismo ── */}
          {step === 2 && (
            <div className="space-y-4">

              <div className="space-y-1">
                <FieldLabel
                  label="¿Por qué funciona?"
                  tooltip="Por qué este ángulo resuena emocionalmente con esta persona en este contexto. El fundamento de que el mensaje convierte."
                />
                <AutoTextarea
                  value={form.why_it_works}
                  onChange={(e) => set("why_it_works", e.target.value)}
                  rows={2}
                  placeholder="Ej. El ángulo de consecuencia funciona porque el dueño de cafetería ya sintió el dolor del cliente que no vuelve, solo necesita que alguien lo nombre."
                  className={fieldCls}
                />
              </div>

              <div className="space-y-1">
                <FieldLabel
                  label="Pain Point"
                  tooltip="El problema concreto o dolor que activa la atención. Algo que la persona siente aunque no lo haya verbalizado."
                />
                <AutoTextarea
                  value={form.pain_point}
                  onChange={(e) => set("pain_point", e.target.value)}
                  rows={2}
                  placeholder="Ej. Sus clientes lo visitan una vez y no vuelven — trabaja duro sin resultado acumulado."
                  className={fieldCls}
                />
              </div>

              <div className="space-y-1">
                <FieldLabel
                  label="Objeción principal"
                  tooltip="La resistencia o duda que el buyer persona tiene antes de actuar. Lo que el ad debe superar."
                />
                <AutoTextarea
                  value={form.objection}
                  onChange={(e) => set("objection", e.target.value)}
                  rows={2}
                  placeholder="Ej. 'Ya intenté una app de puntos y mis clientes no la usaron.'"
                  className={fieldCls}
                />
              </div>

              <div className="space-y-1">
                <FieldLabel
                  label="Transformación"
                  tooltip="El cambio o resultado que el ad promete. El 'antes y después' del buyer persona si toma acción."
                />
                <AutoTextarea
                  value={form.transformation}
                  onChange={(e) => set("transformation", e.target.value)}
                  rows={2}
                  placeholder="Ej. Pasa de depender del cliente nuevo a tener un flujo constante de clientes recurrentes."
                  className={fieldCls}
                />
              </div>

              <div className="space-y-1">
                <FieldLabel
                  label="Referencias / Inspiración"
                  tooltip="Links o descripciones de ads que inspiran este concepto."
                />
                <AutoTextarea
                  value={form.ref_links}
                  onChange={(e) => set("ref_links", e.target.value)}
                  rows={2}
                  placeholder="Links o descripciones de referencia"
                  className={fieldCls}
                />
              </div>

              {isEdit && (
                <div className="space-y-1">
                  <FieldLabel label="Status" />
                  <select value={form.status} onChange={(e) => set("status", e.target.value)} className={fieldCls}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Assets linked to this concept */}
              {isEdit && assets !== undefined && (
                <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      Assets{assets.length > 0 ? ` (${assets.length})` : ""}
                    </p>
                    {onNewAsset && isAdminOrSubadmin && (
                      <button
                        type="button"
                        onClick={onNewAsset}
                        className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Nuevo asset
                      </button>
                    )}
                  </div>
                  {assets.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin assets aún</p>
                  ) : (
                    <div className="space-y-1">
                      {assets.map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-background">
                          <span className="text-muted-foreground truncate mr-2">
                            {[a.format, a.platform, [a.variant, a.iteration].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "Sin detalle"}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Badge className={cn("text-xs border-0 h-4 px-1.5", PRODUCTION_STATUS_COLORS[a.production_status] ?? "bg-gray-100 text-gray-600")}>
                              {a.production_status}
                            </Badge>
                            {a.verdict && (
                              <Badge className={cn("text-xs border-0 h-4 px-1.5", VERDICT_COLORS[a.verdict] ?? "")}>
                                {a.verdict}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Insight — admin only */}
              {isAdminOrSubadmin && (
                <div className="space-y-1 border-t pt-3">
                  <FieldLabel
                    label="Insight estratégico"
                    tooltip="Post-ciclo: qué funcionó, qué no, qué probar diferente. Solo visible para admin y subadmin."
                  />
                  <div className="flex items-center gap-1 mb-1">
                    <Star className="w-3 h-3 text-amber-500" />
                    <span className="text-xs text-muted-foreground">Solo admin / subadmin</span>
                  </div>
                  <AutoTextarea
                    value={form.insight}
                    onChange={(e) => set("insight", e.target.value)}
                    rows={3}
                    placeholder="Qué funcionó, qué no, aprendizajes del ciclo"
                    className={fieldCls}
                  />
                </div>
              )}
            </div>
          )}

          {stepError && (
            <p className="text-xs text-destructive mt-1">{stepError}</p>
          )}

          {/* Footer */}
          <DialogFooter className="flex items-center justify-between pt-4 mt-4 border-t gap-2">
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
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              {step > 0 && (
                <Button key="prev" type="button" variant="outline" size="sm" onClick={goPrev} disabled={isPending}>
                  ← Anterior
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button key="next" type="button" size="sm" onClick={goNext} disabled={isPending}>
                  Siguiente →
                </Button>
              ) : (
                <Button key="submit" type="submit" size="sm" disabled={isPending || !isAdminOrSubadmin}>
                  {isPending ? "Guardando..." : isEdit ? "Guardar" : "Crear concepto"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
