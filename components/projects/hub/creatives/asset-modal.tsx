"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { createAsset, updateAsset, deleteAsset, generateAssetCopy, toggleClientVisible } from "@/lib/actions/creatives"
import { PRODUCTION_STATUS_COLORS, VERDICT_COLORS } from "@/lib/constants/creatives"
import type { CreativeAsset, CreativeConcept } from "@/lib/types"
import { ExternalLink, Trash2, Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AutoTextarea } from "@/components/ui/auto-textarea"

const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Pinterest Ads"]
const STATUSES  = ["Pending", "In Production", "In Review", "Approved", "Published"] as const
const VERDICTS  = ["Winner", "Scale", "Iterate", "Archive"] as const

type MediaType = "Video" | "Imagen" | ""
const VIDEO_SUBTYPES = ["VO + B-roll", "UGC", "Other"] as const
const IMAGEN_SUBTYPES = ["Static", "Carousel"] as const
const COPY_LENGTH_OPTIONS = ["~100 palabras", "~150 palabras", "~200 palabras", "~300 palabras"]
const SIZE_RATIO_OPTIONS = ["1:1", "4:5", "9:16", "16:9"]
const LANGUAGES = [{ value: "es", label: "ES" }, { value: "en", label: "EN" }]

function deriveMediaType(format: string | null): MediaType {
  if (!format) return ""
  if (["VO + B-roll", "UGC", "Other"].includes(format)) return "Video"
  if (["Static", "Carousel"].includes(format)) return "Imagen"
  // Legacy mapping
  if (format.toLowerCase().includes("video") || format === "Reel" || format === "Story") return "Video"
  if (format === "Static" || format === "Carousel") return "Imagen"
  return ""
}

function normalizeSubType(format: string | null): string {
  if (!format) return ""
  if (format === "Video B-roll+VO") return "VO + B-roll"
  if (format === "Video UGC") return "UGC"
  if (format === "Story" || format === "Reel") return "Other"
  return format
}

interface AssetModalProps {
  projectId: string
  cycleId: string | null
  asset?: CreativeAsset | null
  concepts: CreativeConcept[]
  defaultConceptId?: string | null
  isAdminOrSubadmin: boolean
  open: boolean
  onClose: () => void
}

