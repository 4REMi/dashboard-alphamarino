"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Brain, Sparkles, Copy, Check, Loader2, ExternalLink, RotateCcw, PenLine, ChevronLeft } from "lucide-react"
import type { CreativeConcept, BrandBrain, CreativeBrief, AdCloneLine } from "@/lib/types"
import {
  generateScriptDrafts, saveScriptDrafts, saveManualScript,
  addScriptDraftsToBrief, addManualScriptToBrief,
} from "@/lib/actions/creatives"
import { SCRIPT_STRUCTURES, type ScriptStructureKey } from "@/lib/constants/creatives"

interface Props {
  concept: CreativeConcept
  projectId: string
  brandBrains: BrandBrain[]
  projectBrandBrainId?: string
  // When set, scripts are appended to this brief instead of creating a new
  // one — lets an admin build up several script options (manual and/or AI)
  // under a single share link.
  existingBrief?: CreativeBrief
  onClose: () => void
  onCreated: (brief: CreativeBrief) => void
}

type Step = "choice" | "config" | "manual" | "preview" | "success"

export function QuickScriptModal({ concept, projectId, brandBrains, projectBrandBrainId, existingBrief, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("choice")
  const [selectedBrainId, setSelectedBrainId] = useState(existingBrief?.brand_brain_id ?? projectBrandBrainId ?? "")
  const [structureKey, setStructureKey] = useState<ScriptStructureKey | null>(null)
  const [drafts, setDrafts] = useState<AdCloneLine[][]>([])
  const [keep, setKeep] = useState<boolean[]>([])
  const [manualText, setManualText] = useState("")
  const [generatedBrief, setGeneratedBrief] = useState<CreativeBrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleGenerate() {
    if (!selectedBrainId || !structureKey) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await generateScriptDrafts(concept.id, selectedBrainId, structureKey, 3)
        setDrafts(result)
        setKeep(result.map(() => true))
        setStep("preview")
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar el guión")
      }
    })
  }

  function handleSave() {
    const kept = drafts.filter((_, i) => keep[i])
    if (kept.length === 0) return
    setError(null)
    startTransition(async () => {
      try {
        const brief = existingBrief
          ? await addScriptDraftsToBrief(existingBrief.id, projectId, kept)
          : await saveScriptDrafts(projectId, concept.id, selectedBrainId, kept)
        setGeneratedBrief(brief)
        setStep("success")
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el brief")
      }
    })
  }

  function handleSaveManual() {
    if (!selectedBrainId || !manualText.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        const brief = existingBrief
          ? await addManualScriptToBrief(existingBrief.id, projectId, manualText)
          : await saveManualScript(projectId, concept.id, selectedBrainId, manualText)
        setGeneratedBrief(brief)
        setStep("success")
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el brief")
      }
    })
  }

  function handleCopyLink() {
    if (!generatedBrief) return
    const url = `${window.location.origin}/share/brief/${generatedBrief.share_token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const structure = SCRIPT_STRUCTURES.find((s) => s.key === structureKey)
  const keptCount = keep.filter(Boolean).length

  // ── Success ──
  if (step === "success" && generatedBrief) {
    const shareUrl = `${window.location.origin}/share/brief/${generatedBrief.share_token}`
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">{existingBrief ? "Guión agregado" : "Brief creado"}</p>
              <p className="text-xs text-muted-foreground">
                {keptCount > 0
                  ? `${keptCount} guión${keptCount !== 1 ? "es" : ""} listo${keptCount !== 1 ? "s" : ""} para revisar y aprobar`
                  : "Guión listo para revisar y aprobar"}
              </p>
            </div>
            <div className="w-full flex items-center gap-1.5 p-2 rounded-lg bg-muted/50 border">
              <input readOnly value={shareUrl} className="flex-1 text-xs bg-transparent border-0 outline-none truncate" />
              <Button size="sm" variant="ghost" onClick={handleCopyLink} className="h-7 px-2 flex-shrink-0">
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </Button>
              <a href={`/share/brief/${generatedBrief.share_token}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="h-7 px-2">
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            </div>
            <Button className="w-full" onClick={() => { onCreated(generatedBrief); onClose() }}>
              Listo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ── Preview ──
  if (step === "preview") {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-violet-500" />
              {drafts.length} guión{drafts.length !== 1 ? "es" : ""} generado{drafts.length !== 1 ? "s" : ""} — {structure?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Nada se ha guardado todavía. Desmarca las opciones que no te convencen antes de {existingBrief ? "agregarlas al brief" : "crear el brief"}.
          </p>

          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {drafts.map((lines, i) => (
              <div key={i} className={cn("border rounded-xl overflow-hidden transition-opacity", !keep[i] && "opacity-40")}>
                <label className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keep[i]}
                    onChange={() => setKeep((prev) => prev.map((k, idx) => idx === i ? !k : k))}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-xs font-semibold">Opción {i + 1}</span>
                  <span className="text-xs text-muted-foreground ml-auto">Guardar esta opción</span>
                </label>
                <div className="px-4 py-3 space-y-2">
                  {lines.map((line, j) => (
                    <div key={j} className="flex gap-2 text-xs">
                      <span className="w-4 h-4 rounded-full bg-foreground text-background text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{j + 1}</span>
                      <p className="leading-relaxed">{line.adapted}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button variant="outline" onClick={handleGenerate} disabled={isPending}>
              {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
              Regenerar
            </Button>
            <Button onClick={handleSave} disabled={keptCount === 0 || isPending}>
              {isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
              {existingBrief ? "Agregar" : "Crear brief con"} {keptCount} guión{keptCount !== 1 ? "es" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ── Choice ──
  if (step === "choice") {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Agregar guión — {concept.name ?? concept.angle_type ?? "Concepto"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setStep("config")}
              className="w-full flex items-start gap-3 text-left px-4 py-3 rounded-lg border border-border hover:border-violet-300 hover:bg-violet-50/40 transition-all"
            >
              <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Guión con IA</p>
                <p className="text-xs text-muted-foreground mt-0.5">Genera 3 variantes desde cero usando la estrategia del concepto.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setStep("manual")}
              className="w-full flex items-start gap-3 text-left px-4 py-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/40 transition-all"
            >
              <PenLine className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Guión manual</p>
                <p className="text-xs text-muted-foreground mt-0.5">Pega o escribe un guión ya redactado, sin generación por IA.</p>
              </div>
            </button>
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ── Manual ──
  if (step === "manual") {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <button type="button" onClick={() => setStep("choice")} className="text-muted-foreground hover:text-foreground -ml-1">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <PenLine className="w-4 h-4 text-muted-foreground" />
              Guión manual — {concept.name ?? concept.angle_type ?? "Concepto"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!projectBrandBrainId && !existingBrief && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Brand Brain</p>
                {brandBrains.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                    No hay Brand Brains. Crea uno en Ad Lab.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {brandBrains.map((brain) => (
                      <button
                        key={brain.id}
                        type="button"
                        onClick={() => setSelectedBrainId(brain.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all",
                          selectedBrainId === brain.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary font-medium"
                            : "border-border hover:border-primary/30"
                        )}
                      >
                        {brain.logo_square_url || brain.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={brain.logo_square_url || brain.logo_url!} alt="" className="w-5 h-5 rounded object-contain" />
                        ) : (
                          <Brain className="w-3.5 h-3.5 text-primary/60" />
                        )}
                        {brain.name}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Guión</p>
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                rows={10}
                placeholder="Pega o escribe el guión completo aquí…"
                className="w-full text-sm rounded-lg border border-input bg-background px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </section>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSaveManual} disabled={!selectedBrainId || !manualText.trim() || isPending}>
              {isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Guardando…</>
              ) : (
                <><Check className="w-3.5 h-3.5 mr-1.5" />{existingBrief ? "Agregar al brief" : "Crear brief"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // ── Config ──
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <button type="button" onClick={() => setStep("choice")} className="text-muted-foreground hover:text-foreground -ml-1">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <Sparkles className="w-4 h-4 text-violet-500" />
            Guión con IA — {concept.name ?? concept.angle_type ?? "Concepto"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Se generarán <strong>3 guiones</strong> desde cero usando la estrategia ya cargada de este concepto (persona, dolor, transformación, objeción) — sin necesidad de un video de referencia.
          </p>

          {!projectBrandBrainId && !existingBrief && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Brand Brain</p>
              {brandBrains.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                  No hay Brand Brains. Crea uno en Ad Lab.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {brandBrains.map((brain) => (
                    <button
                      key={brain.id}
                      type="button"
                      onClick={() => setSelectedBrainId(brain.id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all",
                        selectedBrainId === brain.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary font-medium"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      {brain.logo_square_url || brain.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={brain.logo_square_url || brain.logo_url!} alt="" className="w-5 h-5 rounded object-contain" />
                      ) : (
                        <Brain className="w-3.5 h-3.5 text-primary/60" />
                      )}
                      {brain.name}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Estructura del guión <span className="font-normal normal-case">— elige una</span>
            </p>
            <div className="space-y-1.5">
              {SCRIPT_STRUCTURES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStructureKey(s.key)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg border transition-all",
                    structureKey === s.key
                      ? "border-violet-500 bg-violet-50/60 ring-1 ring-violet-400"
                      : "border-border hover:border-violet-300"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{s.engine}</span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground mt-1">
                    {s.beats.join(" → ")}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={!selectedBrainId || !structureKey || isPending}>
            {isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generando 3 guiones…</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Generar 3 guiones</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
