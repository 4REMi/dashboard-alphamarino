"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { getBrandBrains } from "@/lib/actions/brand-brains"
import { getConceptsByBrandBrain } from "@/lib/actions/creatives"
import {
  proposeScratchIdeas, getScratchIdeas, updateScratchIdea, discardScratchIdea,
  approveScratchIdeasAndGenerate,
} from "@/lib/actions/ad-scratch"
import { pollImageGeneration, finalizeImageClone } from "@/lib/actions/image-clone"
import type { BrandBrain, ScratchAdIdea } from "@/lib/types"
import { Sparkles, Loader2, X, Pencil, Check, ImageIcon, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const ASPECT_RATIOS = ["1:1", "9:16", "16:9", "4:5"] as const
const RATIO_LABELS: Record<string, string> = {
  "1:1": "Cuadrado", "9:16": "Vertical (Stories)", "16:9": "Horizontal", "4:5": "Portrait",
}

type BrainOption = Pick<BrandBrain, "id" | "name">
type ConceptOption = Awaited<ReturnType<typeof getConceptsByBrandBrain>>[number]

function ideaText(idea: ScratchAdIdea) {
  return {
    headline: idea.edited_headline ?? idea.headline,
    copyAngle: idea.edited_copy_angle ?? idea.copy_angle,
    visualDescription: idea.edited_visual_description ?? idea.visual_description,
  }
}

export function ScratchStudio() {
  const [brains, setBrains] = useState<BrainOption[]>([])
  const [brainId, setBrainId] = useState("")
  const [concepts, setConcepts] = useState<ConceptOption[]>([])
  const [conceptId, setConceptId] = useState<string | null>(null)
  const [brief, setBrief] = useState("")
  const [ideas, setIdeas] = useState<ScratchAdIdea[]>([])
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isProposing, startProposing] = useTransition()
  const [isGenerating, startGenerating] = useTransition()

  const [aspectRatio, setAspectRatio] = useState<string>("1:1")
  const [numImages, setNumImages] = useState(2)
  const [additionalContext, setAdditionalContext] = useState("")

  const [cloneIds, setCloneIds] = useState<string[]>([])

  useEffect(() => {
    getBrandBrains().then((all) => setBrains(all.map((b) => ({ id: b.id, name: b.name }))))
  }, [])

  function selectBrain(id: string) {
    setBrainId(id)
    setConceptId(null)
    setConcepts([])
    setIdeas([])
    setCloneIds([])
    getConceptsByBrandBrain(id).then(setConcepts)
  }

  function selectConcept(id: string | null) {
    setConceptId(id)
    setIdeas([])
    setCloneIds([])
    if (id) getScratchIdeas(brainId, id).then(setIdeas).catch(() => {})
  }

  // Recupera ideas ya propuestas en una sesión anterior para esta misma
  // marca + dirección libre (sin concepto), sin duplicar el estado de
  // "proponer más" — solo se dispara al salir del textarea, no en cada tecla.
  function handleBriefBlur() {
    const trimmed = brief.trim()
    if (!brainId || !trimmed || conceptId) return
    getScratchIdeas(brainId, null, trimmed).then(setIdeas).catch(() => {})
  }

  const canPropose = !!brainId && (!!conceptId || brief.trim().length > 0)

  function handlePropose() {
    if (!canPropose) return
    setError(null)
    startProposing(async () => {
      try {
        const created = await proposeScratchIdeas({ brandBrainId: brainId, conceptId, brief: conceptId ? undefined : brief })
        setIdeas((prev) => [...prev, ...created])
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron proponer ideas")
      }
    })
  }

  function toggleApproved(id: string) {
    setApprovedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleDiscard(id: string) {
    setIdeas((prev) => prev.filter((i) => i.id !== id))
    setApprovedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    discardScratchIdea(id).catch(() => {})
  }

  function handleSaveEdit(id: string, patch: { headline: string; copy_angle: string; visual_description: string }) {
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, edited_headline: patch.headline, edited_copy_angle: patch.copy_angle, edited_visual_description: patch.visual_description, status: "edited" } : i))
    setEditingId(null)
    updateScratchIdea(id, patch).catch(() => {})
  }

  function handleGenerate() {
    if (approvedIds.size === 0) return
    setError(null)
    startGenerating(async () => {
      try {
        const { cloneIds: created } = await approveScratchIdeasAndGenerate(Array.from(approvedIds), {
          aspectRatio, numImages, additionalContext: additionalContext.trim(),
        })
        setCloneIds(created)
        setIdeas((prev) => prev.filter((i) => !approvedIds.has(i.id)))
        setApprovedIds(new Set())
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo iniciar la generación")
      }
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Setup */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">1. Elige la marca y la dirección</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Brand Brain</label>
            <select
              value={brainId}
              onChange={(e) => selectBrain(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecciona una marca</option>
              {brains.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {brainId && concepts.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Concepto (opcional)</label>
              <select
                value={conceptId ?? ""}
                onChange={(e) => selectConcept(e.target.value || null)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Sin concepto — dirección libre</option>
                {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {brainId && !conceptId && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Dirección libre — de qué debe tratar el creativo
            </label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onBlur={handleBriefBlur}
              rows={2}
              placeholder="Ej. Promocionar el envío gratis en compras arriba de $500, tono urgente…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        )}

        {brainId && (
          <button
            onClick={handlePropose}
            disabled={!canPropose || isProposing}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isProposing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {ideas.length > 0 ? "Proponer más ideas" : "Proponer ideas"}
          </button>
        )}
      </div>

      {/* Ideas */}
      {ideas.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">2. Revisa, edita y aprueba las que quieras generar</h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                approved={approvedIds.has(idea.id)}
                editing={editingId === idea.id}
                onToggleApprove={() => toggleApproved(idea.id)}
                onStartEdit={() => setEditingId(idea.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(patch) => handleSaveEdit(idea.id, patch)}
                onDiscard={() => handleDiscard(idea.id)}
              />
            ))}
          </div>

          {approvedIds.size > 0 && (
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                {approvedIds.size} idea{approvedIds.size > 1 ? "s" : ""} aprobada{approvedIds.size > 1 ? "s" : ""} — configura la generación
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Aspect ratio</label>
                  <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {ASPECT_RATIOS.map((r) => <option key={r} value={r}>{RATIO_LABELS[r]} ({r})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Variantes por idea</label>
                  <input type="number" min={1} max={4} value={numImages} onChange={(e) => setNumImages(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Contexto adicional (opcional)</label>
                  <input value={additionalContext} onChange={(e) => setAdditionalContext(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                Generar {approvedIds.size} imagen{approvedIds.size > 1 ? "es" : ""}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Generation review — one card per approved idea, generating independently */}
      {cloneIds.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">3. Revisa lo generado</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {cloneIds.map((id) => <GenerationJobCard key={id} cloneId={id} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function IdeaCard({ idea, approved, editing, onToggleApprove, onStartEdit, onCancelEdit, onSaveEdit, onDiscard }: {
  idea: ScratchAdIdea
  approved: boolean
  editing: boolean
  onToggleApprove: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (patch: { headline: string; copy_angle: string; visual_description: string }) => void
  onDiscard: () => void
}) {
  const text = ideaText(idea)
  const [headline, setHeadline] = useState(text.headline)
  const [copyAngle, setCopyAngle] = useState(text.copyAngle)
  const [visualDescription, setVisualDescription] = useState(text.visualDescription)

  if (editing) {
    return (
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
        <input value={headline} onChange={(e) => setHeadline(e.target.value)}
          className="w-full rounded border border-input bg-background px-2 py-1 text-sm font-medium" placeholder="Headline" />
        <textarea value={copyAngle} onChange={(e) => setCopyAngle(e.target.value)} rows={2}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs resize-none" placeholder="Ángulo de copy" />
        <textarea value={visualDescription} onChange={(e) => setVisualDescription(e.target.value)} rows={3}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs resize-none" placeholder="Descripción visual" />
        <div className="flex justify-end gap-2">
          <button onClick={onCancelEdit} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
          <button
            onClick={() => onSaveEdit({ headline, copy_angle: copyAngle, visual_description: visualDescription })}
            className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Guardar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2 transition-colors",
      approved ? "border-primary bg-primary/5" : "border-border"
    )}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{text.headline}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onStartEdit} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDiscard} className="p-1 rounded text-muted-foreground hover:text-destructive" title="Descartar">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{text.copyAngle}</p>
      <p className="text-xs text-foreground/80 leading-relaxed">{text.visualDescription}</p>
      {idea.brand_elements_used.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {idea.brand_elements_used.map((el, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{el}</span>
          ))}
        </div>
      )}
      <button
        onClick={onToggleApprove}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition-colors",
          approved ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
        )}
      >
        {approved && <Check className="w-3.5 h-3.5" />}
        {approved ? "Aprobada para generar" : "Aprobar para generar"}
      </button>
    </div>
  )
}

// Self-contained poll + review for ONE approved idea's image_clones row —
// generation already started server-side (approveScratchIdeasAndGenerate),
// this only polls and lets the user accept/discard/finalize, reusing the
// exact same actions the reference-clone flow uses (image-clone.ts) since
// they only ever operate by cloneId.
function GenerationJobCard({ cloneId }: { cloneId: string }) {
  const [status, setStatus] = useState<"generating" | "reviewing" | "done" | "error">("generating")
  const [generatedUrls, setGeneratedUrls] = useState<string[]>([])
  const [keptUrls, setKeptUrls] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    pollingRef.current = setInterval(async () => {
      try {
        const result = await pollImageGeneration(cloneId)
        if (result.status === "reviewing") {
          clearInterval(pollingRef.current!)
          const urls = result.generated_image_urls ?? []
          setGeneratedUrls(urls)
          setKeptUrls(new Set(urls))
          setStatus("reviewing")
        } else if (result.status === "error") {
          clearInterval(pollingRef.current!)
          setErrorMessage(result.error_message ?? "Error en la generación")
          setStatus("error")
        }
      } catch { /* network hiccup, keep polling */ }
    }, 5000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [cloneId])

  function toggleKept(url: string) {
    setKeptUrls((prev) => { const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n })
  }

  function handleFinalize() {
    setIsFinalizing(true)
    const kept = generatedUrls.filter((u) => keptUrls.has(u))
    finalizeImageClone(cloneId, kept)
      .then(() => setStatus("done"))
      .catch((err) => setErrorMessage(String(err)))
      .finally(() => setIsFinalizing(false))
  }

  if (status === "generating") {
    return (
      <div className="rounded-lg border border-border p-6 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Generando…
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {errorMessage}
      </div>
    )
  }

  if (status === "done") {
    return (
      <div className="rounded-lg border border-border p-4 grid grid-cols-2 gap-2">
        {generatedUrls.filter((u) => keptUrls.has(u)).map((url) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt="" className="rounded-md w-full aspect-square object-cover" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {generatedUrls.map((url) => (
          <button key={url} onClick={() => toggleKept(url)} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className={cn(
              "rounded-md w-full aspect-square object-cover border-2 transition-colors",
              keptUrls.has(url) ? "border-primary" : "border-transparent opacity-40"
            )} />
            {keptUrls.has(url) && (
              <span className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5">
                <Check className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleFinalize}
          disabled={isFinalizing}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isFinalizing ? "Guardando…" : `Guardar ${keptUrls.size} imagen${keptUrls.size !== 1 ? "es" : ""}`}
        </button>
      </div>
    </div>
  )
}
