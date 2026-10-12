"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { createConcept, updateConcept, deleteConcept, autofillConcept } from "@/lib/actions/creatives"
import { ANGLE_GUIDE, AWARENESS_LABELS, CONCEPT_STATUS_COLORS } from "@/lib/constants/creatives"
import type { BrandLine, CreativeConcept, CreativeAsset, FunnelStage } from "@/lib/types"
import { Trash2, ArrowUpRight, Wand2, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Crear / editar concepto. Arriba: la línea de producto (chips de color) y
// "describe tu idea" para que la IA rellene todo. Abajo, en tres bloques:
// a quién (persona, principio), el ángulo (tarjetas con su guía a la vista,
// funnel y awareness como selector) y el mecanismo (dolor, objeción, por qué
// funciona, transformación). Nada de menús con "— seleccionar —".

const FUNNEL: { v: FunnelStage; label: string; hint: string }[] = [
  { v: "TOF", label: "TOF", hint: "Frío" },
  { v: "MOF", label: "MOF", hint: "Consideración" },
  { v: "BOF", label: "BOF", hint: "Conversión" },
]
const STATUSES = ["Active", "Archived", "Transmuted", "Evergreen"] as const

interface ConceptModalProps {
  projectId: string
  cycleId: string | null
  concept?: CreativeConcept | null
  assets?: CreativeAsset[]
  isAdminOrSubadmin: boolean
  open: boolean
  brandLineId?: string | null
  brandBrainId?: string | null
  brandLines?: BrandLine[]
  onRefresh?: () => void
  onClose: () => void
  onNewAsset?: () => void
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <p className="text-xs font-medium text-muted-foreground">
      {children}{hint && <span className="font-normal text-muted-foreground/70"> · {hint}</span>}
    </p>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T | ""; options: { v: T; label: string; hint?: string }[]; onChange: (v: T | "") => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 flex-wrap">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(value === o.v ? "" : o.v)} title={o.hint}
          className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", value === o.v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {o.label}{o.hint && <span className="hidden sm:inline font-normal text-muted-foreground"> · {o.hint}</span>}
        </button>
      ))}
    </div>
  )
}

