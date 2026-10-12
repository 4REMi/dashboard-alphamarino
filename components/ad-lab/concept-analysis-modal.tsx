"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Copy, Check, Mic, Eye, Globe, CalendarClock, AlertTriangle, RefreshCw, ChevronDown, Play, Wand2, FolderPlus, ArrowUpRight } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { analyzeLibraryAd, getSavedAdAnalysis, getConceptTargets, createConceptFromAnalysis, type ConceptTarget, type LibraryAdAnalysis, type LibraryAdInput, type Point } from "@/lib/actions/ad-analysis"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"
import { cn } from "@/lib/utils"

// Análisis de concepto, por capas: el creativo a la izquierda (el video se
// sincroniza con la estructura), arriba la idea en 5 segundos y abajo
// pestañas. Se guarda por anuncio: reabrirlo es instantáneo.

type Tab = "concepto" | "estructura" | "aprendizajes" | "marca" | "transcripcion"
const TABS: { key: Tab; label: string }[] = [
  { key: "concepto", label: "Concepto" }, { key: "estructura", label: "Estructura" }, { key: "aprendizajes", label: "Aprendizajes" },
  { key: "marca", label: "Marca" }, { key: "transcripcion", label: "Transcripción" },
]
const MOMENT: Record<string, string> = {
  gancho: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  problema: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  "demostración": "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "prueba social": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  oferta: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  cta: "bg-primary/10 text-primary",
}
const CONF = { alta: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", media: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", baja: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" }

// "0:06-0:25" → [6, 25]
function range(t: string): [number, number] | null {
  const m = t.match(/(\d+):(\d{1,2})\s*[-–]\s*(\d+):(\d{1,2})/)
  if (!m) return null
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])]
}

