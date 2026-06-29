"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import type { AdCloneLine, AdCloneStatus, BrandBrain, MetaAdResult, BrandLine } from "@/lib/types"
import { startClone, pollClone, updateAdaptedLines } from "@/lib/actions/ad-clone"
import { checkAnguloCompatibility } from "@/lib/actions/image-clone"
import { getBrandBrains, getBrandLines } from "@/lib/actions/brand-brains"
import { getConceptsByBrandBrain } from "@/lib/actions/creatives"
import { useRecentAngulos } from "@/lib/hooks/use-recent-angulos"
import {
  X, Wand2, Loader2, Check, Copy, ChevronRight,
  ChevronLeft, AlertCircle, Play, Link as LinkIcon, Compass, CheckCircle2,
} from "lucide-react"

interface Props {
  ad: MetaAdResult
  onClose: () => void
}

type Step = 1 | 2 | 3

const STATUS_LABEL: Record<AdCloneStatus, string> = {
  pending:      "Iniciando…",
  transcribing: "Transcribiendo video…",
  adapting:     "Adaptando con IA…",
  ready:        "Listo",
  error:        "Error",
}

export function CloneModal({ ad, onClose }: Props) {
  const [step, setStep]                     = useState<Step>(1)
  const [brains, setBrains]                 = useState<Pick<BrandBrain, "id" | "name">[]>([])
  const [selectedBrainId, setSelectedBrainId] = useState("")
  const [cloneId, setCloneId]               = useState<string | null>(null)
  const [shareToken, setShareToken]         = useState<string | null>(null)
  const [cloneStatus, setCloneStatus]       = useState<AdCloneStatus>("pending")
  const [adaptedLines, setAdaptedLines]     = useState<AdCloneLine[]>([])
  const [error, setError]                   = useState<string | null>(null)
  const [copied, setCopied]                 = useState(false)
  const [isPending, startTransition]        = useTransition()
  const [isSaving, setIsSaving]             = useState(false)

  // Brand line + concepts
  const [brandLines, setBrandLines]             = useState<BrandLine[]>([])
  const [brandLineId, setBrandLineId]           = useState<string | null>(null)
  const [loadingLines, setLoadingLines]         = useState(false)
  const [concepts, setConcepts]                 = useState<Awaited<ReturnType<typeof getConceptsByBrandBrain>>>([])
  const [conceptId, setConceptId]               = useState<string | null>(null)
  const [loadingConcepts, setLoadingConcepts]   = useState(false)

  // Ángulo
  const [angulo, setAngulo]                         = useState("")
  const [anguloAdvisory, setAnguloAdvisory]         = useState<{ compatible: boolean; note: string } | null>(null)
  const [isCheckingAdvisory, setIsCheckingAdvisory] = useState(false)
  const { recents: recentAngulos, saveAngulo }      = useRecentAngulos()

  const videoRef = useRef<HTMLVideoElement>(null)

  const card     = ad.snapshot?.cards?.[0]
  const videoUrl = card?.video_hd_url ?? card?.video_sd_url ?? null
  const thumbUrl = card?.resized_image_url ?? card?.original_image_url ?? null

  // Fetch brand brains on mount
  useEffect(() => {
    getBrandBrains().then((all) =>
      setBrains(all.map((b) => ({ id: b.id, name: b.name })))
    )
  }, [])

  function selectBrain(brainId: string) {
    setSelectedBrainId(brainId)
    setBrandLineId(null)
    setBrandLines([])
    setConceptId(null)
    setConcepts([])
    setLoadingLines(true)
    getBrandLines(brainId).then((l) => { setBrandLines(l); setLoadingLines(false) }).catch(() => setLoadingLines(false))
    loadConcepts(brainId, null)
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

  // Poll while transcribing/adapting
  useEffect(() => {
    if (!cloneId) return
    if (cloneStatus === "ready" || cloneStatus === "error") return

    const anguloSnap = buildEnrichedAngulo()
    const interval = setInterval(async () => {
      try {
        const result = await pollClone(cloneId, anguloSnap)
        setCloneStatus(result.status)
        if (result.status === "ready") {
          setAdaptedLines(result.adapted_lines ?? [])
        }
        if (result.status === "error") {
          setError(result.error_message ?? "Error desconocido")
        }
      } catch {
        // network hiccup, keep polling
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [cloneId, cloneStatus, angulo, brandLineId, conceptId])

  // Transition from step 2 loading → editing once ready
  useEffect(() => {
    if (cloneStatus === "error" && step === 2) setError(error ?? "Error al procesar")
  }, [cloneStatus, step, error])

  function handleStart() {
    if (!selectedBrainId) return
    if (angulo.trim()) saveAngulo(angulo)
    startTransition(async () => {
      try {
        const result = await startClone(ad, selectedBrainId)
        setCloneId(result.cloneId)
        setShareToken(result.shareToken)
        setCloneStatus("transcribing")
        setStep(2)
      } catch (err) {
        setError(String(err))
      }
    })
  }

  async function handleSaveEdits() {
    if (!cloneId) return
    setIsSaving(true)
    try {
      await updateAdaptedLines(cloneId, adaptedLines)
      setStep(3)
    } finally {
      setIsSaving(false)
    }
  }

  function copyLink() {
    if (!shareToken) return
    const url = `${window.location.origin}/share/clone/${shareToken}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const shareUrl = shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/clone/${shareToken}` : ""

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-4xl bg-background rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Clonar anuncio</h2>
              <p className="text-xs text-muted-foreground">{ad.page_name}</p>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-1.5 mx-auto">
            {([1, 2, 3] as Step[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : step > s
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {step > s ? <Check className="w-3 h-3" /> : s}
                </div>
                {s < 3 && <div className={`w-8 h-px transition-colors ${step > s ? "bg-primary/40" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step 1: Context ── */}
        {step === 1 && (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: Video / thumbnail */}
            <div className="w-64 flex-shrink-0 bg-black flex items-center justify-center p-4">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  poster={thumbUrl ?? undefined}
                  controls
                  className="w-full rounded-xl max-h-80 object-contain"
                />
              ) : thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl} alt="Ad preview" className="w-full rounded-xl object-contain max-h-80" />
              ) : (
                <div className="w-full aspect-video bg-muted rounded-xl flex items-center justify-center">
                  <Play className="w-10 h-10 text-muted-foreground/30" />
                </div>
              )}
            </div>

            {/* Right: Controls */}
            <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
              <div>
                <h3 className="text-sm font-semibold mb-1">Selecciona un Brand Brain</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  El guión se adaptará al tono de voz, propuestas de valor y CTAs de la marca seleccionada.
                </p>

                {brains.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando Brand Brains…
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {brains.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => selectBrain(b.id)}
                        className={`p-3 rounded-xl border text-left text-sm font-medium transition-all ${
                          selectedBrainId === b.id
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-primary/40 hover:bg-muted text-foreground"
                        }`}
                      >
                        {b.name}
                        {selectedBrainId === b.id && (
                          <Check className="w-3.5 h-3.5 inline ml-1.5 mb-0.5" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Brand Line ── */}
              {selectedBrainId && (loadingLines || brandLines.length > 0) && (
                <div>
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
                        className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${!brandLineId ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                        General
                      </button>
                      {brandLines.map((l) => (
                        <button key={l.id} type="button" onClick={() => selectBrandLine(l.id)}
                          className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${brandLineId === l.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
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
                <div>
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
                          className={`w-full text-left p-2.5 rounded-lg border transition-all ${conceptId === c.id ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border hover:border-primary/40"}`}>
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
              <div className="pt-1 border-t border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Compass className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <p className="text-sm font-medium">Ángulo <span className="text-xs font-normal text-muted-foreground">(opcional)</span></p>
                </div>
                <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                  ¿Qué se quiere lograr con este guión? Describe el objetivo, la persona a quien va dirigido, o el insight que lo soporta. Claude incorporará este ángulo al adaptar el copy.
                </p>
                <textarea
                  value={angulo}
                  onChange={(e) => { setAngulo(e.target.value); setAnguloAdvisory(null) }}
                  rows={3}
                  placeholder="Ej: Dirigido a dueños de negocio escépticos que ya probaron otras soluciones. El ángulo es la frustración convertida en certeza con prueba social."
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background resize-none outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground/50 transition-all"
                />

                {recentAngulos.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {recentAngulos.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setAngulo(r); setAnguloAdvisory(null) }}
                        className="max-w-[220px] truncate text-[11px] h-6 px-2.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors text-left"
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
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-primary/30 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors flex-shrink-0"
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
                <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/5">
                  <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              <div className="mt-auto flex justify-end">
                <button
                  onClick={handleStart}
                  disabled={!selectedBrainId || isPending}
                  className="flex items-center gap-2 h-10 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Wand2 className="w-4 h-4" />
                  }
                  Clonar guión
                  {!isPending && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Transcription / Editing ── */}
        {step === 2 && (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: Video */}
            <div className="w-52 flex-shrink-0 bg-black flex items-start justify-center p-3 pt-4">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  poster={thumbUrl ?? undefined}
                  controls
                  className="w-full rounded-xl max-h-72 object-contain"
                />
              ) : thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl} alt="" className="w-full rounded-xl object-contain max-h-72" />
              ) : null}
            </div>

            {/* Right: Lines or loading */}
            <div className="flex-1 flex flex-col min-h-0">
              {cloneStatus !== "ready" && cloneStatus !== "error" ? (
                /* Loading state */
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">{STATUS_LABEL[cloneStatus]}</p>
                    <p className="text-xs text-muted-foreground mt-1">Esto puede tomar hasta un minuto</p>
                  </div>
                  {/* Progress steps */}
                  <div className="flex flex-col gap-2 w-48">
                    {(["transcribing", "adapting"] as const).map((s) => {
                      const isActive = cloneStatus === s
                      const isDone = s === "transcribing" && cloneStatus === "adapting"
                      return (
                        <div key={s} className="flex items-center gap-2 text-xs">
                          {isActive ? (
                            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
                          ) : isDone ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-border flex-shrink-0" />
                          )}
                          <span className={isActive ? "text-foreground" : "text-muted-foreground"}>
                            {STATUS_LABEL[s]}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : cloneStatus === "error" ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                  <p className="text-sm font-semibold text-destructive">Error al procesar</p>
                  <p className="text-xs text-muted-foreground text-center">{error}</p>
                  <button
                    onClick={() => { setStep(1); setError(null); setCloneId(null); setCloneStatus("pending") }}
                    className="text-xs h-8 px-4 rounded-lg border border-border hover:bg-muted transition-colors"
                  >
                    Volver al inicio
                  </button>
                </div>
              ) : (
                /* Editable table */
                <>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {adaptedLines.length} líneas — edita la adaptación si es necesario
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background border-b border-border z-10">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-1/2">Guión original</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-1/2">Adaptación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {adaptedLines.map((line, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-4 py-2.5 align-top text-muted-foreground leading-relaxed">
                              {line.speaker && (
                                <span className="text-[10px] font-bold text-primary mr-1">[{line.speaker}]</span>
                              )}
                              {line.original}
                            </td>
                            <td className="px-4 py-2 align-top">
                              <textarea
                                value={line.adapted}
                                onChange={(e) => {
                                  const next = [...adaptedLines]
                                  next[i] = { ...next[i], adapted: e.target.value }
                                  setAdaptedLines(next)
                                }}
                                rows={Math.max(2, Math.ceil(line.adapted.length / 60))}
                                className="w-full resize-none bg-transparent border border-transparent hover:border-border focus:border-primary/50 rounded-lg px-2 py-1 text-xs leading-relaxed focus:outline-none transition-colors"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0">
                    <button
                      onClick={() => setStep(1)}
                      className="flex items-center gap-1.5 text-xs h-8 px-3 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Volver
                    </button>
                    <button
                      onClick={handleSaveEdits}
                      disabled={isSaving}
                      className="flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Guardar y generar enlace
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Hand-off ── */}
        {step === 3 && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6 overflow-y-auto">
            {/* Success icon */}
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold">¡Guión listo!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Comparte este enlace con el equipo de producción de video.
              </p>
            </div>

            {/* Share link */}
            <div className="w-full max-w-md">
              <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-muted/50">
                <LinkIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-xs font-mono text-foreground truncate">{shareUrl}</span>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-background border border-border text-xs font-medium hover:bg-muted transition-colors flex-shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>

            {/* Script preview */}
            <div className="w-full max-w-2xl rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground">Vista previa del guión adaptado</p>
              </div>
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {adaptedLines.map((line, i) => (
                  <div key={i} className="flex gap-4 px-4 py-2.5 text-xs">
                    <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 space-y-0.5">
                      <p className="text-muted-foreground line-through">{line.original}</p>
                      <p className="text-foreground font-medium">{line.adapted}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 text-sm h-9 px-4 rounded-xl border border-border hover:bg-muted transition-colors text-muted-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
                Editar guión
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 text-sm h-9 px-5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