export function ConceptModal({ projectId, cycleId, concept, isAdminOrSubadmin, open, brandLineId, brandBrainId, brandLines = [], onRefresh, onClose }: ConceptModalProps) {
  const isEdit = !!concept
  const [isPending, startTransition] = useTransition()
  const [ideaText, setIdeaText] = useState("")
  const [isAutofilling, setIsAutofilling] = useState(false)
  const [autofilled, setAutofilled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lineId, setLineId] = useState<string | null>(concept?.brand_line_id ?? brandLineId ?? null)

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
    status:               concept?.status ?? "Active",
    insight:              concept?.insight ?? "",
  })
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }))
  const guide = ANGLE_GUIDE.find((a) => a.name === form.angle_type)
  const brainId = (lineId ? (brandLines.find((l) => l.id === lineId) as (BrandLine & { brand_brain_id?: string }) | undefined)?.brand_brain_id : null) ?? brandBrainId ?? undefined

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.target_persona.trim()) { setError("Falta la persona objetivo."); return }
    setError(null)
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.set(k, v))
    if (cycleId) fd.set("cycle_id", cycleId)
    if (lineId) fd.set("brand_line_id", lineId)
    startTransition(async () => {
      try {
        if (isEdit) await updateConcept(concept.id, projectId, fd)
        else await createConcept(projectId, fd)
        onRefresh?.(); onClose()
      } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    })
  }

  function remove() {
    if (!concept || !confirm("¿Eliminar este concepto?")) return
    startTransition(async () => { await deleteConcept(concept.id, projectId); onRefresh?.(); onClose() })
  }

  async function autofill() {
    if (!ideaText.trim() || isAutofilling) return
    setIsAutofilling(true); setError(null)
    try {
      const r = await autofillConcept(ideaText.trim(), brainId, lineId ?? undefined)
      setForm((p) => ({
        ...p,
        name: r.name ?? p.name, organizing_principle: r.organizing_principle ?? p.organizing_principle, target_persona: r.target_persona ?? p.target_persona,
        angle_type: r.angle_type ?? p.angle_type, awareness_stage: String(r.awareness_stage ?? p.awareness_stage), funnel_stage: r.funnel_stage ?? p.funnel_stage,
        pain_point: r.pain_point ?? p.pain_point, objection: r.objection ?? p.objection, why_it_works: r.why_it_works ?? p.why_it_works, transformation: r.transformation ?? p.transformation,
      }))
      setAutofilled(true)
    } catch { setError("No se pudo rellenar con IA. Intenta de nuevo o llena los campos.") }
    finally { setIsAutofilling(false) }
  }

  const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
  const section = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
  const lineColor = (id: string | null) => brandLines.find((l) => l.id === id)?.color ?? null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(820px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <form onSubmit={submit}>
          {/* Encabezado */}
          <div className="px-6 pt-5 pb-4 border-b border-border space-y-3">
            <div className="flex items-center gap-2 pr-8">
              <DialogTitle className="text-lg">{isEdit ? "Editar concepto" : "Nuevo concepto"}</DialogTitle>
              {isEdit && <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", CONCEPT_STATUS_COLORS[concept.status])}>{concept.status}</span>}
            </div>
            {concept?.parent && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><ArrowUpRight className="w-3.5 h-3.5" />Evolución de <b className="font-medium">{concept.parent.angle_type ?? "concepto anterior"}</b></p>
            )}
            {brandLines.length > 0 && (
              <div className="space-y-1.5">
                <p className={section}>Línea de producto</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...brandLines.map((l) => ({ id: l.id as string | null, name: l.name, color: l.color })), { id: null, name: "General", color: null }].map((l) => {
                    const on = lineId === l.id
                    return (
                      <button key={l.id ?? "general"} type="button" onClick={() => setLineId(l.id)} title={l.name}
                        className={cn("h-8 px-3 max-w-[240px] rounded-full border text-sm inline-flex items-center gap-1.5 transition-colors", on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40")}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color ?? "currentColor", opacity: l.color ? 1 : 0.4 }} />
                        <span className="truncate">{l.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* IA */}
            {!isEdit && (
              <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5"><Wand2 className="w-4 h-4 text-violet-500" />Describe la idea y la IA llena todo</p>
                <AutoTextarea value={ideaText} onChange={(e) => setIdeaText(e.target.value)} rows={2} disabled={isAutofilling}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); autofill() } }}
                  placeholder="Ej. Empresas que hacen team building en Chicago y quieren algo distinto a la cena de siempre…"
                  className={cn(input, "resize-none bg-background")} />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={autofill} disabled={isAutofilling || !ideaText.trim()}
                    className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-violet-700 disabled:opacity-50">
                    {isAutofilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}{isAutofilling ? "Rellenando…" : "Rellenar con IA"}
                  </button>
                  {autofilled && <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" />Listo, revisa y ajusta abajo</span>}
                  <span className="text-[11px] text-muted-foreground ml-auto">Usa la marca y la línea elegida</span>
                </div>
              </div>
            )}

            {/* A quién */}
            <section className="space-y-3">
              <p className={section}>A quién</p>
              <div className="space-y-1">
                <Label>Nombre del concepto</Label>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. Más allá de la cena de negocios" className={cn(input, "text-base font-medium")} />
              </div>
              <div className="space-y-1">
                <Label hint="demografía, situación, contexto">Persona objetivo</Label>
                <AutoTextarea value={form.target_persona} onChange={(e) => set("target_persona", e.target.value)} rows={2} placeholder="Ej. Profesional de RRHH en empresa mediana de Chicago, 30–45 años" className={cn(input, "resize-none")} />
              </div>
              <div className="space-y-1">
                <Label>Parte de</Label>
                <Segmented value={form.organizing_principle as "Pain-First" | "Desire-First" | ""} onChange={(v) => set("organizing_principle", v)}
                  options={[{ v: "Pain-First", label: "Un dolor" }, { v: "Desire-First", label: "Un deseo" }]} />
              </div>
            </section>

            {/* Ángulo */}
            <section className="space-y-3">
              <p className={section}>Ángulo</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {ANGLE_GUIDE.map((a) => (
                  <button key={a.name} type="button" onClick={() => set("angle_type", form.angle_type === a.name ? "" : a.name)} title={a.guiding_question}
                    className={cn("rounded-lg border px-2 py-2 text-left text-xs leading-tight transition-colors", form.angle_type === a.name ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/30")}>
                    <span className="block text-base leading-none mb-1">{a.emoji}</span>{a.name}
                  </button>
                ))}
              </div>
              {guide && (
                <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs space-y-1">
                  <p><b>{guide.guiding_question}</b> {guide.mechanism}</p>
                  <p className="text-muted-foreground">Cuándo: {guide.when_to_use}</p>
                  <p className="text-muted-foreground italic">“{guide.hook_example}”</p>
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div className="space-y-1">
                  <Label>Funnel</Label>
                  <Segmented value={form.funnel_stage as FunnelStage | ""} onChange={(v) => set("funnel_stage", v)} options={FUNNEL} />
                </div>
                <div className="space-y-1">
                  <Label hint={form.awareness_stage ? AWARENESS_LABELS[Number(form.awareness_stage)] : "1 no sabe del problema · 5 listo para comprar"}>Awareness</Label>
                  <Segmented value={form.awareness_stage as "1" | "2" | "3" | "4" | "5" | ""} onChange={(v) => set("awareness_stage", v)}
                    options={(["1", "2", "3", "4", "5"] as const).map((n) => ({ v: n, label: n }))} />
                </div>
              </div>
            </section>

            {/* Mecanismo */}
            <section className="space-y-3">
              <p className={section}>Mecanismo</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {([
                  ["pain_point", "Dolor", "el problema que activa la atención"],
                  ["objection", "Objeción", "lo que frena la compra"],
                  ["why_it_works", "Por qué funciona", "por qué resuena con esta persona"],
                  ["transformation", "Transformación", "el antes y después"],
                ] as const).map(([k, label, hint]) => (
                  <div key={k} className="space-y-1">
                    <Label hint={hint}>{label}</Label>
                    <AutoTextarea value={form[k]} onChange={(e) => set(k, e.target.value)} rows={2} className={cn(input, "resize-none")} />
                  </div>
                ))}
              </div>
            </section>

            {isEdit && (
              <section className="space-y-3 border-t border-border pt-5">
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Segmented value={form.status as (typeof STATUSES)[number]} onChange={(v) => v && set("status", v)} options={STATUSES.map((s) => ({ v: s, label: s }))} />
                </div>
                {isAdminOrSubadmin && (
                  <div className="space-y-1">
                    <Label hint="qué funcionó y qué no · solo equipo">Insight estratégico</Label>
                    <AutoTextarea value={form.insight} onChange={(e) => set("insight", e.target.value)} rows={2} className={cn(input, "resize-none")} />
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Pie */}
          <div className="px-6 py-3 border-t border-border bg-background flex items-center gap-2 sticky bottom-0 z-10">
            {isEdit && isAdminOrSubadmin && (
              <button type="button" onClick={remove} disabled={isPending} className="h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center justify-center" title="Eliminar concepto"><Trash2 className="w-4 h-4" /></button>
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
            <span className="flex-1" />
            <button type="button" onClick={onClose} disabled={isPending} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
            <button type="submit" disabled={isPending || !isAdminOrSubadmin} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{isEdit ? "Guardar" : "Crear concepto"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