export function AssetModal({ projectId, cycleId, asset, concepts, defaultConceptId, isAdminOrSubadmin, open, onClose }: AssetModalProps) {
  const isEdit = !!asset
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isGenerating, startGenerate] = useTransition()
  const [isToggling, startToggle] = useTransition()

  // Concept + platform
  const [selectedConceptId, setSelectedConceptId] = useState(
    asset?.concept_id ?? defaultConceptId ?? ""
  )
  const [selectedPlatform, setSelectedPlatform] = useState(asset?.platform ?? "")

  // Format selection
  const [mediaType, setMediaType] = useState<MediaType>(deriveMediaType(asset?.format ?? null))
  const [subType, setSubType]     = useState(normalizeSubType(asset?.format ?? null))

  // Universal copy fields
  const [hook, setHook] = useState(asset?.hook ?? "")
  const [copy, setCopy] = useState(asset?.copy ?? "")
  const [cta,  setCta]  = useState(asset?.cta  ?? "")

  // format_meta fields — VO + B-roll
  const [copyLength,  setCopyLength]  = useState((asset?.format_meta?.copy_length as string) ?? "~150 palabras")
  const [voScript,    setVoScript]    = useState((asset?.format_meta?.vo_script   as string) ?? "")
  const [brollNotes,  setBrollNotes]  = useState(() => {
    const raw = asset?.format_meta?.broll_notes
    if (!raw) return ""
    if (Array.isArray(raw)) return (raw as string[]).join("\n")
    return raw as string
  })
  // format_meta fields — UGC
  const [talentBrief, setTalentBrief] = useState((asset?.format_meta?.talent_brief as string) ?? "")
  // AI generation options
  const [language,    setLanguage]    = useState((asset?.format_meta?.language as string) ?? "es")
  // format_meta fields — Static
  const [sizeRatio,   setSizeRatio]   = useState((asset?.format_meta?.size_ratio as string) ?? "1:1")
  const [visualDesc,  setVisualDesc]  = useState((asset?.format_meta?.visual_description as string) ?? "")
  // format_meta fields — Carousel
  const [slideCount,  setSlideCount]  = useState(String(asset?.format_meta?.slide_count ?? "5"))
  const [slidesBrief, setSlidesBrief] = useState((asset?.format_meta?.slides_brief as string) ?? "")
  // format_meta fields — Other
  const [prodNotes,   setProdNotes]   = useState((asset?.format_meta?.production_notes as string) ?? "")

  function handleMediaTypeChange(mt: MediaType) {
    setMediaType(mt)
    setSubType("")
  }

  function buildFormatMeta(): Record<string, unknown> {
    const brollArr = brollNotes.split("\n").map((s) => s.trim()).filter(Boolean)
    switch (subType) {
      case "VO + B-roll": return { copy_length: copyLength, language, vo_script: voScript, broll_notes: brollArr }
      case "UGC":         return { copy_length: copyLength, language, talent_brief: talentBrief }
      case "Static":      return { language, size_ratio: sizeRatio, visual_description: visualDesc }
      case "Carousel":    return { language, slide_count: slideCount ? Number(slideCount) : null, slides_brief: slidesBrief }
      case "Other":       return { language, production_notes: prodNotes }
      default:            return {}
    }
  }

  function handleGenerate() {
    if (!selectedConceptId || !subType) return
    startGenerate(async () => {
      const result = await generateAssetCopy(projectId, selectedConceptId, subType, selectedPlatform || null, language, copyLength)
      setHook(result.hook)
      setCopy(result.copy)
      setCta(result.cta)
      const meta = result.format_meta
      if (meta.vo_script)          setVoScript(meta.vo_script as string)
      if (meta.broll_notes) {
        const raw = meta.broll_notes
        setBrollNotes(Array.isArray(raw) ? (raw as string[]).join("\n") : raw as string)
      }
      if (meta.talent_brief)       setTalentBrief(meta.talent_brief as string)
      if (meta.visual_description) setVisualDesc(meta.visual_description as string)
      if (meta.size_ratio)         setSizeRatio(meta.size_ratio as string)
      if (meta.slide_count)        setSlideCount(String(meta.slide_count))
      if (meta.slides_brief)       setSlidesBrief(meta.slides_brief as string)
      if (meta.production_notes)   setProdNotes(meta.production_notes as string)
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (cycleId) fd.set("cycle_id", cycleId)
    fd.set("hook", hook)
    fd.set("copy", copy)
    fd.set("cta",  cta)
    fd.set("format", subType)
    fd.set("format_meta", JSON.stringify(buildFormatMeta()))
    startTransition(async () => {
      if (isEdit) {
        await updateAsset(asset.id, projectId, fd)
      } else {
        await createAsset(projectId, fd)
      }
      router.refresh()
      onClose()
    })
  }

  function handleDelete() {
    if (!asset) return
    if (!confirm("¿Eliminar este asset?")) return
    startTransition(async () => {
      await deleteAsset(asset.id, projectId)
      router.refresh()
      onClose()
    })
  }

  // Client visibility state (edit only)
  const [clientVisible, setClientVisible] = useState(asset?.client_visible ?? false)
  const clientStatus   = asset?.client_status ?? null
  const clientFeedback = asset?.client_feedback ?? null

  function handleToggleClientVisible() {
    if (!asset) return
    const next = !clientVisible
    setClientVisible(next)
    startToggle(async () => {
      await toggleClientVisible(asset.id, projectId, next)
      router.refresh()
    })
  }

  const fieldCls = "w-full text-sm border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
  const labelCls = "text-xs font-medium text-muted-foreground"
  const canGenerate = !!selectedConceptId && !!subType && isAdminOrSubadmin

  const subTypes = mediaType === "Video" ? VIDEO_SUBTYPES : mediaType === "Imagen" ? IMAGEN_SUBTYPES : []

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Asset" : "Nuevo Asset"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Concepto padre */}
          <div className="space-y-1">
            <label className={labelCls}>Concepto padre</label>
            <select
              name="concept_id"
              value={selectedConceptId}
              onChange={(e) => setSelectedConceptId(e.target.value)}
              className={fieldCls}
            >
              <option value="">Sin concepto</option>
              {concepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.angle_type ?? "Sin nombre"} · {c.angle_type ?? "—"}
                </option>
              ))}
            </select>
          </div>

          {/* Plataforma */}
          <div className="space-y-1">
            <label className={labelCls}>Plataforma</label>
            <select
              name="platform"
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className={fieldCls}
            >
              <option value="">—</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* ── Formato ── */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Formato</p>

            {/* Media type toggle */}
            <div className="flex gap-2">
              {(["Video", "Imagen"] as MediaType[]).map((mt) => (
                <button
                  key={mt}
                  type="button"
                  onClick={() => handleMediaTypeChange(mt)}
                  className={cn(
                    "flex-1 py-2 rounded-md text-sm font-medium border transition-colors",
                    mediaType === mt
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/50"
                  )}
                >
                  {mt === "Video" ? "🎬 Video" : "🖼️ Imagen"}
                </button>
              ))}
            </div>

            {/* Sub-type pills */}
            {mediaType && (
              <div className="flex flex-wrap gap-2">
                {subTypes.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSubType(st)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                      subType === st
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/50"
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}

            {/* Format-specific fields */}
            {subType === "VO + B-roll" && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className={labelCls}>Extensión del guión</label>
                  <div className="flex gap-2 flex-wrap">
                    {COPY_LENGTH_OPTIONS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setCopyLength(l)}
                        className={cn(
                          "px-3 py-1 rounded text-xs border transition-colors",
                          copyLength === l ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Guión de voz en off (VO Script)</label>
                  <AutoTextarea
                    value={voScript}
                    onChange={(e) => setVoScript(e.target.value)}
                    rows={4}
                    placeholder="Guión completo listo para grabar…"
                    className={cn(fieldCls, isGenerating && "opacity-50")}
                    disabled={isGenerating}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Escenas de B-roll <span className="text-muted-foreground/60 font-normal">(una por línea)</span></label>
                  <AutoTextarea
                    value={brollNotes}
                    onChange={(e) => setBrollNotes(e.target.value)}
                    rows={4}
                    placeholder={"Plano cenital de cancha de pádel vacía al amanecer\nClose-up de raqueta golpeando la pelota en cámara lenta\n…"}
                    className={cn(fieldCls, isGenerating && "opacity-50")}
                    disabled={isGenerating}
                  />
                </div>
              </div>
            )}

            {subType === "UGC" && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className={labelCls}>Extensión del copy</label>
                  <div className="flex gap-2 flex-wrap">
                    {COPY_LENGTH_OPTIONS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setCopyLength(l)}
                        className={cn(
                          "px-3 py-1 rounded text-xs border transition-colors",
                          copyLength === l ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Briefing para el creator</label>
                  <AutoTextarea
                    value={talentBrief}
                    onChange={(e) => setTalentBrief(e.target.value)}
                    rows={5}
                    placeholder="Tono de voz, key points obligatorios, dos &amp; don'ts…"
                    className={cn(fieldCls, isGenerating && "opacity-50")}
                    disabled={isGenerating}
                  />
                </div>
              </div>
            )}

            {subType === "Static" && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className={labelCls}>Ratio</label>
                  <div className="flex gap-2 flex-wrap">
                    {SIZE_RATIO_OPTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setSizeRatio(r)}
                        className={cn(
                          "px-3 py-1 rounded text-xs border transition-colors",
                          sizeRatio === r ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Descripción visual (art direction)</label>
                  <AutoTextarea
                    value={visualDesc}
                    onChange={(e) => setVisualDesc(e.target.value)}
                    rows={3}
                    placeholder="Qué muestra la imagen, jerarquía visual, estilo…"
                    className={cn(fieldCls, isGenerating && "opacity-50")}
                    disabled={isGenerating}
                  />
                </div>
              </div>
            )}

            {subType === "Carousel" && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className={labelCls}>Número de slides</label>
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={slideCount}
                    onChange={(e) => setSlideCount(e.target.value)}
                    className={cn(fieldCls, "w-24")}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Estructura de slides</label>
                  <AutoTextarea
                    value={slidesBrief}
                    onChange={(e) => setSlidesBrief(e.target.value)}
                    rows={5}
                    placeholder="Slide 1: Problema — …&#10;Slide 2: …"
                    className={cn(fieldCls, isGenerating && "opacity-50")}
                    disabled={isGenerating}
                  />
                </div>
              </div>
            )}

            {subType === "Other" && (
              <div className="space-y-1 pt-1">
                <label className={labelCls}>Notas de producción</label>
                <AutoTextarea
                  value={prodNotes}
                  onChange={(e) => setProdNotes(e.target.value)}
                  rows={3}
                  placeholder="Instrucciones de producción, dirección creativa…"
                  className={cn(fieldCls, isGenerating && "opacity-50")}
                  disabled={isGenerating}
                />
              </div>
            )}
          </div>

          {/* Variant + Iteration + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Variante</label>
              <input name="variant" defaultValue={asset?.variant ?? ""} placeholder="A, B, C…" className={fieldCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Iteración</label>
              <input name="iteration" defaultValue={asset?.iteration ?? ""} placeholder="v1, v2…" className={fieldCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Estado</label>
              <select name="production_status" defaultValue={asset?.production_status ?? "Pending"} className={fieldCls}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Copy section (universal) ── */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Copy del ad</p>
              <div className="flex items-center gap-2 ml-auto">
                {/* Language toggle */}
                <div className="flex rounded border overflow-hidden">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setLanguage(l.value)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-semibold transition-colors",
                        language === l.value
                          ? "bg-foreground text-background"
                          : "bg-background text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                {canGenerate && (
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50 transition-colors"
                  >
                    {isGenerating
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5" />
                    }
                    {isGenerating ? "Generando…" : "Generar con IA"}
                  </button>
                )}
                {!canGenerate && !subType && isAdminOrSubadmin && (
                  <span className="text-xs text-muted-foreground">Selecciona formato y concepto para generar</span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelCls}>Hook</label>
              <AutoTextarea
                name="hook"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                rows={2}
                placeholder="Primera línea del anuncio"
                className={cn(fieldCls, isGenerating && "opacity-50")}
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Copy</label>
              <AutoTextarea
                name="copy"
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                rows={4}
                placeholder="Cuerpo del anuncio"
                className={cn(fieldCls, isGenerating && "opacity-50")}
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>CTA</label>
              <input
                name="cta"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Ej. Comprar ahora, Ver más"
                className={cn(fieldCls, isGenerating && "opacity-50")}
                disabled={isGenerating}
              />
            </div>
          </div>

          {/* Asset URL */}
          <div className="space-y-1">
            <label className={labelCls}>Link del asset</label>
            <div className="relative">
              <input name="asset_url" defaultValue={asset?.asset_url ?? ""} placeholder="Drive, Frame.io, Dropbox…" className={cn(fieldCls, "pr-8")} />
              {asset?.asset_url && (
                <a href={asset.asset_url} target="_blank" rel="noopener noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Performance metrics — admin only */}
          {isAdminOrSubadmin && (
            <div className="border-t pt-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground">Métricas de performance</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: "ctr",   label: "CTR (%)",  val: asset?.ctr },
                  { name: "cpc",   label: "CPC ($)",  val: asset?.cpc },
                  { name: "cpm",   label: "CPM ($)",  val: asset?.cpm },
                  { name: "roas",  label: "ROAS",     val: asset?.roas },
                  { name: "cpa",   label: "CPA ($)",  val: asset?.cpa },
                  { name: "spend", label: "Spend ($)", val: asset?.spend },
                ].map(({ name, label, val }) => (
                  <div key={name} className="space-y-1">
                    <label className={labelCls}>{label}</label>
                    <input type="number" step="0.01" name={name} defaultValue={val ?? ""} placeholder="0" className={fieldCls} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={labelCls}>Resultados</label>
                  <input type="number" name="results" defaultValue={asset?.results ?? ""} placeholder="0" className={fieldCls} />
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Tipo de resultado</label>
                  <input name="results_type" defaultValue={asset?.results_type ?? ""} placeholder="ventas, leads, clics…" className={fieldCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={labelCls}>Veredicto</label>
                  <select name="verdict" defaultValue={asset?.verdict ?? ""} className={fieldCls}>
                    <option value="">Sin veredicto</option>
                    {VERDICTS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Notas de veredicto</label>
                  <AutoTextarea name="verdict_notes" defaultValue={asset?.verdict_notes ?? ""} rows={2} placeholder="Qué funcionó, qué cambiar" className={fieldCls} />
                </div>
              </div>
            </div>
          )}

          {/* ── Aprobación del cliente (edit + admin only) ── */}
          {isEdit && isAdminOrSubadmin && (
            <div className={cn(
              "border rounded-lg p-3 space-y-2",
              clientVisible ? "border-blue-200 bg-blue-50/40" : "bg-muted/20"
            )}>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Aprobación del cliente</p>
                  <p className="text-xs text-muted-foreground">
                    {clientVisible ? "Visible en la página del cliente" : "No visible para el cliente aún"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={clientVisible}
                  disabled={isToggling}
                  onClick={handleToggleClientVisible}
                  className={cn(
                    "relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                    clientVisible ? "bg-blue-500" : "bg-muted-foreground/30"
                  )}
                >
                  <span className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                    clientVisible ? "translate-x-[18px]" : "translate-x-[2px]"
                  )} />
                </button>
              </div>

              {clientVisible && (
                <div className={cn(
                  "text-xs rounded-md px-3 py-2 font-medium",
                  clientStatus === "approved"           && "bg-emerald-100 text-emerald-700",
                  clientStatus === "changes_requested"  && "bg-amber-100 text-amber-700",
                  clientStatus === "pending_review"     && "bg-blue-100 text-blue-600",
                  !clientStatus                         && "bg-blue-100 text-blue-600",
                )}>
                  {clientStatus === "approved"          && "✅ Aprobado por el cliente"}
                  {clientStatus === "changes_requested" && "💬 El cliente pidió cambios"}
                  {(clientStatus === "pending_review" || !clientStatus) && "⏳ Esperando respuesta del cliente…"}
                </div>
              )}

              {clientStatus === "changes_requested" && clientFeedback && (
                <div className="text-xs bg-white border border-amber-200 rounded-md px-3 py-2 text-foreground leading-relaxed">
                  <span className="font-medium text-muted-foreground">Feedback: </span>{clientFeedback}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between pt-2">
            <div>
              {isEdit && isAdminOrSubadmin && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={isPending}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={isPending || isGenerating || !isAdminOrSubadmin}>
                {isPending ? "Guardando..." : isEdit ? "Guardar" : "Crear asset"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
