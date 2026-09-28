"use client"

import { useEffect, useRef, useState } from "react"
import type { BrandBrain, ImageCloneLine, VisualDirection } from "@/lib/types"
import {
  startCarouselClone, getCarouselBatch, generateCarouselDirection, generateCarouselSlides,
  pollImageGeneration, updateImageAdaptedLines, finalizeCarousel, type CarouselSlideState,
} from "@/lib/actions/image-clone"
import { getBrandBrains } from "@/lib/actions/brand-brains"
import { getConceptsByBrandBrain } from "@/lib/actions/creatives"
import { SendToProjectModal } from "@/components/ad-lab/send-to-project-modal"
import { cn } from "@/lib/utils"
import { X, Loader2, Check, RefreshCw, Compass, Wand2, AlertCircle, Send } from "lucide-react"

// Clonar carrusel completo: adapta la NARRATIVA de todo el carrusel (no
// slide por slide), con una dirección visual compartida, y genera una
// imagen nueva por slide usando el original como referencia. Cada slide se
// puede regenerar suelto. El resultado se envía a un concepto como UN
// asset de carrusel.

type Step = 1 | 2 | 3 | 4
type BrainOption = Pick<BrandBrain, "id" | "name" | "brand_colors" | "logo_url" | "logo_square_url">
const RATIOS = ["4:5", "1:1", "9:16"] as const

