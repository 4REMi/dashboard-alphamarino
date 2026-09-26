"use client"

import { useState, useEffect, useMemo, useTransition } from "react"
import { cn } from "@/lib/utils"
import {
  Brain, Sparkles, Copy, Check, Loader2, ExternalLink, Play, Image as ImageIcon,
  Mic, MicOff, X, Search, FolderOpen, ArrowLeft, Film, Layers,
} from "lucide-react"
import type { CreativeConcept, BrandBrain, CreativeBrief } from "@/lib/types"
import { createBrief, generateBriefContent, getBrief } from "@/lib/actions/creatives"
import { getSavedAds, getBoards, getBoardAds } from "@/lib/actions/ad-lab"

// Crear brief: pantalla casi completa en dos columnas.
//  - Izquierda: el concepto, nombre del brief, cerebro de marca (el del
//    proyecto, fijo) y la bandeja de referencias elegidas, cada video con
//    su interruptor "Tropicalizar guion" escrito (antes: un micrófono
//    diminuto que solo aparecía al seleccionar).
//  - Derecha: la biblioteca, navegable por Boards (como en Ad Lab) o por
//    todos los videos/imágenes, con buscador, miniaturas grandes 9:16 y
//    vista previa al pasar el cursor.

interface SavedAdRef {
  id: string
  page_name: string | null
  body: string | null
  cached_image_url: string | null
  image_url: string | null
  cached_video_url: string | null
  video_url: string | null
  format: string | null
}

interface BoardRef {
  id: string
  name: string
  ad_count?: number
  preview_ads?: { cached_image_url: string | null; image_url: string | null }[]
}

interface Props {
  concept: CreativeConcept
  projectId: string
  brandBrains: BrandBrain[]
  // Cerebro de marca del proyecto: si existe, se usa directo (no se elige).
  projectBrandBrainId?: string
  onClose: () => void
  onCreated: (brief: CreativeBrief) => void
}

type Tab = "boards" | "videos" | "images"

const isVideoAd = (ad: SavedAdRef) => ad.format === "video" || !!ad.video_url || !!ad.cached_video_url
const thumbOf = (ad: SavedAdRef) => ad.cached_image_url || ad.image_url || null
const videoOf = (ad: SavedAdRef) => ad.cached_video_url || ad.video_url || null

