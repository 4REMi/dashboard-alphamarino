"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import type { BrandBrain, ImageCloneLine, MetaAdResult } from "@/lib/types"
import {
  startImageClone,
  startImageCloneFromGenerated,
  uploadReferenceImages,
  generateImages,
  pollImageGeneration,
  updateImageAdaptedLines,
  checkAnguloCompatibility,
} from "@/lib/actions/image-clone"
import { getBrandBrains, getBrandLines } from "@/lib/actions/brand-brains"
import { getConceptsByBrandBrain } from "@/lib/actions/creatives"
import type { BrandLine } from "@/lib/types"
import { useRecentAngulos } from "@/lib/hooks/use-recent-angulos"
import {
  X, ImageIcon, Loader2, Check, ChevronRight, ChevronLeft,
  AlertCircle, Upload, Trash2, Link as LinkIcon, Copy, Compass, CheckCircle2,
} from "lucide-react"

export interface RecloneSource {
  imageUrl:      string
  pageName:      string
  savedAdId:     string
  parentCloneId: string
}

interface Props {
  ad?:            MetaAdResult
  recloneSource?: RecloneSource
  onClose:        () => void
}

type Step = 1 | 2 | 3
type BrainOption = Pick<BrandBrain, "id" | "name" | "brand_colors">

const ASPECT_RATIOS = ["1:1", "9:16", "16:9", "4:5"] as const
const RATIO_LABELS: Record<string, string> = {
  "1:1":  "Cuadrado",
  "9:16": "Vertical (Stories)",
  "16:9": "Horizontal",
  "4:5":  "Portrait",
}