function Chip({ ok, Icon, children }: { ok: boolean; Icon: typeof Mic; children: React.ReactNode }) {
  return <span className={cn("text-[11px] px-1.5 py-0.5 rounded inline-flex items-center gap-1", ok ? "bg-muted text-muted-foreground" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}><Icon className="w-3 h-3" />{children}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-0.5"><p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="text-sm leading-snug">{children || "—"}</p></div>
}

function Points({ title, items, tone }: { title: string; items: Point[]; tone: string }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!items?.length) return null
  return (
    <div className="space-y-1.5">
      <p className={cn("text-[11px] font-semibold uppercase tracking-wider", tone)}>{title}</p>
      <ul className="rounded-lg border border-border divide-y divide-border">
        {items.map((p, i) => (
          <li key={i}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} disabled={!p.detalle} className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-muted/40 disabled:hover:bg-transparent">
              <span className="flex-1 text-sm font-medium leading-snug">{p.titulo}</span>
              {p.detalle && <ChevronDown className={cn("w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0 transition-transform", open === i && "rotate-180")} />}
            </button>
            {open === i && p.detalle && <p className="px-3 pb-2.5 -mt-0.5 text-xs text-muted-foreground leading-relaxed">{p.detalle}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// mode "asset": un creativo propio del proyecto (Crear desde asset existente):
// sin marca inferida, "Cómo mejorarlo" en vez de adaptarlo y sin acciones de
// librería (asignar/crear concepto vive en la tarjeta del embudo).
export function ConceptAnalysisModal({ ad, open, onClose, initial = null, onClone, mode = "library" }: { ad: LibraryAdInput; open: boolean; onClose: () => void; initial?: LibraryAdAnalysis | null; onClone?: () => void; mode?: "library" | "asset" }) {
  const isAsset = mode === "asset"
  const [a, setA] = useState<LibraryAdAnalysis | null>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("concepto")
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(0)
  const [toProject, setToProject] = useState(false)
  const [hookCopied, setHookCopied] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  function run(force: boolean) {
    setBusy(true); setError(null)
    const p = force ? analyzeLibraryAd(ad) : getSavedAdAnalysis(ad.adArchiveId).then((saved) => saved ?? analyzeLibraryAd(ad))
    p.then(setA).catch((e) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false))
  }
  useEffect(() => { if (open && !a && !busy) run(false) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function seek(t: string) {
    const r = range(t), v = videoRef.current
    if (!r || !v) return
    v.currentTime = r[0]; v.play().catch(() => {})
  }

  function copy() {
    if (!a) return
    const c = a.concepto
    const t = [`${c.nombre} — ${a.resumen}`, `Ángulo: ${c.angle_type} · ${c.funnel_stage} · awareness ${c.awareness_stage}`, `Persona: ${c.target_persona}`, `Dolor: ${c.pain_point}`, `Objeción: ${c.objection}`, `Transformación: ${c.transformation}`, `Gancho: “${a.gancho.texto}”`, `Mecánica: ${a.mecanica}`, "", "Cómo adaptarlo:", ...a.como_adaptarlo.map((x) => `- ${x.titulo}${x.detalle ? `: ${x.detalle}` : ""}`)].join("\n")
    navigator.clipboard.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }

  const guide = a ? ANGLE_GUIDE.find((g) => g.name === a.concepto.angle_type) : null
  const activeIdx = a ? a.estructura.findIndex((e) => { const r = range(e.t); return !!r && now >= r[0] && now < r[1] }) : -1

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(1120px,96vw)] w-[96vw] h-[90vh] p-0 gap-0 overflow-y-auto md:overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)]">
          {/* Creativo */}
          <aside className="bg-black flex flex-col min-h-0 min-w-0">
            <div className="flex-1 min-h-[220px] max-h-[45vh] md:max-h-none flex items-center justify-center">
              {ad.videoUrl
                ? <video ref={videoRef} src={ad.videoUrl} controls playsInline onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} className="w-full max-h-full object-contain" />
                // eslint-disable-next-line @next/next/no-img-element
                : ad.imageUrl ? <img src={ad.imageUrl} alt="" className="w-full max-h-full object-contain" /> : null}
            </div>
            <div className="bg-background border-t border-border p-3 space-y-2">
              <p className="text-xs font-medium truncate">{ad.pageName}</p>
              {a && (
                <div className="flex flex-wrap gap-1">
                  {ad.videoUrl && <Chip ok={!!a.transcript} Icon={Mic}>{a.transcript ? "Transcrito" : "Sin voz"}</Chip>}
                  <Chip ok={!!a.media} Icon={Eye}>{a.media ? "Visto" : "No visto"}</Chip>
                  {!isAsset && <Chip ok={a.landingLeida} Icon={Globe}>{a.landingLeida ? "Landing" : "Sin landing"}</Chip>}
                  {a.diasCorriendo && <Chip ok Icon={CalendarClock}>{a.diasCorriendo} días</Chip>}
                </div>
              )}
              {a && !a.media && a.visionError && <p className="text-[11px] text-amber-700 dark:text-amber-300">{a.visionError}</p>}
              {a && (
                <div className="flex gap-1.5">
                  <button onClick={copy} className="flex-1 h-8 rounded-md border border-border text-xs inline-flex items-center justify-center gap-1 hover:bg-muted">{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "Copiado" : "Copiar"}</button>
                  {!isAsset && <button onClick={() => run(true)} disabled={busy} title="Volver a analizar (cuesta transcripción e IA)" className="h-8 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1 hover:bg-muted disabled:opacity-50"><RefreshCw className={cn("w-3.5 h-3.5", busy && "animate-spin")} /></button>}
                </div>
              )}
              {a && !isAsset && <p className="text-[10px] text-muted-foreground">Analizado {new Date(a.analyzedAt ?? Date.now()).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
            </div>
          </aside>

          {/* Análisis */}
          <section className="min-h-0 min-w-0 flex flex-col">
            {!a ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center">
                <DialogTitle className="sr-only">Análisis de concepto</DialogTitle>
                {error ? <p className="text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</p> : <>
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <p className="text-sm">{ad.videoUrl ? "Transcribiendo, viendo el video y leyendo la landing…" : "Viendo la imagen y leyendo la landing…"}</p>
                  <p className="text-xs text-muted-foreground">Alrededor de un minuto. Queda guardado para la próxima vez.</p>
                </>}
              </div>
            ) : (
              <>
                {/* La idea en 5 segundos */}
                <header className="px-6 pt-5 pb-3 border-b border-border space-y-2 pr-12">
                  <DialogTitle className="text-xl leading-tight">{a.concepto.nombre}</DialogTitle>
                  <p className="text-sm text-muted-foreground leading-snug">{a.resumen}</p>
                  <div className="flex flex-wrap gap-1.5 text-xs pt-0.5">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium" title={guide?.guiding_question}>{guide?.emoji} {a.concepto.angle_type}</span>
                    <span className="px-2 py-0.5 rounded-full bg-muted">{a.concepto.organizing_principle === "Pain-First" ? "Parte de un dolor" : "Parte de un deseo"}</span>
                    <span className="px-2 py-0.5 rounded-full bg-muted">{a.concepto.funnel_stage} · awareness {a.concepto.awareness_stage}</span>
                    {a.formato && <span className="px-2 py-0.5 rounded-full bg-muted">{a.formato}</span>}
                  </div>
                </header>
                <nav className="px-6 border-b border-border flex gap-1 overflow-x-auto">
                  {TABS.filter((t) => (t.key !== "transcripcion" || a.transcript || a.media) && (t.key !== "marca" || a.marca)).map((t) => (
                    <button key={t.key} onClick={() => { setTab(t.key); setToProject(false) }} className={cn("px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px", tab === t.key ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</button>
                  ))}
                </nav>

                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                  {toProject && <ToProjectPanel a={a} ad={ad} onCancel={() => setToProject(false)} />}
                  {!toProject && tab === "concepto" && (
                    <div className="space-y-5">
                      <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 p-4 space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Gancho · {a.gancho.tipo}</p>
                        <div className="flex items-start gap-2">
                          <p className="flex-1 text-base font-medium leading-snug">“{a.gancho.texto}”</p>
                          <button type="button" title="Copiar gancho" onClick={() => navigator.clipboard.writeText(a.gancho.texto).then(() => { setHookCopied(true); setTimeout(() => setHookCopied(false), 1500) }).catch(() => {})}
                            className="h-7 w-7 shrink-0 rounded-md hover:bg-violet-100 dark:hover:bg-violet-900/40 inline-flex items-center justify-center text-violet-700 dark:text-violet-300">
                            {hookCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">{a.gancho.por_que_atrapa}</p>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                        <Field label="Persona">{a.concepto.target_persona}</Field>
                        <Field label="Dolor / deseo">{a.concepto.pain_point}</Field>
                        <Field label="Objeción">{a.concepto.objection}</Field>
                        <Field label="Transformación">{a.concepto.transformation}</Field>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4">
                        <Field label="Por qué funciona">{a.concepto.why_it_works}</Field>
                        <Field label="Mecánica">{a.mecanica}</Field>
                      </div>
                    </div>
                  )}

                  {!toProject && tab === "estructura" && (
                    <ol className="space-y-1">
                      {a.estructura.map((e, i) => {
                        const r = range(e.t)
                        return (
                          <li key={i}>
                            <button onClick={() => seek(e.t)} disabled={!r || !ad.videoUrl}
                              className={cn("w-full text-left rounded-lg px-3 py-2.5 flex gap-3 items-start transition-colors", i === activeIdx ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50")}>
                              <span className="font-mono text-xs text-muted-foreground w-[96px] shrink-0 pt-0.5 inline-flex items-center gap-1 whitespace-nowrap">{r && ad.videoUrl && <Play className="w-3 h-3" />}{e.t}</span>
                              <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded capitalize shrink-0", MOMENT[e.momento.toLowerCase()] ?? "bg-muted")}>{e.momento}</span>
                              <span className="text-sm leading-snug">{e.que_pasa}</span>
                            </button>
                          </li>
                        )
                      })}
                      {ad.videoUrl && <p className="text-[11px] text-muted-foreground pt-2">Haz clic en un momento para verlo en el video.</p>}
                    </ol>
                  )}

                  {!toProject && tab === "aprendizajes" && (
                    <div className="grid lg:grid-cols-3 gap-4">
                      <Points title="Por qué funciona" items={a.por_que_funciona} tone="text-emerald-600 dark:text-emerald-400" />
                      <Points title="Debilidades" items={a.debilidades} tone="text-amber-600 dark:text-amber-400" />
                      <Points title={isAsset ? "Cómo mejorarlo" : "Cómo adaptarlo"} items={a.como_adaptarlo} tone="text-primary" />
                    </div>
                  )}

                  {!toProject && tab === "marca" && a.marca && (
                    <div className="space-y-4 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", CONF[a.marca.confianza] ?? CONF.media)}>Confianza {a.marca.confianza}</span>
                        <span className="text-xs text-muted-foreground">Inferido sin ficha de marca</span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                        <Field label="Qué vende">{a.marca.que_vende}</Field>
                        <Field label="Para quién">{a.marca.audiencia}</Field>
                        <Field label="Oferta">{a.marca.oferta}</Field>
                        <Field label="Posicionamiento">{a.marca.posicionamiento}</Field>
                      </div>
                      <p className="text-xs text-muted-foreground italic border-t border-border pt-3">Basado en: {a.marca.basado_en}</p>
                    </div>
                  )}

                  {!toProject && tab === "transcripcion" && (
                    <div className="space-y-4">
                      {a.media?.escenas?.length ? (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Escenas</p>
                          {a.media.escenas.map((s, i) => (
                            <button key={i} onClick={() => seek(s.t)} disabled={!ad.videoUrl} className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/50 text-xs flex gap-2">
                              <span className="font-mono text-muted-foreground w-[84px] shrink-0 whitespace-nowrap">{s.t}</span>
                              <span>{s.visual}{s.texto_en_pantalla ? <span className="text-muted-foreground"> · “{s.texto_en_pantalla}”</span> : null}</span>
                            </button>
                          ))}
                          <p className="text-xs text-muted-foreground pt-1">Música: {a.media.musica} · Tono: {a.media.tono}</p>
                        </div>
                      ) : null}
                      {a.transcript && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Transcripción</p>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{a.transcript}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Acciones: llevar el análisis a trabajo */}
                {!toProject && !isAsset && (
                  <footer className="px-6 py-3 border-t border-border flex items-center gap-2 flex-wrap bg-background">
                    <a href="/ad-lab/analisis" className="text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 hover:underline mr-auto"><Check className="w-3.5 h-3.5" />Guardado en Ad Lab → Análisis</a>
                    {onClone && (
                      <button onClick={onClone} className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 hover:bg-muted"><Wand2 className="w-4 h-4" />Clonar con este ángulo</button>
                    )}
                    <button onClick={() => setToProject(true)} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"><FolderPlus className="w-4 h-4" />Crear concepto en proyecto</button>
                  </footer>
                )}
              </>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Crear el concepto en un proyecto: eliges proyecto y línea, y adaptas
// nombre y persona a tu cliente (el resto viene del análisis, editable
// después en el Creative Tracker).
function ToProjectPanel({ a, ad, onCancel }: { a: LibraryAdAnalysis; ad: LibraryAdInput; onCancel: () => void }) {
  const [targets, setTargets] = useState<ConceptTarget[] | null>(null)
  const [projectId, setProjectId] = useState("")
  const [lineId, setLineId] = useState<string | null>(null)
  const [name, setName] = useState(a.concepto.nombre)
  const [persona, setPersona] = useState(a.concepto.target_persona)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { getConceptTargets().then(setTargets).catch((e) => setError(e instanceof Error ? e.message : String(e))) }, [])
  const target = targets?.find((t) => t.id === projectId)
  const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

  async function create() {
    if (!projectId) return
    setBusy(true); setError(null)
    try {
      const c = a.concepto
      await createConceptFromAnalysis(projectId, { brand_line_id: lineId, name: name.trim() || c.nombre, angle_type: c.angle_type, organizing_principle: c.organizing_principle, target_persona: persona, pain_point: c.pain_point, objection: c.objection, why_it_works: c.why_it_works, transformation: c.transformation, funnel_stage: c.funnel_stage, awareness_stage: Number(c.awareness_stage), source: `anuncio de ${ad.pageName}${ad.adArchiveId && !ad.adArchiveId.includes(":") ? ` (librería ${ad.adArchiveId})` : ""}` })
      setDone(projectId)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="max-w-lg space-y-3">
        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><Check className="w-4 h-4" />Concepto creado en {targets?.find((t) => t.id === done)?.name}</p>
        <p className="text-xs text-muted-foreground">Quedó en el ciclo activo, con la nota de dónde se inspiró. Desde ahí puedes ajustarlo, crear su brief o subir creativos.</p>
        <div className="flex gap-2">
          <a href={`/projects/${done}#creative-tracker`} className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5">Abrir proyecto<ArrowUpRight className="w-4 h-4" /></a>
          <button onClick={onCancel} className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-muted">Volver al análisis</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <p className="text-sm font-semibold">Crear concepto en un proyecto</p>
        <p className="text-xs text-muted-foreground">Se copia el ángulo, dolor, objeción, transformación y funnel. Adapta el nombre y la persona a tu cliente.</p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Proyecto</span>
        <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setLineId(null) }} className={input} disabled={!targets}>
          <option value="">{targets ? "Elige un proyecto…" : "Cargando…"}</option>
          {targets?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.cycleId ? "" : " (sin ciclo activo)"}</option>)}
        </select>
      </label>
      {target && target.lines.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Línea de producto</span>
          <div className="flex flex-wrap gap-1.5">
            {[...target.lines, { id: null as string | null, name: "General", color: null }].map((l) => (
              <button key={l.id ?? "g"} type="button" onClick={() => setLineId(l.id)} title={l.name}
                className={cn("h-8 px-3 max-w-[220px] rounded-full border text-sm inline-flex items-center gap-1.5", lineId === l.id ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40")}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color ?? "currentColor", opacity: l.color ? 1 : 0.4 }} /><span className="truncate">{l.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Nombre del concepto</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={cn(input, "font-medium")} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Persona (adáptala a tu cliente)</span>
        <textarea value={persona} onChange={(e) => setPersona(e.target.value)} rows={2} className={cn(input, "resize-none")} />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={create} disabled={!projectId || busy} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}Crear concepto
        </button>
        <button onClick={onCancel} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
      </div>
    </div>
  )
}