export function BriefCreator({ concept, projectId, brandBrains, projectBrandBrainId, onClose, onCreated }: Props) {
  const [title, setTitle] = useState(concept.name ?? concept.angle_type ?? "")
  const [brainId, setBrainId] = useState(projectBrandBrainId ?? "")
  const [selectedAdIds, setSelectedAdIds] = useState<string[]>([])
  // Los videos se tropicalizan por default; se apaga para b-roll o montajes sin diálogo.
  const [noTranscribeIds, setNoTranscribeIds] = useState<string[]>([])
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([])
  const [generatedBrief, setGeneratedBrief] = useState<CreativeBrief | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [savedAds, setSavedAds] = useState<SavedAdRef[]>([])
  const [boards, setBoards] = useState<BoardRef[]>([])
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [tab, setTab] = useState<Tab>("boards")
  const [openBoard, setOpenBoard] = useState<BoardRef | null>(null)
  const [boardAds, setBoardAds] = useState<SavedAdRef[] | null>(null)
  const [search, setSearch] = useState("")
  const [preview, setPreview] = useState<SavedAdRef | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getSavedAds(), getBoards()]).then(([ads, brds]) => {
      if (cancelled) return
      setSavedAds(ads)
      setBoards(brds)
      setLoadingRefs(false)
      if (brds.length === 0) setTab("videos")
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!openBoard) return
    let cancelled = false
    getBoardAds(openBoard.id).then((ads) => { if (!cancelled) setBoardAds(ads) })
    return () => { cancelled = true }
  }, [openBoard])

  const brain = brandBrains.find((b) => b.id === brainId) ?? null
  const adById = useMemo(() => new Map([...savedAds, ...(boardAds ?? [])].map((a) => [a.id, a])), [savedAds, boardAds])
  const selectedAds = selectedAdIds.map((id) => adById.get(id)).filter(Boolean) as SavedAdRef[]
  const toTranscribe = selectedAds.filter((a) => isVideoAd(a) && !noTranscribeIds.includes(a.id)).length

  const q = search.trim().toLowerCase()
  const matches = (a: SavedAdRef) => !q || (a.page_name ?? "").toLowerCase().includes(q) || (a.body ?? "").toLowerCase().includes(q)
  const gridAds = openBoard
    ? (boardAds ?? []).filter(matches)
    : tab === "videos" ? savedAds.filter((a) => isVideoAd(a) && matches(a))
    : tab === "images" ? savedAds.filter((a) => !isVideoAd(a) && matches(a))
    : []
  const shownBoards = boards.filter((b) => !q || b.name.toLowerCase().includes(q))

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  function handleGenerate() {
    if (!brainId) return
    startTransition(async () => {
      const skip = noTranscribeIds.filter((id) => selectedAdIds.includes(id))
      const brief = await createBrief(projectId, concept.id, brainId, selectedAdIds, selectedBoardIds, concept.brand_line_id ?? undefined, title, skip)
      const result = await generateBriefContent(brief.id)
      if (result && "error" in result) setContentError(result.error)
      // Siempre se relee: el guion adaptado puede haberse guardado aunque otro paso fallara.
      const fresh = await getBrief(brief.id)
      setGeneratedBrief(fresh ?? brief)
    })
  }

  if (generatedBrief) {
    return <SuccessView brief={generatedBrief} error={contentError} onDone={() => { onCreated(generatedBrief); onClose() }} />
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="bg-background rounded-2xl border border-border w-full max-w-7xl h-[92vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* ── Izquierda: configuración + referencias elegidas ── */}
        <aside className="w-[340px] flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-primary" /> Nuevo brief</p>
            <p className="text-base font-semibold mt-1 leading-tight">{concept.name ?? concept.angle_type ?? "Concepto"}</p>
            <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
              {concept.angle_type && <span className="px-1.5 py-0.5 rounded bg-muted">{concept.angle_type}</span>}
              {concept.funnel_stage && <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">{concept.funnel_stage}</span>}
              {concept.target_persona && <span className="px-1.5 py-0.5 rounded bg-muted truncate max-w-full" title={concept.target_persona}>{concept.target_persona}</span>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Nombre del brief</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Escasez — Black Friday"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>

            <div>
              <span className="text-xs font-medium text-muted-foreground">Cerebro de marca</span>
              {projectBrandBrainId && brain ? (
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <BrainLogo brain={brain} />
                  <span className="text-sm font-medium truncate">{brain.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">del proyecto</span>
                </div>
              ) : (
                // Solo si el proyecto no tiene cerebro vinculado.
                <select value={brainId} onChange={(e) => setBrainId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Elige un cerebro de marca…</option>
                  {brandBrains.map((b) => <option key={b.id} value={b.id}>{b.name}{b.industry ? ` · ${b.industry}` : ""}</option>)}
                </select>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted-foreground">Referencias elegidas</span>
                {(selectedAds.length > 0 || selectedBoardIds.length > 0) && (
                  <button onClick={() => { setSelectedAdIds([]); setSelectedBoardIds([]) }} className="text-[11px] text-muted-foreground hover:text-foreground">Quitar todas</button>
                )}
              </div>
              {selectedAds.length === 0 && selectedBoardIds.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4 text-center">
                  Opcional. Elige videos o imágenes de la derecha; los videos se tropicalizan para esta marca.
                </p>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  {selectedBoardIds.map((id) => {
                    const b = boards.find((x) => x.id === id)
                    return (
                      <div key={id} className="flex items-center gap-2 rounded-lg border border-border bg-background p-1.5">
                        <span className="w-9 h-9 rounded bg-muted flex items-center justify-center"><Layers className="w-4 h-4 text-muted-foreground" /></span>
                        <span className="flex-1 min-w-0"><span className="block text-xs font-medium truncate">{b?.name ?? "Board"}</span><span className="block text-[10px] text-muted-foreground">Board completo como inspiración</span></span>
                        <button onClick={() => setSelectedBoardIds((l) => l.filter((x) => x !== id))} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    )
                  })}
                  {selectedAds.map((ad) => {
                    const video = isVideoAd(ad)
                    const on = !noTranscribeIds.includes(ad.id)
                    return (
                      <div key={ad.id} className="flex items-center gap-2 rounded-lg border border-border bg-background p-1.5">
                        <button onClick={() => setPreview(ad)} className="relative w-9 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {thumbOf(ad) && <img src={thumbOf(ad)!} alt="" className="w-full h-full object-cover" />}
                          {video && <Play className="absolute inset-0 m-auto w-3 h-3 text-white drop-shadow" />}
                        </button>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-medium truncate">{ad.page_name ?? (video ? "Video" : "Imagen")}</span>
                          {video ? (
                            <button onClick={() => setNoTranscribeIds((l) => toggle(l, ad.id))}
                              title={on ? "Se transcribe y se adapta el guion a esta marca" : "Solo como referencia visual (sin diálogo)"}
                              className={cn("mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full", on ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                              {on ? <Mic className="w-2.5 h-2.5" /> : <MicOff className="w-2.5 h-2.5" />}{on ? "Tropicalizar guion" : "Solo visual"}
                            </button>
                          ) : <span className="block text-[10px] text-muted-foreground">Imagen</span>}
                        </span>
                        <button onClick={() => setSelectedAdIds((l) => l.filter((x) => x !== ad.id))} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-4 border-t border-border space-y-2">
            {isPending && (
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Escribiendo el brief…</p>
                {toTranscribe > 0 && <p className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Transcribiendo y tropicalizando {toTranscribe} video{toTranscribe === 1 ? "" : "s"} (hasta ~2 min)</p>}
              </div>
            )}
            <button onClick={handleGenerate} disabled={!brainId || isPending}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isPending ? "Generando…" : toTranscribe ? `Generar brief y tropicalizar ${toTranscribe}` : "Generar brief"}
            </button>
            <button onClick={onClose} disabled={isPending} className="w-full text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">Cancelar</button>
          </div>
        </aside>

        {/* ── Derecha: biblioteca ── */}
        <section className="flex-1 min-w-0 flex flex-col">
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            {openBoard ? (
              <button onClick={() => { setOpenBoard(null); setBoardAds(null) }} className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-primary">
                <ArrowLeft className="w-4 h-4" /> Boards <span className="text-muted-foreground">/</span> {openBoard.name}
              </button>
            ) : (
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {([["boards", "Boards", boards.length], ["videos", "Videos", savedAds.filter(isVideoAd).length], ["images", "Imágenes", savedAds.filter((a) => !isVideoAd(a)).length]] as const).map(([k, label, n]) => (
                  <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1 rounded-md text-sm font-medium transition-colors", tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {label} <span className="text-xs text-muted-foreground">{n}</span>
                  </button>
                ))}
              </div>
            )}
            {openBoard && (
              <button onClick={() => setSelectedBoardIds((l) => toggle(l, openBoard.id))}
                className={cn("text-xs px-2.5 py-1 rounded-md border", selectedBoardIds.includes(openBoard.id) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                {selectedBoardIds.includes(openBoard.id) ? "✓ Board completo como inspiración" : "Usar board completo como inspiración"}
              </button>
            )}
            <div className="ml-auto relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "boards" && !openBoard ? "Buscar board…" : "Buscar por marca o copy…"}
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button onClick={onClose} disabled={isPending} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loadingRefs ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando biblioteca…</p>
            ) : tab === "boards" && !openBoard ? (
              shownBoards.length === 0 ? <Empty text="Sin boards todavía. Crea uno en Ad Lab → Boards." /> : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {shownBoards.map((b) => {
                    const previews = (b.preview_ads ?? []).slice(0, 4)
                    return (
                      <button key={b.id} onClick={() => { setBoardAds(null); setOpenBoard(b); setSearch("") }}
                        className={cn("text-left rounded-xl border overflow-hidden hover:border-primary/50 hover:shadow-sm transition-all", selectedBoardIds.includes(b.id) ? "border-primary ring-1 ring-primary" : "border-border")}>
                        <div className="grid grid-cols-2 gap-px bg-border aspect-[4/3]">
                          {Array.from({ length: 4 }, (_, i) => {
                            const src = previews[i]?.cached_image_url || previews[i]?.image_url
                            return src
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img key={i} src={src} alt="" className="w-full h-full object-cover" />
                              : <span key={i} className="bg-muted flex items-center justify-center">{i === 0 && <FolderOpen className="w-5 h-5 text-muted-foreground/50" />}</span>
                          })}
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-sm font-medium truncate">{b.name}</p>
                          <p className="text-xs text-muted-foreground">{b.ad_count ?? 0} referencias</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            ) : openBoard && !boardAds ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando board…</p>
            ) : gridAds.length === 0 ? (
              <Empty text={q ? `Nada coincide con "${search}".` : "Sin referencias aquí."} />
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {gridAds.map((ad) => (
                  <RefCard key={ad.id} ad={ad} selected={selectedAdIds.includes(ad.id)}
                    onToggle={() => setSelectedAdIds((l) => toggle(l, ad.id))} onPreview={() => setPreview(ad)} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center gap-3 p-4" onClick={(e) => { e.stopPropagation(); setPreview(null) }}>
          <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-3 max-w-full">
            {isVideoAd(preview) && videoOf(preview) ? (
              <video src={videoOf(preview)!} poster={thumbOf(preview) ?? undefined} controls autoPlay className="max-h-[78vh] max-w-full rounded-lg" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbOf(preview) ?? ""} alt="" className="max-h-[78vh] max-w-full rounded-lg object-contain" />
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-md bg-white/10 text-white text-sm hover:bg-white/20">← Volver</button>
              <button onClick={() => { setSelectedAdIds((l) => toggle(l, preview.id)); setPreview(null) }}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
                {selectedAdIds.includes(preview.id) ? "Quitar de referencias" : "Usar como referencia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Miniatura 9:16 (video) o cuadrada (imagen). Hover: el video corre sin
// sonido para identificarlo rápido; click selecciona; lupa = verlo en grande.
function RefCard({ ad, selected, onToggle, onPreview }: { ad: SavedAdRef; selected: boolean; onToggle: () => void; onPreview: () => void }) {
  const [hover, setHover] = useState(false)
  const video = isVideoAd(ad)
  const src = videoOf(ad)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn("group relative rounded-xl overflow-hidden border-2 transition-all bg-muted", video ? "aspect-[9/16]" : "aspect-square",
        selected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-primary/40")}
    >
      <button type="button" onClick={onToggle} className="absolute inset-0 w-full h-full">
        {video && hover && src ? (
          <video src={src} poster={thumbOf(ad) ?? undefined} autoPlay muted loop playsInline className="w-full h-full object-cover" />
        ) : thumbOf(ad) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbOf(ad)!} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center">{video ? <Film className="w-6 h-6 text-muted-foreground" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />}</span>
        )}
      </button>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 pointer-events-none">
        <p className="text-[11px] text-white font-medium truncate">{ad.page_name ?? (video ? "Video" : "Imagen")}</p>
      </div>
      {video && !hover && <Play className="absolute top-2 left-2 w-4 h-4 text-white drop-shadow pointer-events-none" />}
      <button type="button" onClick={onPreview} title="Ver en grande"
        className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 text-white items-center justify-center hidden group-hover:flex hover:bg-black/80">
        <Search className="w-3.5 h-3.5" />
      </button>
      <span className={cn("absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors pointer-events-none",
        selected ? "bg-primary border-primary text-primary-foreground" : "border-white/80 bg-black/20 text-transparent group-hover:text-white/70")}>
        <Check className="w-3.5 h-3.5" />
      </span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground text-center py-16">{text}</p>
}

function BrainLogo({ brain }: { brain: BrandBrain }) {
  const src = brain.logo_square_url || brain.logo_url
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className="w-6 h-6 rounded object-contain" /> : <Brain className="w-4 h-4 text-primary/60" />
}

function SuccessView({ brief, error, onDone }: { brief: CreativeBrief; error: string | null; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/share/brief/${brief.share_token}`
  const content = brief.brief_content as { summary?: string } | null
  const scripts = Object.keys((brief.adapted_script ?? {}) as Record<string, unknown>).length
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl border border-border w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className={cn("w-10 h-10 rounded-full flex items-center justify-center", error ? "bg-amber-100" : "bg-emerald-100")}>
            <Check className={cn("w-5 h-5", error ? "text-amber-600" : "text-emerald-600")} />
          </span>
          <div>
            <p className="font-semibold">{error ? "Brief creado con avisos" : "Brief listo"}</p>
            <p className="text-xs text-muted-foreground">
              {content?.summary ? "Contenido generado" : "Sin contenido generado"}{scripts ? ` · ${scripts} guion${scripts === 1 ? "" : "es"} tropicalizado${scripts === 1 ? "" : "s"}` : ""}
            </p>
          </div>
        </div>
        {error && <p className="text-xs rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-3 py-2">{error}</p>}
        {content?.summary && <p className="text-sm text-muted-foreground line-clamp-4">{content.summary}</p>}
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/50 border">
          <input readOnly value={url} className="flex-1 text-xs bg-transparent border-0 outline-none truncate" />
          <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }} className="p-1.5 rounded hover:bg-muted">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <a href={`/share/brief/${brief.share_token}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-muted"><ExternalLink className="w-3.5 h-3.5" /></a>
        </div>
        <button onClick={onDone} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">Listo</button>
      </div>
    </div>
  )
}