export function ImageCloneModal({ ad, recloneSource, onClose }: Props) {
  const [step, setStep]                         = useState<Step>(1)
  const [brains, setBrains]                     = useState<BrainOption[]>([])
  const [selectedBrainId, setSelectedBrainId]   = useState("")
  const [cloneId, setCloneId]                   = useState<string | null>(null)
  const [shareToken, setShareToken]             = useState<string | null>(null)
  const [adaptedLines, setAdaptedLines]         = useState<ImageCloneLine[]>([])
  const [error, setError]                       = useState<string | null>(null)

  // Brand line + concepts
  const [brandLines, setBrandLines]             = useState<BrandLine[]>([])
  const [brandLineId, setBrandLineId]           = useState<string | null>(null)
  const [loadingLines, setLoadingLines]         = useState(false)
  const [concepts, setConcepts]                 = useState<Awaited<ReturnType<typeof getConceptsByBrandBrain>>>([])
  const [conceptId, setConceptId]               = useState<string | null>(null)
  const [loadingConcepts, setLoadingConcepts]   = useState(false)

  // Ángulo
  const [angulo, setAngulo]                     = useState("")
  const [anguloAdvisory, setAnguloAdvisory]     = useState<{ compatible: boolean; note: string } | null>(null)
  const [isCheckingAdvisory, setIsCheckingAdvisory] = useState(false)
  const { recents: recentAngulos, saveAngulo }  = useRecentAngulos()

  // Generation config
  const [refFiles, setRefFiles]                 = useState<File[]>([])
  const [additionalContext, setAdditionalContext] = useState("")
  const [useBrandColor, setUseBrandColor]       = useState(false)
  const [brandColor, setBrandColor]             = useState("#000000")
  const [aspectRatio, setAspectRatio]           = useState<string>("1:1")
  const [numImages, setNumImages]               = useState(2)

  // Generation result
  const [isGenerating, setIsGenerating]         = useState(false)
  const [generatedUrls, setGeneratedUrls]       = useState<string[]>([])
  const [copied, setCopied]                     = useState(false)
  const [showAllColors, setShowAllColors]       = useState(false)

  const [isPending, startTransition]            = useTransition()
  const [isSaving, setIsSaving]                 = useState(false)
  const fileInputRef                            = useRef<HTMLInputElement>(null)
  const pollingRef                              = useRef<NodeJS.Timeout | null>(null)

  const card            = ad?.snapshot?.cards?.[0]
  const adImageUrl      = recloneSource?.imageUrl ?? card?.resized_image_url ?? card?.original_image_url ?? null
  const pageNameDisplay = recloneSource?.pageName ?? ad?.page_name ?? ""
  const brainColors = (brains.find((b) => b.id === selectedBrainId)?.brand_colors ?? [])

  useEffect(() => {
    getBrandBrains().then((all) =>
      setBrains(all.map((b) => ({ id: b.id, name: b.name, brand_colors: b.brand_colors })))
    )
  }, [])

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current) }, [])

  function selectBrain(brain: BrainOption) {
    setSelectedBrainId(brain.id)
    setBrandLineId(null)
    setBrandLines([])
    setConceptId(null)
    setConcepts([])
    const colors = brain.brand_colors ?? []
    if (colors.length > 0) {
      setBrandColor(colors[0].hex)
      setUseBrandColor(true)
    } else {
      setUseBrandColor(false)
    }
    setLoadingLines(true)
    getBrandLines(brain.id).then((l) => { setBrandLines(l); setLoadingLines(false) }).catch(() => setLoadingLines(false))
    loadConcepts(brain.id, null)
  }

  function selectBrandLine(lineId: string | null) {
    setBrandLineId(lineId)
    setConceptId(null)
    loadConcepts(selectedBrainId, lineId)
  }

  function loadConcepts(brain: string, line: string | null) {
    setLoadingConcepts(true)
    setConcepts([])
    getConceptsByBrandBrain(brain, line).then((c) => { setConcepts(c); setLoadingConcepts(false) }).catch(() => setLoadingConcepts(false))
  }

  function buildEnrichedAngulo(): string | undefined {
    const parts: string[] = []
    const selectedLine = brandLineId ? brandLines.find((l) => l.id === brandLineId) : null
    if (selectedLine) {
      const lp = [`Producto/Servicio: "${selectedLine.name}"`]
      if (selectedLine.description) lp.push(`Descripción: ${selectedLine.description}`)
      if (selectedLine.usps?.length) lp.push(`USPs del producto: ${selectedLine.usps.join(", ")}`)
      if (selectedLine.pain_points?.length) lp.push(`Pain points: ${selectedLine.pain_points.join(", ")}`)
      if (selectedLine.keywords?.length) lp.push(`Keywords: ${selectedLine.keywords.join(", ")}`)
      parts.push(lp.join("\n"))
    }
    const selectedConcept = conceptId ? concepts.find((c) => c.id === conceptId) : null
    if (selectedConcept) {
      const cp = [`Concepto creativo: "${selectedConcept.name}"`]
      if (selectedConcept.angle_type) cp.push(`Ángulo: ${selectedConcept.angle_type}`)
      if (selectedConcept.target_persona) cp.push(`Persona objetivo: ${selectedConcept.target_persona}`)
      if (selectedConcept.pain_point) cp.push(`Dolor: ${selectedConcept.pain_point}`)
      if (selectedConcept.transformation) cp.push(`Transformación: ${selectedConcept.transformation}`)
      if (selectedConcept.why_it_works) cp.push(`Por qué conecta: ${selectedConcept.why_it_works}`)
      if (selectedConcept.funnel_stage) cp.push(`Etapa de funnel: ${selectedConcept.funnel_stage}`)
      parts.push(cp.join("\n"))
    }
    if (angulo.trim()) parts.push(angulo.trim())
    return parts.length > 0 ? parts.join("\n\n") : undefined
  }

  async function handleCheckAdvisory() {
    if (!selectedBrainId || !angulo.trim()) return
    setIsCheckingAdvisory(true)
    setAnguloAdvisory(null)
    try {
      const result = await checkAnguloCompatibility(selectedBrainId, angulo)
      setAnguloAdvisory(result)
    } catch {
      setAnguloAdvisory({ compatible: true, note: "No se pudo evaluar la compatibilidad." })
    } finally {
      setIsCheckingAdvisory(false)
    }
  }

  function handleStart() {
    if (!selectedBrainId) return
    if (angulo.trim()) saveAngulo(angulo)
    const enrichedAngulo = buildEnrichedAngulo()
    startTransition(async () => {
      try {
        if (recloneSource) {
          const result = await startImageCloneFromGenerated({
            sourceImageUrl: recloneSource.imageUrl,
            savedAdId:      recloneSource.savedAdId,
            parentCloneId:  recloneSource.parentCloneId,
            brandBrainId:   selectedBrainId,
            angulo:         enrichedAngulo,
          })
          setCloneId(result.cloneId)
          setShareToken(result.shareToken)
          setAdaptedLines(result.lines)
          setStep(3)
        } else {
          const result = await startImageClone(ad!, selectedBrainId, enrichedAngulo)
          setCloneId(result.cloneId)
          setShareToken(result.shareToken)
          if (result.lines.length > 0) {
            setAdaptedLines(result.lines)
            setStep(2)
          } else {
            setError("No se encontró texto en el anuncio, o ocurrió un error.")
          }
        }
      } catch (err) {
        setError(String(err))
      }
    })
  }

  async function handleSaveEdits() {
    if (!cloneId) return
    setIsSaving(true)
    try {
      await updateImageAdaptedLines(cloneId, adaptedLines)
      setStep(3)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).slice(0, 10)
    setRefFiles((prev) => [...prev, ...picked].slice(0, 10))
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const removeFile = useCallback((idx: number) => {
    setRefFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  async function handleGenerate() {
    if (!cloneId) return
    setIsGenerating(true)
    setError(null)
    try {
      // Upload reference images if provided (optional)
      if (refFiles.length > 0) {
        const fd = new FormData()
        refFiles.forEach((f) => fd.append("files", f))
        await uploadReferenceImages(cloneId, fd)
      }

      await generateImages(cloneId, {
        adaptedLines,
        brandColor:        useBrandColor ? brandColor : null,
        aspectRatio,
        numImages,
        additionalContext: additionalContext.trim(),
        sourceImageUrl:    recloneSource?.imageUrl,
      })

      pollingRef.current = setInterval(async () => {
        if (!cloneId) return
        try {
          const result = await pollImageGeneration(cloneId)
          if (result.status === "done") {
            clearInterval(pollingRef.current!)
            const urls = result.generated_image_urls
            setGeneratedUrls(Array.isArray(urls) ? urls : urls ? [String(urls)] : [])
            setIsGenerating(false)
          } else if (result.status === "error") {
            clearInterval(pollingRef.current!)
            setError(result.error_message ?? "Error en la generación")
            setIsGenerating(false)
          }
        } catch {
          // network hiccup
        }
      }, 5000)
    } catch (err) {
      setError(String(err))
      setIsGenerating(false)
    }
  }

  function copyLink() {
    if (!shareToken) return
    const url = `${window.location.origin}/share/image-clone/${shareToken}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/image-clone/${shareToken}`
    : ""

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl bg-background rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Clonar imagen</h2>
              <p className="text-xs text-muted-foreground">{pageNameDisplay}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 mx-auto">
            {recloneSource ? (
              // 2-step indicator: step 1 → circle 1, step 3 → circle 2
              ([{ val: 1 as Step, label: 1 }, { val: 3 as Step, label: 2 }]).map(({ val, label }, i) => (
                <div key={val} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${
                    step === val
                      ? "bg-violet-600 text-white"
                      : step > val
                      ? "bg-violet-200 text-violet-700"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {step > val ? <Check className="w-3 h-3" /> : label}
                  </div>
                  {i < 1 && <div className={`w-8 h-px transition-colors ${step > val ? "bg-violet-300" : "bg-border"}`} />}
                </div>
              ))
            ) : (
              ([1, 2, 3] as Step[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${
                    step === s
                      ? "bg-violet-600 text-white"
                      : step > s
                      ? "bg-violet-200 text-violet-700"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {step > s ? <Check className="w-3 h-3" /> : s}
                  </div>
                  {s < 3 && <div className={`w-8 h-px transition-colors ${step > s ? "bg-violet-300" : "bg-border"}`} />}
                </div>
              ))
            )}
          </div>

          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step 1: Brand Brain selector ── */}
        {step === 1 && (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="w-52 flex-shrink-0 bg-black flex items-center justify-center p-4">
              {adImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={adImageUrl} alt="Ad preview" className="w-full rounded-xl object-contain max-h-80" />
              ) : (
                <div className="w-full aspect-square bg-muted rounded-xl flex items-center justify-center">
                  <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Selecciona un Brand Brain</p>
                <p className="text-xs text-muted-foreground">
                  Claude analizará el anuncio y adaptará el copy a la marca.
                </p>
              </div>

              {brains.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {brains.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => selectBrain(b)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedBrainId === b.id
                          ? "border-violet-500 bg-violet-50 ring-1 ring-violet-400"
                          : "border-border hover:border-violet-300 bg-card hover:bg-violet-50/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{b.name}</p>
                        {(b.brand_colors ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 flex-shrink-0">
                            {b.brand_colors.map((c) => (
                              <span
                                key={c.hex}
                                className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                                style={{ background: c.hex }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Brand Line ── */}
              {selectedBrainId && (loadingLines || brandLines.length > 0) && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-1">
                    Producto / Servicio <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">Enfoca la adaptación a una línea específica.</p>
                  {loadingLines ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => selectBrandLine(null)}
                        className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${!brandLineId ? "border-violet-500 bg-violet-50 text-violet-700" : "border-border text-muted-foreground hover:border-violet-300"}`}>
                        General
                      </button>
                      {brandLines.map((l) => (
                        <button key={l.id} type="button" onClick={() => selectBrandLine(l.id)}
                          className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${brandLineId === l.id ? "border-violet-500 bg-violet-50 text-violet-700" : "border-border text-muted-foreground hover:border-violet-300"}`}>
                          {l.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />}
                          {l.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Concept ── */}
              {selectedBrainId && (loadingConcepts || concepts.length > 0) && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-1">
                    Concepto creativo <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">Adapta según el ángulo estratégico de un concepto existente.</p>
                  {loadingConcepts ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                      {concepts.map((c) => (
                        <button key={c.id} type="button" onClick={() => setConceptId(conceptId === c.id ? null : c.id)}
                          className={`w-full text-left p-2.5 rounded-lg border transition-all ${conceptId === c.id ? "border-violet-500 bg-violet-50 ring-1 ring-violet-400" : "border-border hover:border-violet-300"}`}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium truncate">{c.name}</span>
                            {c.angle_type && <span className="text-[10px] font-semibold bg-slate-900 text-white px-1.5 py-0.5 rounded shrink-0">{c.angle_type}</span>}
                            {c.funnel_stage && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{c.funnel_stage}</span>}
                            {c.status === "Evergreen" && <span className="text-[10px] shrink-0">⭐</span>}
                          </div>
                          {(c.pain_point || c.target_persona) && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {c.target_persona}{c.pain_point ? ` · ${c.pain_point}` : ""}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Ángulo section ── */}
              <div className="pt-3 border-t border-border mt-2">
                <div className="flex items-center gap-2 mb-1">
                  <Compass className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                  <p className="text-sm font-medium">Ángulo <span className="text-xs font-normal text-muted-foreground">(opcional)</span></p>
                </div>
                <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                  ¿Qué se quiere lograr con este creativo? Describe el objetivo, la persona a quien va dirigido, o el insight que lo soporta. Claude incorporará este ángulo al adaptar el copy.
                </p>
                <textarea
                  value={angulo}
                  onChange={(e) => { setAngulo(e.target.value); setAnguloAdvisory(null) }}
                  rows={3}
                  placeholder="Ej: Dirigido a dueños de negocio que ya probaron otras soluciones sin éxito. El ángulo es la frustración y la promesa de resultados concretos en 30 días."
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background resize-none outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400 placeholder:text-muted-foreground/50 transition-all"
                />

                {recentAngulos.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {recentAngulos.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setAngulo(r); setAnguloAdvisory(null) }}
                        className="max-w-[220px] truncate text-[11px] h-6 px-2.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors text-left"
                        title={r}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}

                {angulo.trim() && selectedBrainId && (
                  <div className="mt-2 flex items-start gap-2">
                    <button
                      type="button"
                      onClick={handleCheckAdvisory}
                      disabled={isCheckingAdvisory}
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-violet-300 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      {isCheckingAdvisory
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Revisando…</>
                        : <><Compass className="w-3 h-3" /> Revisar compatibilidad</>
                      }
                    </button>

                    {anguloAdvisory && (
                      <div className={`flex items-start gap-1.5 text-xs px-2.5 py-1.5 rounded-lg flex-1 ${
                        anguloAdvisory.compatible
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}>
                        <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${anguloAdvisory.compatible ? "text-emerald-500" : "text-amber-500"}`} />
                        <span>{anguloAdvisory.note}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Adapted text editor ── */}
        {step === 2 && (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: ad image (sticky reference) */}
            <div className="w-52 flex-shrink-0 bg-black flex items-center justify-center p-4">
              {adImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={adImageUrl} alt="Ad preview" className="w-full rounded-xl object-contain max-h-80" />
              ) : (
                <div className="w-full aspect-square bg-muted rounded-xl flex items-center justify-center">
                  <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
                </div>
              )}
            </div>

            {/* Right: adapted lines editor */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <div className="mb-4">
                <p className="text-sm font-medium">Texto extraído y adaptado</p>
                <p className="text-xs text-muted-foreground">Edita las adaptaciones antes de generar las imágenes.</p>
              </div>

              {adaptedLines.map((line, i) => (
                <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                      {line.element}
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Original</p>
                      <p className="text-sm text-muted-foreground">{line.original}</p>
                    </div>
                    <div className="px-4 py-3 bg-violet-50/40">
                      <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider mb-1.5">Adaptación</p>
                      <textarea
                        value={line.adapted}
                        onChange={(e) => {
                          const next = [...adaptedLines]
                          next[i] = { ...next[i], adapted: e.target.value }
                          setAdaptedLines(next)
                        }}
                        rows={2}
                        className="w-full text-sm bg-transparent resize-none outline-none focus:ring-0 font-medium leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {adaptedLines.length === 0 && (
                <div className="py-16 text-center text-muted-foreground">
                  <p className="text-sm">No se encontró texto en este anuncio.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Generation config ── */}
        {step === 3 && generatedUrls.length === 0 && (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: ad reference (sticky) */}
            <div className="w-52 flex-shrink-0 border-r border-border bg-muted/30 p-4 flex flex-col gap-3 overflow-y-auto">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Referencia del anuncio
              </p>
              {adImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={adImageUrl}
                  alt="Ad reference"
                  className="w-full rounded-xl object-contain border border-border"
                />
              ) : (
                <div className="w-full aspect-square rounded-xl bg-muted flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                Este creativo es la base visual de la generación.
              </p>
            </div>

            {/* Right: config */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Optional product images */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Imágenes adicionales <span className="font-normal normal-case">(opcional, ≤10)</span>
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  Agrega fotos del producto o elementos que quieras incluir.
                </p>
                <div
                  className="border border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1.5" />
                  <p className="text-xs text-muted-foreground">Haz clic para añadir imágenes</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFilePick}
                />

                {refFiles.length > 0 && (
                  <div className="grid grid-cols-5 gap-2 mt-3">
                    {refFiles.map((file, i) => (
                      <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeFile(i)}
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
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background resize-none outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400 placeholder:text-muted-foreground/50 transition-all"
                />
              </div>

              {/* Brand color */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Color de marca
                </p>
                <label className="flex items-center gap-2.5 cursor-pointer mb-3">
                  <div
                    onClick={() => setUseBrandColor((v) => !v)}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
                      useBrandColor ? "bg-violet-600 border-violet-600" : "border-border bg-background"
                    }`}
                  >
                    {useBrandColor && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-foreground">Usar colores de marca en la imagen</span>
                </label>

                {useBrandColor && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5 flex-shrink-0"
                      />
                      <input
                        type="text"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="w-28 h-9 px-3 rounded-lg border border-border text-sm font-mono bg-background"
                        placeholder="#000000"
                        maxLength={7}
                      />
                    </div>

                    {brainColors.length > 1 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowAllColors((v) => !v)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform ${showAllColors ? "rotate-90" : ""}`} />
                          {showAllColors ? "Ocultar paleta" : `Ver todos los colores (${brainColors.length})`}
                        </button>

                        {showAllColors && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {brainColors.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => setBrandColor(c.hex)}
                                title={c.label ?? c.hex}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-all ${
                                  brandColor.toLowerCase() === c.hex.toLowerCase()
                                    ? "border-violet-500 bg-violet-50 ring-1 ring-violet-400"
                                    : "border-border hover:border-violet-300 hover:bg-muted/50"
                                }`}
                              >
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-black/10 flex-shrink-0"
                                  style={{ background: c.hex }}
                                />
                                <span className="font-mono">{c.hex}</span>
                                {c.label && <span className="text-muted-foreground">· {c.label}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Aspect ratio + num images */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Relación de aspecto
                  </p>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-border text-sm bg-background"
                  >
                    {ASPECT_RATIOS.map((r) => (
                      <option key={r} value={r}>{r} — {RATIO_LABELS[r]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Cantidad
                  </p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setNumImages(n)}
                        className={`flex-1 h-9 rounded-lg border text-sm font-medium transition-colors ${
                          numImages === n
                            ? "bg-violet-600 border-violet-600 text-white"
                            : "border-border hover:border-violet-400"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive bg-destructive/10 rounded-xl px-3 py-2.5 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {isGenerating && (
                <div className="flex items-center gap-3 bg-violet-50 rounded-xl px-4 py-3 text-sm text-violet-700">
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  Generando con Flux Kontext… puede tomar 30–90 s.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Generated results ── */}
        {step === 3 && generatedUrls.length > 0 && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-700">¡Imágenes generadas!</p>
                <p className="text-xs text-muted-foreground">
                  {generatedUrls.length} imagen{generatedUrls.length > 1 ? "es" : ""} lista{generatedUrls.length > 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <LinkIcon className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar enlace"}
              </button>
            </div>

            <div className={`grid gap-3 ${generatedUrls.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-xs"}`}>
              {generatedUrls.map((url, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Generated ${i + 1}`} className="w-full object-cover" />
                  <div className="flex items-center justify-between px-3 py-2 bg-card border-t border-border">
                    <span className="text-xs text-muted-foreground">Opción {i + 1}</span>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="text-xs text-violet-600 hover:text-violet-800 font-semibold hover:underline"
                    >
                      Descargar
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {shareUrl && (
              <div className="flex items-center gap-2 bg-muted rounded-xl px-4 py-3">
                <LinkIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary truncate hover:underline flex-1"
                >
                  {shareUrl}
                </a>
                <button onClick={copyLink} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-background transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
            )}

          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0">
          {step > 1 && generatedUrls.length === 0 ? (
            <button
              onClick={() => { setStep((s) => (s > 1 ? (s - 1) as Step : s)); setError(null) }}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
              disabled={isPending || isSaving || isGenerating}
            >
              <ChevronLeft className="w-4 h-4" />
              Atrás
            </button>
          ) : <div />}

          {step === 1 && (
            <button
              onClick={handleStart}
              disabled={!selectedBrainId || isPending}
              className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {recloneSource ? "Preparando…" : "Analizando…"}</>
                : recloneSource
                  ? <>Continuar <ChevronRight className="w-4 h-4" /></>
                  : <><ImageIcon className="w-4 h-4" /> Analizar anuncio <ChevronRight className="w-4 h-4" /></>
              }
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleSaveEdits}
              disabled={isSaving}
              className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {isSaving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
                : <>Continuar <ChevronRight className="w-4 h-4" /></>
              }
            </button>
          )}

          {step === 3 && generatedUrls.length === 0 && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {isGenerating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</>
                : <><ImageIcon className="w-4 h-4" /> Generar imágenes</>
              }
            </button>
          )}

          {step === 3 && generatedUrls.length > 0 && (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
            >
              <Check className="w-4 h-4" /> Listo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
