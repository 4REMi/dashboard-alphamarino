"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  Brain, Image, Layers, Sparkles, Link2, Copy, Check,
  ChevronRight, ChevronLeft, Loader2, ExternalLink,
} from "lucide-react"
import type { CreativeConcept, BrandBrain, CreativeBrief, BriefContent } from "@/lib/types"
import { createBrief, generateBriefContent } from "@/lib/actions/creatives"

interface SavedAdRef {
  id: string
  page_name: string | null
  body: string | null
  cached_image_url: string | null
  image_url: string | null
  format: string | null
}

interface BoardRef {
  id: string
  name: string
  ad_count: number
  preview_ads?: { cached_image_url: string | null; image_url: string | null }[]
}

interface Props {
  concept: CreativeConcept
  projectId: string
  brandBrains: BrandBrain[]
  savedAds: SavedAdRef[]
  boards: BoardRef[]
  onClose: () => void
  onCreated: (brief: CreativeBrief) => void
}

const STEPS = ["Brand Brain", "Referencias", "Generar Brief"] as const

export function BriefCreator({
  concept, projectId, brandBrains, savedAds, boards, onClose, onCreated,
}: Props) {
  const [step, setStep] = useState(0)
  const [selectedBrainId, setSelectedBrainId] = useState("")
  const [selectedAdIds, setSelectedAdIds] = useState<string[]>([])
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([])
  const [generatedBrief, setGeneratedBrief] = useState<CreativeBrief | null>(null)
  const [briefContent, setBriefContent] = useState<BriefContent | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const canProceed = step === 0 ? !!selectedBrainId : true

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      handleGenerate()
    }
  }

  function handleGenerate() {
    startTransition(async () => {
      const brief = await createBrief(projectId, concept.id, selectedBrainId, selectedAdIds, selectedBoardIds)
      setGeneratedBrief(brief)
      const content = await generateBriefContent(brief.id)
      setBriefContent(content)
    })
  }

  function handleCopyLink() {
    if (!generatedBrief) return
    const url = `${window.location.origin}/share/brief/${generatedBrief.share_token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function toggleAd(id: string) {
    setSelectedAdIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }
  function toggleBoard(id: string) {
    setSelectedBoardIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const selectedBrain = brandBrains.find((b) => b.id === selectedBrainId)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Crear Brief — {concept.name ?? concept.angle_type ?? "Concepto"}
          </DialogTitle>
          {/* Step indicators */}
          {!briefContent && (
            <div className="flex items-center gap-2 pt-2">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full transition-colors",
                    i === step ? "bg-primary text-primary-foreground font-medium" :
                    i < step ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* STEP 0: Select Brand Brain */}
          {step === 0 && !briefContent && (
            <div className="space-y-3">
              <Label>Selecciona el Brand Brain de la marca</Label>
              <div className="grid gap-2 max-h-[400px] overflow-y-auto">
                {brandBrains.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No hay Brand Brains creados. Crea uno en Ad Lab primero.
                  </p>
                )}
                {brandBrains.map((brain) => (
                  <button
                    key={brain.id}
                    type="button"
                    onClick={() => setSelectedBrainId(brain.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                      selectedBrainId === brain.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/30 hover:bg-muted/30"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Brain className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{brain.name}</p>
                      {brain.industry && (
                        <p className="text-xs text-muted-foreground truncate">{brain.industry}</p>
                      )}
                    </div>
                    {selectedBrainId === brain.id && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 1: Attach References */}
          {step === 1 && !briefContent && (
            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-1.5 mb-2">
                  <Image className="w-3.5 h-3.5" />
                  Creativos guardados (opcional)
                </Label>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                  {savedAds.length === 0 && (
                    <p className="text-xs text-muted-foreground col-span-2 py-4 text-center">Sin creativos guardados</p>
                  )}
                  {savedAds.map((ad) => (
                    <button
                      key={ad.id}
                      type="button"
                      onClick={() => toggleAd(ad.id)}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all",
                        selectedAdIds.includes(ad.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      {(ad.cached_image_url || ad.image_url) && (
                        <img src={ad.cached_image_url || ad.image_url!} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      )}
                      <span className="truncate flex-1">{ad.page_name ?? "Ad"}</span>
                      {selectedAdIds.includes(ad.id) && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="flex items-center gap-1.5 mb-2">
                  <Layers className="w-3.5 h-3.5" />
                  Boards (opcional)
                </Label>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                  {boards.length === 0 && (
                    <p className="text-xs text-muted-foreground col-span-2 py-4 text-center">Sin boards</p>
                  )}
                  {boards.map((board) => (
                    <button
                      key={board.id}
                      type="button"
                      onClick={() => toggleBoard(board.id)}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all",
                        selectedBoardIds.includes(board.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <span className="truncate flex-1">{board.name}</span>
                      <span className="text-muted-foreground">{board.ad_count}</span>
                      {selectedBoardIds.includes(board.id) && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Generate / Loading */}
          {step === 2 && !briefContent && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              {isPending ? (
                <>
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Generando brief enriquecido...</p>
                  <p className="text-xs text-muted-foreground/60">Combinando concepto + Brand Brain + referencias</p>
                </>
              ) : (
                <>
                  <Sparkles className="w-8 h-8 text-primary/30" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">Listo para generar</p>
                    <p className="text-xs text-muted-foreground">
                      Concepto: <strong>{concept.name ?? concept.angle_type}</strong>
                      {selectedBrain && <> + Brain: <strong>{selectedBrain.name}</strong></>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedAdIds.length > 0 && `${selectedAdIds.length} referencia(s) `}
                      {selectedBoardIds.length > 0 && `${selectedBoardIds.length} board(s)`}
                      {selectedAdIds.length === 0 && selectedBoardIds.length === 0 && "Sin referencias adicionales"}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* RESULT: Brief generated */}
          {briefContent && (
            <div className="space-y-4">
              {/* Share link */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Link2 className="w-4 h-4 text-primary flex-shrink-0" />
                <Input
                  readOnly
                  value={generatedBrief ? `${window.location.origin}/share/brief/${generatedBrief.share_token}` : ""}
                  className="flex-1 text-xs bg-transparent border-0 focus-visible:ring-0 p-0 h-auto"
                />
                <Button size="sm" variant="ghost" onClick={handleCopyLink} className="h-7 px-2">
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </Button>
                {generatedBrief && (
                  <a href={`/share/brief/${generatedBrief.share_token}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost" className="h-7 px-2">
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </a>
                )}
              </div>

              {/* Brief content */}
              <div className="space-y-3">
                <BriefSection title="Resumen" content={briefContent.summary} />
                <BriefSection title="Racional estratégico" content={briefContent.strategy_rationale} />
                <BriefSection title="Mensajes clave" list={briefContent.key_messages} />
                <BriefSection title="Dirección de tono" content={briefContent.tone_direction} />
                <BriefSection title="Dirección visual" content={briefContent.visual_direction} />
                {briefContent.reference_insights && (
                  <BriefSection title="Insights de referencias" content={briefContent.reference_insights} />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <BriefSection title="Hacer" list={briefContent.do_list} variant="success" />
                  <BriefSection title="No hacer" list={briefContent.dont_list} variant="destructive" />
                </div>
                <BriefSection title="Formatos sugeridos" list={briefContent.suggested_formats} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!briefContent && step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={isPending}>
              <ChevronLeft className="w-3.5 h-3.5 mr-1" />
              Atrás
            </Button>
          )}
          {!briefContent && (
            <Button
              onClick={handleNext}
              disabled={!canProceed || isPending}
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : step === STEPS.length - 1 ? (
                <Sparkles className="w-3.5 h-3.5 mr-1" />
              ) : null}
              {step === STEPS.length - 1 ? "Generar Brief" : "Siguiente"}
            </Button>
          )}
          {briefContent && generatedBrief && (
            <Button onClick={() => { onCreated(generatedBrief); onClose() }}>
              Listo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BriefSection({
  title, content, list, variant,
}: {
  title: string
  content?: string
  list?: string[]
  variant?: "success" | "destructive"
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      {content && <p className="text-sm">{content}</p>}
      {list && list.length > 0 && (
        <ul className="space-y-0.5">
          {list.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm">
              <span className={cn(
                "mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0",
                variant === "success" ? "bg-emerald-500" :
                variant === "destructive" ? "bg-destructive" : "bg-primary"
              )} />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
