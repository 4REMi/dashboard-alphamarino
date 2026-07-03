"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Brain, Sparkles, Copy, Check, Loader2, ExternalLink } from "lucide-react"
import type { CreativeConcept, BrandBrain, CreativeBrief } from "@/lib/types"
import { generateScriptsFromConcept } from "@/lib/actions/creatives"
import { ANGLE_TO_STRUCTURE, SCRIPT_STRUCTURES, type AngleType } from "@/lib/constants/creatives"

interface Props {
  concept: CreativeConcept
  projectId: string
  brandBrains: BrandBrain[]
  projectBrandBrainId?: string
  onClose: () => void
  onCreated: (brief: CreativeBrief) => void
}

export function QuickScriptModal({ concept, projectId, brandBrains, projectBrandBrainId, onClose, onCreated }: Props) {
  const [selectedBrainId, setSelectedBrainId] = useState(projectBrandBrainId ?? "")
  const [generatedBrief, setGeneratedBrief] = useState<CreativeBrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const structureKey = concept.angle_type ? ANGLE_TO_STRUCTURE[concept.angle_type as AngleType] : "pas"
  const structure = SCRIPT_STRUCTURES.find((s) => s.key === structureKey) ?? SCRIPT_STRUCTURES[0]

  function handleGenerate() {
    if (!selectedBrainId) return
    setError(null)
    startTransition(async () => {
      try {
        const brief = await generateScriptsFromConcept(projectId, concept.id, selectedBrainId, 3)
        setGeneratedBrief(brief)
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar el guión")
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

  if (generatedBrief) {
    const shareUrl = `${window.location.origin}/share/brief/${generatedBrief.share_token}`
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">Guiones generados</p>
              <p className="text-xs text-muted-foreground">3 opciones listas para revisar y aprobar</p>
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Guión rápido — {concept.name ?? concept.angle_type ?? "Concepto"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-violet-50/50 border-violet-100 px-3 py-2.5">
            <p className="text-xs font-semibold text-violet-700 mb-0.5">{structure.name}</p>
            <p className="text-xs text-violet-600/80 leading-relaxed">
              Estructura elegida automáticamente por el ángulo del concepto ({concept.angle_type}). Motor: {structure.engine}.
            </p>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Se generarán <strong>3 guiones</strong> desde cero usando la estrategia ya cargada de este concepto (persona, dolor, transformación, objeción) — sin necesidad de un video de referencia.
          </p>

          {!projectBrandBrainId && (
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

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={!selectedBrainId || isPending}>
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
