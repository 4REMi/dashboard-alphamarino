"use client"

import { useEffect, useState } from "react"
import { Loader2, Copy, Check, ChevronDown, Mic, Eye, Globe, CalendarClock, AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { analyzeLibraryAd, type LibraryAdAnalysis, type LibraryAdInput } from "@/lib/actions/ad-analysis"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"
import { cn } from "@/lib/utils"

// Desarmado de un anuncio de la librería: el concepto (ángulo, persona,
// dolor, mecanismo), la marca inferida con su nivel de confianza, el gancho,
// la estructura en el tiempo, y qué tomar / evitar / cómo adaptarlo.

const CONF = { alta: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", media: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", baja: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" }

function Chip({ ok, Icon, children }: { ok: boolean; Icon: typeof Mic; children: React.ReactNode }) {
  return <span className={cn("text-[11px] px-1.5 py-0.5 rounded inline-flex items-center gap-1", ok ? "bg-muted" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}><Icon className="w-3 h-3" />{children}</span>
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items?.length) return null
  return (
    <div className="rounded-xl border border-border p-3 space-y-1.5">
      <p className={cn("text-[11px] font-semibold uppercase tracking-wider", tone)}>{title}</p>
      <ul className="space-y-1 text-sm">{items.map((x, i) => <li key={i} className="flex gap-2"><span className="text-muted-foreground">·</span><span>{x}</span></li>)}</ul>
    </div>
  )
}

export function ConceptAnalysisModal({ ad, open, onClose }: { ad: LibraryAdInput; open: boolean; onClose: () => void }) {
  const [a, setA] = useState<LibraryAdAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || a) return
    setError(null)
    analyzeLibraryAd(ad).then(setA).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const guide = a ? ANGLE_GUIDE.find((g) => g.name === a.concepto.angle_type) : null

  function copy() {
    if (!a) return
    const c = a.concepto
    const t = [`Concepto: ${c.nombre}`, `Ángulo: ${c.angle_type} · ${c.organizing_principle} · ${c.funnel_stage} · awareness ${c.awareness_stage}`, `Persona: ${c.target_persona}`, `Dolor: ${c.pain_point}`, `Objeción: ${c.objection}`, `Transformación: ${c.transformation}`, `Por qué funciona: ${c.why_it_works}`, "", `Gancho: ${a.gancho.texto} (${a.gancho.tipo})`, `Mecánica: ${a.mecanica}`, "", "Cómo adaptarlo:", ...a.como_adaptarlo.map((x) => `- ${x}`)].join("\n")
    navigator.clipboard.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(920px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <div className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-lg">Análisis de concepto</DialogTitle>
          <p className="text-xs text-muted-foreground">{ad.pageName} · {ad.videoUrl ? "video" : "imagen"}{ad.isActive ? " · activo" : ""}</p>
        </div>

        {!a && !error && (
          <div className="px-6 py-12 text-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm">{ad.videoUrl ? "Transcribiendo, viendo el video y leyendo la landing…" : "Viendo la imagen y leyendo la landing…"}</p>
            <p className="text-xs text-muted-foreground">Toma alrededor de un minuto.</p>
          </div>
        )}
        {error && <p className="px-6 py-8 text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</p>}

        {a && (
          <div className="px-6 py-5 space-y-5">
            <div className="flex flex-wrap gap-1.5">
              {ad.videoUrl && <Chip ok={!!a.transcript} Icon={Mic}>{a.transcript ? "Transcrito" : "Sin voz"}</Chip>}
              <Chip ok={!!a.media} Icon={Eye}>{a.media ? "Visto por Gemini" : "No se pudo ver el creativo"}</Chip>
              {!a.media && a.visionError && <span className="basis-full text-[11px] text-amber-700 dark:text-amber-300 order-last">Motivo: {a.visionError}</span>}
              <Chip ok={a.landingLeida} Icon={Globe}>{a.landingLeida ? "Landing leída" : "Sin landing"}</Chip>
              {a.diasCorriendo && <Chip ok Icon={CalendarClock}>{a.diasCorriendo} días corriendo</Chip>}
              <button onClick={copy} className="ml-auto h-7 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1 hover:bg-muted">{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "Copiado" : "Copiar"}</button>
            </div>

            {/* Concepto */}
            <section className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4 space-y-3">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Concepto</p>
                  <h3 className="text-lg font-semibold leading-snug">{a.concepto.nombre}</h3>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="px-2 py-1 rounded-full bg-background border border-border">{guide?.emoji} {a.concepto.angle_type}</span>
                  <span className="px-2 py-1 rounded-full bg-background border border-border">{a.concepto.organizing_principle === "Pain-First" ? "Parte de un dolor" : "Parte de un deseo"}</span>
                  <span className="px-2 py-1 rounded-full bg-background border border-border">{a.concepto.funnel_stage} · awareness {a.concepto.awareness_stage}</span>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {([["Persona", a.concepto.target_persona], ["Dolor / deseo", a.concepto.pain_point], ["Objeción", a.concepto.objection], ["Transformación", a.concepto.transformation]] as const).map(([k, v]) => (
                  <div key={k}><p className="text-xs text-muted-foreground">{k}</p><p>{v || "—"}</p></div>
                ))}
              </div>
              <p className="text-sm"><span className="text-xs text-muted-foreground block">Por qué funciona</span>{a.concepto.why_it_works}</p>
            </section>

            {/* Gancho + mecánica + marca */}
            <div className="grid md:grid-cols-2 gap-3">
              <section className="rounded-xl border border-border p-3 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gancho · {a.gancho.tipo}</p>
                <p className="text-sm font-medium">“{a.gancho.texto}”</p>
                <p className="text-xs text-muted-foreground">{a.gancho.por_que_atrapa}</p>
                <p className="text-xs pt-1"><b>Mecánica:</b> {a.mecanica} · <b>Formato:</b> {a.formato}</p>
              </section>
              <section className="rounded-xl border border-border p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">Marca (inferida)</p>
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", CONF[a.marca.confianza] ?? CONF.media)}>confianza {a.marca.confianza}</span>
                </div>
                <p className="text-sm">{a.marca.que_vende}</p>
                <p className="text-xs text-muted-foreground"><b>Para:</b> {a.marca.audiencia} · <b>Oferta:</b> {a.marca.oferta}</p>
                <p className="text-xs text-muted-foreground"><b>Posicionamiento:</b> {a.marca.posicionamiento}</p>
                <p className="text-[11px] text-muted-foreground italic">Basado en: {a.marca.basado_en}</p>
              </section>
            </div>

            {/* Estructura */}
            {a.estructura?.length > 0 && (
              <section className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Estructura</p>
                <ol className="relative border-l border-border ml-1.5 space-y-2">
                  {a.estructura.map((e, i) => (
                    <li key={i} className="pl-4 relative">
                      <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary/70" />
                      <p className="text-xs"><span className="font-mono text-muted-foreground">{e.t}</span> <b className="capitalize">{e.momento}</b></p>
                      <p className="text-sm">{e.que_pasa}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <div className="grid md:grid-cols-3 gap-3">
              <List title="Por qué funciona" items={a.por_que_funciona} tone="text-emerald-600 dark:text-emerald-400" />
              <List title="Debilidades" items={a.debilidades} tone="text-amber-600 dark:text-amber-400" />
              <List title="Cómo adaptarlo" items={a.como_adaptarlo} tone="text-primary" />
            </div>

            {(a.transcript || a.media) && (
              <div>
                <button onClick={() => setDetail((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", detail && "rotate-180")} />Transcripción y escenas
                </button>
                {detail && (
                  <div className="mt-2 rounded-lg bg-muted/40 p-3 text-xs space-y-2 max-h-72 overflow-y-auto">
                    {a.media && <>
                      <p><b>Música:</b> {a.media.musica} · <b>Tono:</b> {a.media.tono}</p>
                      <p><b>Efectos:</b> {a.media.efectos_y_transiciones}</p>
                      <ul className="space-y-1">{a.media.escenas.map((s, i) => <li key={i}><span className="font-mono text-muted-foreground">{s.t}</span> {s.visual}{s.audio && s.audio !== "—" ? ` · 🔊 ${s.audio}` : ""}{s.texto_en_pantalla ? ` · “${s.texto_en_pantalla}”` : ""}</li>)}</ul>
                    </>}
                    {a.transcript && <p className="whitespace-pre-wrap"><b>Transcripción:</b> {a.transcript}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