export function CarouselCloneModal({ savedAdId, pageName, slides: sourceSlides, onClose }: {
  savedAdId: string
  pageName: string
  slides: string[]
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>(1)
  const [included, setIncluded] = useState<boolean[]>(sourceSlides.map(() => true))
  const [brains, setBrains] = useState<BrainOption[]>([])
  const [brainId, setBrainId] = useState("")
  const [concepts, setConcepts] = useState<Awaited<ReturnType<typeof getConceptsByBrandBrain>>>([])
  const [conceptId, setConceptId] = useState("")
  const [batchId, setBatchId] = useState<string | null>(null)
  const [slides, setSlides] = useState<CarouselSlideState[]>([])
  const [narrative, setNarrative] = useState<string | null>(null)
  const [direction, setDirection] = useState<VisualDirection | null>(null)
  const [directionNote, setDirectionNote] = useState("")
  const [aspect, setAspect] = useState<(typeof RATIOS)[number]>("4:5")
  const [provider, setProvider] = useState<"replicate" | "apimart">("replicate")
  const [useColor, setUseColor] = useState(true)
  const [extra, setExtra] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const [finalUrls, setFinalUrls] = useState<string[] | null>(null)
  const [sending, setSending] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    getBrandBrains().then((all) => setBrains(all.map((b) => ({ id: b.id, name: b.name, brand_colors: b.brand_colors, logo_url: b.logo_url, logo_square_url: b.logo_square_url }))))
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (!brainId) return
    let cancelled = false
    getConceptsByBrandBrain(brainId, null).then((c) => { if (!cancelled) setConcepts(c) })
    return () => { cancelled = true }
  }, [brainId])

  const brain = brains.find((b) => b.id === brainId)
  const brandColor = brain?.brand_colors?.[0]?.hex ?? null
  const chosen = sourceSlides.filter((_, i) => included[i])

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label); setError(null)
    try { return await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)); return undefined } finally { setBusy(null) }
  }

  async function start() {
    const r = await run("Leyendo y adaptando el carrusel completo…", () =>
      startCarouselClone({ savedAdId, brandBrainId: brainId, conceptId: conceptId || null, slideUrls: chosen }))
    if (!r) return
    setBatchId(r.batchId); setSlides(r.slides); setNarrative(r.narrative); setStep(2)
  }

  function editLine(cloneId: string, i: number, adapted: string) {
    setSlides((ss) => ss.map((s) => (s.cloneId === cloneId ? { ...s, lines: s.lines.map((l, j) => (j === i ? { ...l, adapted } : l)) } : s)))
  }

  async function saveTextsAndContinue() {
    const ok = await run("Guardando textos…", async () => {
      await Promise.all(slides.map((s) => updateImageAdaptedLines(s.cloneId, s.lines as ImageCloneLine[])))
      return true
    })
    if (ok) setStep(3)
  }

  async function makeDirection() {
    if (!batchId) return
    const d = await run("Definiendo la dirección visual del set…", () => generateCarouselDirection(batchId, directionNote))
    if (d) setDirection(d)
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      if (!batchId) return
      const pending = [...generatingRef.current]
      if (pending.length === 0) { clearInterval(pollRef.current!); return }
      await Promise.all(pending.map(async (id) => {
        try {
          const r = await pollImageGeneration(id)
          if (r.status === "reviewing" || r.status === "error" || r.status === "done") {
            generatingRef.current.delete(id)
            setGenerating(new Set(generatingRef.current))
          }
        } catch { /* reintento en el siguiente ciclo */ }
      }))
      setSlides(await getCarouselBatch(batchId))
    }, 5000)
  }
  const generatingRef = useRef<Set<string>>(new Set())

  async function generate(cloneIds?: string[]) {
    if (!batchId) return
    const targets = cloneIds ?? slides.map((s) => s.cloneId)
    const r = await run(cloneIds ? "Regenerando…" : `Generando ${targets.length} slides…`, () =>
      generateCarouselSlides(batchId, { aspectRatio: aspect, brandColor: useColor ? brandColor : null, additionalContext: extra.trim(), provider, cloneIds }))
    if (!r) return
    if (r.errors.length) setError(r.errors.join(" · "))
    targets.forEach((id) => generatingRef.current.add(id))
    setGenerating(new Set(generatingRef.current))
    setFinalUrls(null)
    setStep(4)
    startPolling()
  }

  async function finish() {
    if (!batchId) return
    const urls = await run("Guardando carrusel…", () => finalizeCarousel(batchId))
    if (urls) setFinalUrls(urls)
  }

  const lastUrl = (s: CarouselSlideState) => s.generatedUrls[s.generatedUrls.length - 1] ?? null
  const allReady = slides.length > 0 && slides.every((s) => lastUrl(s)) && generating.size === 0

  if (sending && finalUrls) return <SendToProjectModal imageUrl={finalUrls[0]} imageUrls={finalUrls} onClose={() => setSending(false)} />

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="px-6 py-4 border-b border-border flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold">Clonar carrusel completo</h2>
            <p className="text-xs text-muted-foreground truncate">{pageName} · {chosen.length} de {sourceSlides.length} slides</p>
          </div>
          <div className="hidden md:flex items-center gap-1 text-[11px]">
            {["Slides y marca", "Narrativa", "Dirección visual", "Generar"].map((l, i) => (
              <span key={l} className={cn("px-2.5 py-1 rounded-full", step === i + 1 ? "bg-primary text-primary-foreground" : step > i + 1 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>{i + 1}. {l}</span>
            ))}
          </div>
          <button onClick={onClose} disabled={!!busy} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {error && <p className="mb-4 text-sm text-red-600 flex items-start gap-1.5"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>}

          {step === 1 && (
            <div className="space-y-6">
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Slides a clonar <span className="font-normal normal-case">— quita los que no sirvan (ej. &quot;sígueme&quot; del creador)</span></p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {sourceSlides.map((u, i) => (
                    <button key={i} onClick={() => setIncluded((a) => a.map((v, j) => (j === i ? !v : v)))}
                      className={cn("relative w-36 shrink-0 rounded-xl overflow-hidden border-2 transition-all", included[i] ? "border-primary" : "border-transparent opacity-40")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="w-full aspect-[4/5] object-cover" />
                      <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded">{i + 1}</span>
                      {included[i] && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                    </button>
                  ))}
                </div>
              </section>
              <section className="grid md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marca</span>
                  <select value={brainId} onChange={(e) => { setBrainId(e.target.value); setConceptId(""); setConcepts([]) }} className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="">Elige un cerebro de marca…</option>
                    {brains.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Concepto (recomendado)</span>
                  <select value={conceptId} onChange={(e) => setConceptId(e.target.value)} disabled={!brainId} className="mt-1 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50">
                    <option value="">Sin concepto — solo la marca</option>
                    {concepts.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.angle_type ?? "Concepto"}{c.funnel_stage ? ` · ${c.funnel_stage}` : ""}</option>)}
                  </select>
                  <span className="text-[11px] text-muted-foreground">La narrativa del carrusel se adapta para contar este concepto.</span>
                </label>
              </section>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {narrative && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-0.5">Narrativa adaptada</p>
                  <p className="text-sm">{narrative}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Revisa y ajusta el texto de cada slide. Se adaptaron juntos para que cada uno continúe al anterior.</p>
              <div className="space-y-3">
                {slides.map((s) => (
                  <div key={s.cloneId} className="rounded-xl border border-border bg-background flex gap-4 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.sourceImageUrl} alt="" className="w-24 aspect-[4/5] object-cover rounded-lg shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-xs font-semibold"><span className="text-muted-foreground">Slide {s.slideIndex + 1}</span>{s.role && <span className="ml-2 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 text-[10px]">{s.role}</span>}</p>
                      {s.lines.length === 0 && <p className="text-xs text-muted-foreground">Sin texto — solo se adapta lo visual.</p>}
                      {s.lines.map((l, i) => (
                        <div key={i} className="grid md:grid-cols-[110px_1fr_1fr] gap-2 items-start text-xs">
                          <span className="text-muted-foreground pt-1.5">{l.element}</span>
                          <span className="text-muted-foreground pt-1.5 line-clamp-3">{l.original}</span>
                          <textarea value={l.adapted} onChange={(e) => editLine(s.cloneId, i, e.target.value)} rows={2}
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 max-w-3xl">
              <p className="text-sm text-muted-foreground">Una sola dirección visual para todos los slides: misma paleta, tipografía y estilo, para que se vea como un carrusel y no como imágenes sueltas. Es opcional.</p>
              <div className="flex gap-2">
                <input value={directionNote} onChange={(e) => setDirectionNote(e.target.value)} placeholder="Instrucciones extra (opcional) — ej. fondo claro, tipografía bold"
                  className="flex-1 h-10 rounded-lg border border-input bg-background px-3 text-sm" />
                <button onClick={makeDirection} disabled={!!busy} className="inline-flex items-center gap-1.5 px-4 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50">
                  <Compass className="w-4 h-4" />{direction ? "Regenerar" : "Generar dirección"}
                </button>
              </div>
              {direction && (
                <div className="rounded-xl border border-border p-4 space-y-2">
                  <p className="font-semibold">{direction.direction_name}</p>
                  <p className="text-sm text-muted-foreground">{direction.summary}</p>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">{direction.style.keywords.map((k) => <span key={k} className="px-2 py-0.5 rounded-full bg-muted">{k}</span>)}</div>
                </div>
              )}
              <div className="grid md:grid-cols-3 gap-4 pt-2">
                <label className="text-xs"><span className="font-semibold uppercase tracking-wide text-muted-foreground">Relación de aspecto</span>
                  <select value={aspect} onChange={(e) => setAspect(e.target.value as (typeof RATIOS)[number])} className="mt-1 w-full h-9 rounded-lg border border-input bg-background px-2 text-sm">
                    {RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="text-xs"><span className="font-semibold uppercase tracking-wide text-muted-foreground">Modelo</span>
                  <select value={provider} onChange={(e) => setProvider(e.target.value as "replicate" | "apimart")} className="mt-1 w-full h-9 rounded-lg border border-input bg-background px-2 text-sm">
                    <option value="replicate">Nano Banana Pro</option>
                    <option value="apimart">GPT Image 2.5</option>
                  </select>
                </label>
                <label className="text-xs flex items-end gap-2 pb-2">
                  <input type="checkbox" checked={useColor} onChange={(e) => setUseColor(e.target.checked)} disabled={!brandColor} />
                  <span>Usar color de marca {brandColor && <span className="inline-block w-3 h-3 rounded align-middle ml-1" style={{ background: brandColor }} />}</span>
                </label>
              </div>
              <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} placeholder="Contexto adicional para la generación (opcional)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              <p className="text-[11px] text-muted-foreground">Se generará 1 imagen por slide ({slides.length} en total).</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex gap-4 overflow-x-auto pb-3">
                {slides.map((s) => {
                  const url = lastUrl(s)
                  const busySlide = generating.has(s.cloneId)
                  return (
                    <div key={s.cloneId} className="w-56 shrink-0 space-y-2">
                      <p className="text-xs font-semibold"><span className="text-muted-foreground">Slide {s.slideIndex + 1}</span>{s.role && <span className="ml-1.5 text-[10px] text-violet-600">{s.role}</span>}</p>
                      <div className="relative rounded-xl overflow-hidden border border-border bg-muted aspect-[4/5] flex items-center justify-center">
                        {busySlide ? (
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        ) : url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="" className="w-full h-full object-cover" /></a>
                        ) : (
                          <span className="text-xs text-red-600 px-3 text-center">{s.errorMessage ?? "Sin imagen"}</span>
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.sourceImageUrl} alt="" title="Original" className="absolute bottom-1.5 left-1.5 w-10 aspect-[4/5] object-cover rounded border-2 border-white shadow" />
                      </div>
                      {!finalUrls && (
                        <button onClick={() => generate([s.cloneId])} disabled={!!busy || busySlide}
                          className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-xs hover:bg-muted disabled:opacity-50">
                          <RefreshCw className="w-3.5 h-3.5" />Regenerar este slide
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {finalUrls && (
                <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><Check className="w-4 h-4" />Carrusel guardado. Ya lo puedes enviar a un proyecto como un solo asset.</p>
              )}
            </div>
          )}
        </div>

        <footer className="px-6 py-3.5 border-t border-border flex items-center gap-3">
          {busy && <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />{busy}</span>}
          <span className="ml-auto" />
          {step === 1 && (
            <button onClick={start} disabled={!brainId || chosen.length === 0 || !!busy} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              <Wand2 className="w-4 h-4" />Adaptar narrativa ({chosen.length} slides)
            </button>
          )}
          {step === 2 && (
            <button onClick={saveTextsAndContinue} disabled={!!busy} className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Continuar</button>
          )}
          {step === 3 && (
            <>
              <button onClick={() => setStep(2)} disabled={!!busy} className="h-10 px-4 rounded-lg text-sm text-muted-foreground hover:text-foreground">Atrás</button>
              <button onClick={() => generate()} disabled={!!busy} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                <Wand2 className="w-4 h-4" />Generar {slides.length} slides
              </button>
            </>
          )}
          {step === 4 && !finalUrls && (
            <>
              <button onClick={() => setStep(3)} disabled={!!busy || generating.size > 0} className="h-10 px-4 rounded-lg text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">Ajustar y regenerar todo</button>
              <button onClick={finish} disabled={!allReady || !!busy} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">
                <Check className="w-4 h-4" />{generating.size ? `Generando ${generating.size}…` : "Guardar carrusel"}
              </button>
            </>
          )}
          {step === 4 && finalUrls && (
            <>
              <button onClick={onClose} className="h-10 px-4 rounded-lg text-sm text-muted-foreground hover:text-foreground">Cerrar</button>
              <button onClick={() => setSending(true)} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                <Send className="w-4 h-4" />Enviar a proyecto
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
