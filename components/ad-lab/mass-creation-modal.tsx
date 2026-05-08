"use client"

import { useEffect, useRef, useState } from "react"
import type { SavedAd, BrandBrain, ImageCloneLine, AdCloneLine, MetaAdResult } from "@/lib/types"
import {
  startImageClone, generateImages, pollImageGeneration, checkAnguloCompatibility,
  uploadReferenceImages,
} from "@/lib/actions/image-clone"
import { startClone, pollClone, updateAdaptedLines as updateScriptLines } from "@/lib/actions/ad-clone"
import { getBrandBrains } from "@/lib/actions/brand-brains"
import { useRecentAngulos } from "@/lib/hooks/use-recent-angulos"
import {
  X, Loader2, Check, ChevronRight, ChevronLeft, AlertCircle,
  ImageIcon, Wand2, ChevronDown, Link2, Download, Compass, CheckCircle2, Layers,
  Upload, Trash2, Maximize2,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────

type CreationType   = "estaticos" | "guiones"
type MassItemStatus = "pending" | "analyzing" | "ready" | "error" | "generating" | "done"
type BrainOption    = Pick<BrandBrain, "id" | "name" | "brand_colors">
type Step           = 1 | 2 | 3

interface MassItem {
  ad:           SavedAd
  cloneId:      string | null
  shareToken:   string | null
  status:       MassItemStatus
  adaptedLines: (ImageCloneLine | AdCloneLine)[]
  generatedUrls: string[]
  errorMessage:  string | undefined
  expanded:      boolean
}

interface Props {
  ads:     SavedAd[]
  onClose: () => void
}

const ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9"] as const

// ── Helpers ───────────────────────────────────────────────────

function hasImage(ad: SavedAd): boolean { return !!(ad.cached_image_url ?? ad.image_url) }
function hasVideo(ad: SavedAd): boolean { return !!(ad.cached_video_url ?? ad.video_url) }

function toMetaAd(ad: SavedAd): MetaAdResult {
  if (ad.ad_snapshot) return ad.ad_snapshot as MetaAdResult
  const thumb = ad.cached_image_url ?? ad.image_url ?? null
  const video = ad.cached_video_url ?? ad.video_url ?? null
  return {
    ad_archive_id: ad.ad_archive_id, page_id: ad.page_id, page_name: ad.page_name,
    is_active: ad.status === "active",
    start_date: null, end_date: null, start_date_formatted: null, end_date_formatted: null,
    publisher_platform: [], spend: null, currency: null,
    snapshot: {
      page_name: ad.page_name, page_profile_picture_url: null,
      body: ad.body ? { text: ad.body } : null,
      cards: [{ body: ad.body, title: null, link_url: null, cta_text: null,
        original_image_url: thumb, resized_image_url: thumb,
        video_hd_url: video, video_sd_url: null, video_preview_image_url: thumb }],
      cta_text: null, display_format: null, link_url: null, page_like_count: null,
      images: [], videos: [],
    },
    impressions_with_index: null, ad_library_url: ad.snapshot_url, total: 0,
  } as MetaAdResult
}

function itemStatusColor(s: MassItemStatus) {
  if (s === "done")       return "bg-emerald-100 text-emerald-700"
  if (s === "error")      return "bg-red-100 text-red-700"
  if (s === "ready")      return "bg-violet-100 text-violet-700"
  if (s === "generating") return "bg-amber-100 text-amber-700"
  return "bg-muted text-muted-foreground"
}

function itemStatusLabel(s: MassItemStatus) {
  if (s === "analyzing")  return "Analizando…"
  if (s === "ready")      return "Listo"
  if (s === "error")      return "Error"
  if (s === "generating") return "Generando…"
  if (s === "done")       return "Generado"
  return "Pendiente"
}

// ── Component ─────────────────────────────────────────────────

export function MassCreationModal({ ads, onClose }: Props) {
  const [step, setStep]           = useState<Step>(1)
  const [type, setType]           = useState<CreationType>("estaticos")
  const [brains, setBrains]       = useState<BrainOption[]>([])
  const [brainId, setBrainId]     = useState("")
  const [angulo, setAngulo]       = useState("")
  const [anguloAdvisory, setAnguloAdvisory] = useState<{ compatible: boolean; note: string } | null>(null)
  const [isCheckingAdvisory, setIsCheckingAdvisory] = useState(false)
  const { recents: recentAngulos, saveAngulo } = useRecentAngulos()

  // Estáticos config
  const [aspectRatio, setAspectRatio]         = useState("1:1")
  const [useBrandColor, setUseBrandColor]     = useState(false)
  const [brandColor, setBrandColor]           = useState("#000000")
  const [refFiles, setRefFiles]               = useState<File[]>([])
  const [additionalContext, setAdditionalContext] = useState("")
  const [numImages, setNumImages]             = useState(1)
  const fileInputRef                          = useRef<HTMLInputElement>(null)

  // Items + refs (ref mirrors state for use inside intervals)
  const [items, setItems]   = useState<MassItem[]>([])
  const itemsRef            = useRef<MassItem[]>([])
  const pollRef             = useRef<NodeJS.Timeout | null>(null)
  const [isAnalyzing, setIsAnalyzing]   = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [lightboxIdx, setLightboxIdx]   = useState<number | null>(null)

  // Flat list of all generated images for lightbox navigation
  function getFlatIdx(adId: string, urlIdx: number): number {
    let idx = 0
    for (const it of itemsRef.current) {
      if (it.ad.id === adId) return idx + urlIdx
      idx += it.generatedUrls.length
    }
    return -1
  }

  useEffect(() => {
    if (lightboxIdx === null) return
    function onKey(e: KeyboardEvent) {
      const total = itemsRef.current.reduce((acc, it) => acc + it.generatedUrls.length, 0)
      if (e.key === "Escape")      setLightboxIdx(null)
      if (e.key === "ArrowRight")  setLightboxIdx((i) => i !== null && i < total - 1 ? i + 1 : i)
      if (e.key === "ArrowLeft")   setLightboxIdx((i) => i !== null && i > 0 ? i - 1 : i)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxIdx])

  useEffect(() => {
    getBrandBrains().then((all) =>
      setBrains(all.map((b) => ({ id: b.id, name: b.name, brand_colors: b.brand_colors })))
    )
  }, [])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  function updateItems(fn: (prev: MassItem[]) => MassItem[]) {
    setItems((prev) => {
      const next = fn(prev)
      itemsRef.current = next
      return next
    })
  }

  function selectBrain(b: BrainOption) {
    setBrainId(b.id)
    const colors = b.brand_colors ?? []
    if (colors.length > 0) { setBrandColor(colors[0].hex); setUseBrandColor(true) }
    else setUseBrandColor(false)
  }

  async function handleCheckAdvisory() {
    if (!brainId || !angulo.trim()) return
    setIsCheckingAdvisory(true)
    setAnguloAdvisory(null)
    try {
      setAnguloAdvisory(await checkAnguloCompatibility(brainId, angulo))
    } catch {
      setAnguloAdvisory({ compatible: true, note: "No se pudo evaluar la compatibilidad." })
    } finally {
      setIsCheckingAdvisory(false)
    }
  }

  async function handleAnalyze() {
    if (!brainId) return
    if (angulo.trim()) saveAngulo(angulo)
    setIsAnalyzing(true)

    // Build initial items
    const initial: MassItem[] = ads.map((ad) => {
      const compatible = type === "estaticos" ? hasImage(ad) : hasVideo(ad)
      return {
        ad, cloneId: null, shareToken: null,
        status: compatible ? "analyzing" : "error",
        adaptedLines: [], generatedUrls: [],
        errorMessage: compatible ? undefined : `Sin ${type === "estaticos" ? "imagen" : "video"} compatible`,
        expanded: false,
      }
    })
    itemsRef.current = initial
    setItems(initial)
    setStep(2)

    const anguloSnap = angulo.trim() || undefined

    if (type === "estaticos") {
      const results = await Promise.allSettled(
        initial.map((item) => {
          if (item.status === "error") return Promise.resolve(null)
          return startImageClone(toMetaAd(item.ad), brainId, anguloSnap)
        })
      )
      updateItems((prev) =>
        prev.map((item, i) => {
          if (item.status === "error" && !item.cloneId) return item
          const r = results[i]
          if (r.status === "rejected") return { ...item, status: "error", errorMessage: String(r.reason) }
          if (!r.value) return item
          const { cloneId, shareToken, lines } = r.value
          return {
            ...item, cloneId, shareToken, adaptedLines: lines,
            status: lines.length > 0 ? "ready" : "error",
            errorMessage: lines.length === 0 ? "No se encontró texto en el anuncio" : undefined,
          }
        })
      )
    } else {
      // Submit all to AssemblyAI
      const results = await Promise.allSettled(
        initial.map((item) => {
          if (item.status === "error") return Promise.resolve(null)
          return startClone(toMetaAd(item.ad), brainId)
        })
      )
      updateItems((prev) =>
        prev.map((item, i) => {
          if (item.status === "error") return item
          const r = results[i]
          if (r.status === "rejected") return { ...item, status: "error", errorMessage: String(r.reason) }
          if (!r.value) return item
          return { ...item, cloneId: r.value.cloneId, shareToken: r.value.shareToken }
        })
      )
      // Poll transcription/adaptation
      pollRef.current = setInterval(async () => {
        const pending = itemsRef.current.filter((it) => it.cloneId && it.status === "analyzing")
        if (pending.length === 0) { clearInterval(pollRef.current!); return }
        const pollResults = await Promise.allSettled(pending.map((it) => pollClone(it.cloneId!, anguloSnap)))
        updateItems((prev) =>
          prev.map((item) => {
            if (!item.cloneId || item.status !== "analyzing") return item
            const idx = pending.findIndex((p) => p.cloneId === item.cloneId)
            if (idx === -1) return item
            const pr = pollResults[idx]
            if (pr.status === "rejected") return item
            const clone = pr.value
            if (clone.status === "ready") return { ...item, status: "ready", adaptedLines: clone.adapted_lines ?? [] }
            if (clone.status === "error") return { ...item, status: "error", errorMessage: clone.error_message ?? "Error" }
            return item
          })
        )
      }, 3000)
    }

    setIsAnalyzing(false)
  }

  async function handleContinue() {
    const readyItems = itemsRef.current.filter((it) => it.status === "ready" && it.cloneId)

    if (type === "guiones") {
      await Promise.allSettled(
        readyItems.map((it) => updateScriptLines(it.cloneId!, it.adaptedLines as AdCloneLine[]))
      )
      setStep(3)
      return
    }

    // Estáticos: trigger generation for all ready
    setIsGenerating(true)
    updateItems((prev) => prev.map((it) => it.status === "ready" ? { ...it, status: "generating" } : it))
    setStep(3)

    await Promise.allSettled(
      readyItems.map(async (item) => {
        try {
          if (refFiles.length > 0) {
            const fd = new FormData()
            refFiles.forEach((f) => fd.append("files", f))
            await uploadReferenceImages(item.cloneId!, fd)
          }
          await generateImages(item.cloneId!, {
            adaptedLines: item.adaptedLines as ImageCloneLine[],
            brandColor: useBrandColor ? brandColor : null,
            aspectRatio,
            numImages,
            additionalContext: additionalContext.trim(),
          })
        } catch (err) {
          updateItems((prev) =>
            prev.map((it) => it.cloneId === item.cloneId ? { ...it, status: "error", errorMessage: String(err) } : it)
          )
        }
      })
    )

    // Poll image generation
    pollRef.current = setInterval(async () => {
      const generating = itemsRef.current.filter((it) => it.cloneId && it.status === "generating")
      if (generating.length === 0) { clearInterval(pollRef.current!); setIsGenerating(false); return }
      const pollResults = await Promise.allSettled(generating.map((it) => pollImageGeneration(it.cloneId!)))
      updateItems((prev) =>
        prev.map((item) => {
          if (!item.cloneId || item.status !== "generating") return item
          const idx = generating.findIndex((g) => g.cloneId === item.cloneId)
          if (idx === -1) return item
          const pr = pollResults[idx]
          if (pr.status === "rejected") return item
          const clone = pr.value
          if (clone.status === "done") {
            const urls = clone.generated_image_urls
            return { ...item, status: "done", generatedUrls: Array.isArray(urls) ? urls : urls ? [String(urls)] : [] }
          }
          if (clone.status === "error") return { ...item, status: "error", errorMessage: clone.error_message ?? "Error" }
          return item
        })
      )
    }, 5000)
  }

  const readyCount    = items.filter((it) => it.status === "ready").length
  const doneAnalyzing = items.length > 0 && items.every((it) => it.status !== "analyzing" && it.status !== "pending")
  const doneGenerating = items.length > 0 && items.every((it) => it.status !== "generating")

  // Compute flat image list for lightbox (from current items state)
  const allGenerated = items.flatMap((item) =>
    item.generatedUrls.map((url, variantIdx) => ({ url, item, variantIdx }))
  )
  const lbEntry = lightboxIdx !== null ? allGenerated[lightboxIdx] : null

  return (
    <>
    {/* Lightbox */}
    {lbEntry && (
      <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={() => setLightboxIdx(null)}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3">
            {(() => {
              const srcThumb = lbEntry.item.ad.cached_image_url ?? lbEntry.item.ad.image_url
              return srcThumb
                ? <img src={srcThumb} alt="" className="w-9 h-9 rounded-lg object-cover opacity-80 border border-white/10" /> // eslint-disable-line @next/next/no-img-element
                : <div className="w-9 h-9 rounded-lg bg-white/10 flex-shrink-0" />
            })()}
            <div>
              <p className="text-sm font-semibold text-white">{lbEntry.item.ad.page_name ?? "Anuncio"}</p>
              <p className="text-xs text-white/50">
                Variante {lbEntry.variantIdx + 1} · {lightboxIdx! + 1} de {allGenerated.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={lbEntry.url} download target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="w-3.5 h-3.5" /> Descargar
            </a>
            <button
              onClick={() => setLightboxIdx(null)}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-0" onClick={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lbEntry.url}
            alt=""
            className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
          />
        </div>

        {/* Navigation arrows */}
        {lightboxIdx! > 0 && (
          <button
            className="fixed left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i !== null ? i - 1 : i) }}
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        )}
        {lightboxIdx! < allGenerated.length - 1 && (
          <button
            className="fixed right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i !== null ? i + 1 : i) }}
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        )}

        {/* Dot nav */}
        {allGenerated.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pb-4 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {allGenerated.map((_, i) => (
              <button
                key={i}
                onClick={() => setLightboxIdx(i)}
                className={`rounded-full transition-all ${i === lightboxIdx ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60"}`}
              />
            ))}
          </div>
        )}
      </div>
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-background rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Creación masiva</h2>
              <p className="text-xs text-muted-foreground">
                {ads.length} anuncio{ads.length !== 1 ? "s" : ""} seleccionado{ads.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mx-auto">
            {([1, 2, 3] as Step[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${
                  step === s ? "bg-primary text-primary-foreground" : step > s ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {step > s ? <Check className="w-3 h-3" /> : s}
                </div>
                {s < 3 && <div className={`w-8 h-px ${step > s ? "bg-primary/40" : "bg-border"}`} />}
              </div>
            ))}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step 1: Configuration ── */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Type */}
            <div>
              <p className="text-sm font-medium mb-2">Tipo de creación</p>
              <div className="flex gap-2">
                {(["estaticos", "guiones"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex items-center gap-2 h-9 px-4 rounded-xl border text-sm font-medium transition-all ${
                      type === t ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {t === "estaticos" ? <ImageIcon className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
                    {t === "estaticos" ? "Estáticos" : "Guiones"}
                  </button>
                ))}
              </div>
            </div>

            {/* Brand Brain */}
            <div>
              <p className="text-sm font-medium mb-1">Brand Brain</p>
              <p className="text-xs text-muted-foreground mb-3">El contenido se adaptará al tono de voz y USPs de la marca.</p>
              {brains.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {brains.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => selectBrain(b)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        brainId === b.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{b.name}</p>
                        {(b.brand_colors ?? []).length > 0 && (
                          <div className="flex gap-1 flex-shrink-0">
                            {b.brand_colors.map((c) => (
                              <span key={c.hex} className="w-3 h-3 rounded-full ring-1 ring-black/10" style={{ background: c.hex }} />
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Ángulo */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Compass className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <p className="text-sm font-medium">Ángulo <span className="text-xs font-normal text-muted-foreground">(opcional)</span></p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">¿Qué se quiere lograr con este conjunto de creativos?</p>
              <textarea
                value={angulo}
                onChange={(e) => { setAngulo(e.target.value); setAnguloAdvisory(null) }}
                rows={3}
                placeholder="Ej: Dirigido a dueños de negocio escépticos. El ángulo es la certeza de resultados con prueba social."
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background resize-none outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground/50 transition-all"
              />
              {recentAngulos.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {recentAngulos.map((r, i) => (
                    <button
                      key={i} type="button"
                      onClick={() => { setAngulo(r); setAnguloAdvisory(null) }}
                      className="max-w-[220px] truncate text-[11px] h-6 px-2.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors text-left"
                      title={r}
                    >{r}</button>
                  ))}
                </div>
              )}
              {angulo.trim() && brainId && (
                <div className="mt-2 flex items-start gap-2">
                  <button
                    type="button" onClick={handleCheckAdvisory} disabled={isCheckingAdvisory}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-primary/30 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    {isCheckingAdvisory ? <><Loader2 className="w-3 h-3 animate-spin" /> Revisando…</> : <><Compass className="w-3 h-3" /> Revisar compatibilidad</>}
                  </button>
                  {anguloAdvisory && (
                    <div className={`flex items-start gap-1.5 text-xs px-2.5 py-1.5 rounded-lg flex-1 ${anguloAdvisory.compatible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${anguloAdvisory.compatible ? "text-emerald-500" : "text-amber-500"}`} />
                      <span>{anguloAdvisory.note}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Estáticos extra config */}
            {type === "estaticos" && (
              <div className="border-t border-border pt-4 space-y-5">
                {/* Ratio + color */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ratio</p>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-border text-sm bg-background"
                    >
                      {ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Color de marca</p>
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <div
                        onClick={() => setUseBrandColor((v) => !v)}
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${useBrandColor ? "bg-primary border-primary" : "border-border bg-background"}`}
                      >
                        {useBrandColor && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-sm">Usar color de marca</span>
                    </label>
                    {useBrandColor && (
                      <div className="flex items-center gap-2">
                        <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer p-0.5 flex-shrink-0" />
                        <input type="text" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-24 h-8 px-2 rounded border text-xs font-mono bg-background" maxLength={7} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Additional images */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Imágenes adicionales <span className="font-normal normal-case">(opcional, ≤10)</span>
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Fotos del producto o elementos que deben aparecer en todos los creativos.
                  </p>
                  <div
                    className="border border-dashed border-border rounded-xl p-3 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Haz clic para añadir imágenes</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []).slice(0, 10)
                      setRefFiles((prev) => [...prev, ...picked].slice(0, 10))
                      if (fileInputRef.current) fileInputRef.current.value = ""
                    }}
                  />
                  {refFiles.length > 0 && (
                    <div className="grid grid-cols-5 gap-2 mt-3">
                      {refFiles.map((file, i) => (
                        <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                          <button
                            onClick={() => setRefFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                          >
                            <Trash2 className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Additional context */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Contexto adicional <span className="font-normal normal-case">(opcional)</span>
                  </p>
                  <textarea
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    rows={3}
                    placeholder="Instrucciones específicas: estilo, mood, elementos a incluir o excluir, disposición del texto…"
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background resize-none outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground/50 transition-all"
                  />
                </div>

                {/* Variants count */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Variantes por anuncio
                  </p>
                  <div className="flex gap-2 w-fit">
                    {[1, 2].map((n) => (
                      <button
                        key={n}
                        onClick={() => setNumImages(n)}
                        className={`w-14 h-9 rounded-lg border text-sm font-medium transition-colors ${
                          numImages === n
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Se generará{numImages > 1 ? "n" : ""} {numImages} variante{numImages > 1 ? "s" : ""} por cada anuncio analizado.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Analysis + Review ── */}
        {step === 2 && (
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">Análisis y revisión</p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {items.filter((it) => it.status === "ready" || it.status === "done").length} / {items.length} listos
              </span>
            </div>
            {items.map((item) => {
              const thumb       = item.ad.cached_image_url ?? item.ad.image_url
              const isExpandable = item.status === "ready" && item.adaptedLines.length > 0
              return (
                <div key={item.ad.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Accordion header */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3 ${isExpandable ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
                    onClick={() => isExpandable && updateItems((prev) =>
                      prev.map((it) => it.ad.id === item.ad.id ? { ...it, expanded: !it.expanded } : it)
                    )}
                  >
                    {thumb
                      ? <img src={thumb} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" /> // eslint-disable-line @next/next/no-img-element
                      : <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.ad.page_name ?? "Anuncio"}</p>
                      {item.status === "analyzing" && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Analizando…
                        </p>
                      )}
                      {item.status === "ready" && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.adaptedLines.length} líneas adaptadas — clic para revisar</p>
                      )}
                      {item.errorMessage && item.status === "error" && (
                        <p className="text-xs text-destructive mt-0.5">{item.errorMessage}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${itemStatusColor(item.status)}`}>
                      {itemStatusLabel(item.status)}
                    </span>
                    {isExpandable && (
                      <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-150 ${item.expanded ? "rotate-180" : ""}`} />
                    )}
                  </div>

                  {/* Expanded: adapted lines editor */}
                  {item.expanded && isExpandable && (
                    <div className="border-t border-border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/40 border-b border-border">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground w-1/2">Original</th>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground w-1/2">Adaptación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {item.adaptedLines.map((line, li) => (
                            <tr key={li} className="hover:bg-muted/20">
                              <td className="px-4 py-2.5 text-muted-foreground leading-relaxed align-top">{line.original}</td>
                              <td className="px-4 py-2 align-top">
                                <textarea
                                  value={line.adapted}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    updateItems((prev) => prev.map((it) => {
                                      if (it.ad.id !== item.ad.id) return it
                                      const lines = [...it.adaptedLines] as typeof it.adaptedLines
                                      lines[li] = { ...lines[li], adapted: val }
                                      return { ...it, adaptedLines: lines }
                                    }))
                                  }}
                                  rows={Math.max(2, Math.ceil(line.adapted.length / 55))}
                                  className="w-full resize-none bg-transparent border border-transparent hover:border-border focus:border-primary/50 rounded-lg px-2 py-1 text-xs leading-relaxed focus:outline-none transition-colors"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Step 3: Results ── */}
        {step === 3 && (
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">
                {type === "estaticos"
                  ? items.every((it) => it.status !== "generating") ? "Creativos generados" : "Generando creativos…"
                  : "Guiones adaptados"}
              </p>
              {type === "estaticos" && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {items.filter((it) => it.status === "done").length} / {items.filter((it) => it.status !== "error" || it.cloneId).length} generados
                </span>
              )}
            </div>
            {items.map((item) => {
              const thumb = item.ad.cached_image_url ?? item.ad.image_url
              return (
                <div key={item.ad.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    {thumb
                      ? <img src={thumb} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" /> // eslint-disable-line @next/next/no-img-element
                      : <div className="w-8 h-8 rounded-lg bg-muted flex-shrink-0" />
                    }
                    <p className="text-sm font-medium flex-1 min-w-0 truncate">{item.ad.page_name ?? "Anuncio"}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${itemStatusColor(item.status)}`}>
                      {type === "estaticos" && item.status === "done"
                        ? `${item.generatedUrls.length} imagen${item.generatedUrls.length !== 1 ? "es" : ""}`
                        : itemStatusLabel(item.status)
                      }
                    </span>
                  </div>

                  {/* Generated images grid */}
                  {type === "estaticos" && item.generatedUrls.length > 0 && (
                    <div className={`border-t border-border px-4 pb-4 pt-3 grid gap-3 ${item.generatedUrls.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-[200px]"}`}>
                      {item.generatedUrls.map((url, i) => {
                        const flatIdx = getFlatIdx(item.ad.id, i)
                        return (
                          <div
                            key={i}
                            className="relative group rounded-xl overflow-hidden border border-border bg-muted cursor-pointer aspect-[4/5]"
                            onClick={() => setLightboxIdx(flatIdx)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                            <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); setLightboxIdx(flatIdx) }}
                                className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
                              >
                                <Maximize2 className="w-4 h-4 text-white" />
                              </button>
                              <a
                                href={url} download target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
                              >
                                <Download className="w-4 h-4 text-white" />
                              </a>
                            </div>
                            <div className="absolute bottom-2 left-2">
                              <span className="text-[10px] font-semibold text-white/80 bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                                Variante {i + 1}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Generating spinner */}
                  {type === "estaticos" && item.status === "generating" && (
                    <div className="border-t border-border px-4 py-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Generando…
                    </div>
                  )}

                  {/* Share link for guiones */}
                  {type === "guiones" && item.shareToken && item.status !== "error" && (
                    <div className="border-t border-border px-4 py-2.5 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground truncate flex-1 font-mono">
                        /share/clone/{item.shareToken}
                      </span>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/share/clone/${item.shareToken!}`
                          navigator.clipboard.writeText(url).catch(() => {})
                        }}
                        className="inline-flex items-center gap-1 h-6 px-2.5 rounded-lg border border-border text-[11px] hover:bg-muted transition-colors flex-shrink-0"
                      >
                        <Link2 className="w-3 h-3" /> Copiar
                      </button>
                    </div>
                  )}

                  {/* Error */}
                  {item.status === "error" && item.errorMessage && (
                    <div className="border-t border-destructive/20 px-4 py-2 flex items-center gap-2 text-xs text-destructive bg-destructive/5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      {item.errorMessage}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => (s > 1 ? (s - 1) as Step : s))}
              disabled={isAnalyzing || isGenerating}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border text-sm hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Atrás
            </button>
          ) : <div />}

          {step === 1 && (
            <button
              onClick={handleAnalyze}
              disabled={!brainId || isAnalyzing}
              className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isAnalyzing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</>
                : <>Analizar {ads.length} anuncio{ads.length !== 1 ? "s" : ""} <ChevronRight className="w-4 h-4" /></>
              }
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleContinue}
              disabled={!doneAnalyzing || readyCount === 0}
              className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {type === "estaticos"
                ? <>Generar {readyCount} creativo{readyCount !== 1 ? "s" : ""} <ChevronRight className="w-4 h-4" /></>
                : <>Continuar <ChevronRight className="w-4 h-4" /></>
              }
            </button>
          )}

          {step === 3 && type === "estaticos" && (
            isGenerating || !doneGenerating
              ? <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Generando… puede tomar varios minutos
                </div>
              : <button
                  onClick={onClose}
                  className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Check className="w-4 h-4" /> Listo
                </button>
          )}

          {step === 3 && type === "guiones" && (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Check className="w-4 h-4" /> Listo
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
