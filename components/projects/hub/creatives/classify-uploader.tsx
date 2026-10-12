"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload, Loader2, Check, ChevronDown, Plus, Film, ImageIcon, AlertTriangle, Eye, Mic } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import { captureVideoThumbnail } from "@/components/projects/hub/creatives/asset-modal"
import { registerUploadedAsset, classifyAsset, assignAssetToConcept, createConceptFromAsset, type Classification, type ConceptDraft } from "@/lib/actions/creative-classify"
import type { BrandLine } from "@/lib/types"
import { cn } from "@/lib/utils"

// "Subir y clasificar": videos sin brief → se suben como borrador, se
// transcriben, Gemini los "ve" y Claude propone a qué concepto van (o uno
// nuevo pre-llenado). Una tarjeta por video; nada se asigna sin un clic.

const ANGULOS = ["Desired Outcome", "Objection", "Feature / Benefit", "Use Case", "Consequence", "Misconception", "Education", "Acceptance", "Failed Solutions", "Identity"]
const MAX_VIDEO = 150 * 1024 * 1024
const MAX_IMAGE = 20 * 1024 * 1024
const isImg = (f: File) => f.type.startsWith("image/")

type Item = {
  key: string
  file: File
  previewUrl: string
  stage: "uploading" | "analyzing" | "ready" | "done" | "error"
  error?: string
  assetId?: string
  result?: Classification
  draft?: ConceptDraft
  doneLabel?: string
}

// Se abre desde el encabezado de una línea ("Desde videos"): es otra forma de
// crear conceptos, junto a "Nuevo" (manual) y "Generar" (IA desde Brand Brain).
export function ClassifyUploader({ projectId, cycleId, brandLines, lineId, open, onOpenChange, onDone }: {
  projectId: string; cycleId: string | null; brandLines: BrandLine[]; lineId: string | null
  open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void
}) {
  const lineName = brandLines.find((l) => l.id === lineId)?.name ?? "General"
  const [items, setItems] = useState<Item[]>([])
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Al reabrir (quizá desde otra línea) se limpian los ya resueltos.
  useEffect(() => { if (open) setItems((xs) => xs.filter((x) => x.stage === "uploading" || x.stage === "analyzing" || x.stage === "ready")) }, [open])
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)))

  const processOne = useCallback(async (it: Item) => {
    try {
      const supabase = createClient()
      const uuid = crypto.randomUUID()
      const ext = (it.file.name.split(".").pop() ?? "mp4").slice(0, 4).toLowerCase()
      const kind = isImg(it.file) ? "image" : "video"
      const path = `${projectId}/${uuid}/${kind}.${ext}`
      const { error } = await supabase.storage.from("creative-assets").upload(path, it.file, { contentType: it.file.type, upsert: false })
      if (error) throw new Error(`Error al subir: ${error.message}`)
      let thumbPath: string | null = null
      const thumb = kind === "video" ? await captureVideoThumbnail(it.previewUrl) : null
      if (thumb) {
        const tp = `${projectId}/${uuid}/thumbnail.jpg`
        const { error: te } = await supabase.storage.from("creative-assets").upload(tp, thumb, { contentType: "image/jpeg", upsert: false })
        if (!te) thumbPath = tp
      }
      const assetId = await registerUploadedAsset(projectId, { file_path: path, thumbnail_path: thumbPath, file_type: kind, cycle_id: cycleId })
      patch(it.key, { stage: "analyzing", assetId })
      const result = await classifyAsset(projectId, assetId, lineId)
      patch(it.key, { stage: "ready", result, draft: result.new_concept })
    } catch (e) {
      patch(it.key, { stage: "error", error: e instanceof Error ? e.message : String(e) })
    }
  }, [projectId, cycleId, lineId])

  function addFiles(files: File[]) {
    const media = files.filter((f) => f.type.startsWith("video/") || isImg(f))
    const next: Item[] = media.map((f) => {
      const tooBig = f.size > (isImg(f) ? MAX_IMAGE : MAX_VIDEO)
      return { key: crypto.randomUUID(), file: f, previewUrl: URL.createObjectURL(f), stage: tooBig ? "error" : "uploading", error: tooBig ? `Supera ${isImg(f) ? "20" : "150"} MB` : undefined }
    })
    setItems((xs) => [...next, ...xs])
    // De dos en dos para no saturar transcripción/IA.
    const queue = next.filter((x) => x.stage === "uploading")
    const worker = async () => { for (let it = queue.shift(); it; it = queue.shift()) await processOne(it) }
    void Promise.all([worker(), worker()])
  }

  async function assign(it: Item, conceptId: string, name: string) {
    patch(it.key, { stage: "analyzing" })
    try { await assignAssetToConcept(projectId, it.assetId!, conceptId); patch(it.key, { stage: "done", doneLabel: `Asignado a "${name}"` }); onDone() }
    catch (e) { patch(it.key, { stage: "ready", error: e instanceof Error ? e.message : String(e) }) }
  }
  async function createNew(it: Item) {
    patch(it.key, { stage: "analyzing" })
    try { await createConceptFromAsset(projectId, it.assetId!, it.draft!, cycleId); patch(it.key, { stage: "done", doneLabel: `Concepto nuevo "${it.draft!.name}" creado` }); onDone() }
    catch (e) { patch(it.key, { stage: "ready", error: e instanceof Error ? e.message : String(e) }) }
  }

  const pending = items.filter((x) => x.stage === "uploading" || x.stage === "analyzing").length

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[min(1000px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
          <div className="px-6 pt-5 pb-3 border-b border-border">
            <DialogTitle className="text-lg">Conceptos desde videos · {lineName}</DialogTitle>
            <p className="text-xs text-muted-foreground">Para videos o imágenes que no salieron de un brief. La IA los transcribe (si tienen voz), los ve y te dice a qué concepto pertenecen, o te propone uno nuevo. Entran como borrador: el cliente no los ve.</p>
          </div>

          <div className="p-6 space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files]) }}
              onClick={() => inputRef.current?.click()}
              className={cn("rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors", drag ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30")}>
              <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium mt-2">Arrastra videos o imágenes, o haz clic</p>
              <p className="text-xs text-muted-foreground">Hasta 150 MB cada uno · ~1 minuto de análisis por video</p>
              <input ref={inputRef} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = "" }} />
            </div>
            {pending > 0 && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Procesando {pending} video{pending === 1 ? "" : "s"}… puedes seguir agregando.</p>}

            {items.map((it) => <ItemCard key={it.key} it={it} brandLines={brandLines} onDraft={(d) => patch(it.key, { draft: d })} onAssign={(id, name) => assign(it, id, name)} onCreate={() => createNew(it)} />)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ItemCard({ it, brandLines, onDraft, onAssign, onCreate }: { it: Item; brandLines: BrandLine[]; onDraft: (d: ConceptDraft) => void; onAssign: (id: string, name: string) => void; onCreate: () => void }) {
  const [showDetail, setShowDetail] = useState(false)
  const r = it.result
  const d = it.draft
  const field = "w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
  const set = (p: Partial<ConceptDraft>) => d && onDraft({ ...d, ...p })
  const lineColor = (id: string | null) => brandLines.find((l) => l.id === id)?.color ?? "#94a3b8"

  return (
    <article className={cn("rounded-xl border bg-card overflow-hidden", it.stage === "done" ? "border-emerald-300 dark:border-emerald-800" : it.stage === "error" ? "border-red-300 dark:border-red-900" : "border-border")}>
      <div className="grid md:grid-cols-[150px_1fr]">
        <div className="bg-black flex items-center justify-center">
          {isImg(it.file)
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={it.previewUrl} alt="" className="w-full max-h-[260px] object-contain" />
            : <video src={it.previewUrl} controls muted className="w-full max-h-[260px] object-contain" />}
        </div>
        <div className="p-4 space-y-3 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">{isImg(it.file) ? <ImageIcon className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}<span className="truncate">{it.file.name}</span></div>

          {(it.stage === "uploading" || (it.stage === "analyzing" && !r)) && (
            <p className="text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{it.stage === "uploading" ? "Subiendo…" : isImg(it.file) ? "Analizando la imagen…" : "Transcribiendo y viendo el video…"}</p>
          )}
          {it.stage === "error" && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{it.error}</p>}
          {it.stage === "done" && <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><Check className="w-4 h-4" />{it.doneLabel}</p>}

          {r && it.stage !== "done" && (
            <>
              <div>
                <p className="text-sm font-medium">{r.summary}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px]">
                  {!isImg(it.file) && <span className={cn("px-1.5 py-0.5 rounded inline-flex items-center gap-1", r.transcript ? "bg-muted" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}><Mic className="w-3 h-3" />{r.transcript ? "Transcrito" : "Sin voz"}</span>}
                  <span className={cn("px-1.5 py-0.5 rounded inline-flex items-center gap-1", r.video ? "bg-muted" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}><Eye className="w-3 h-3" />{r.video ? "Visto por Gemini" : (isImg(it.file) ? "No se pudo analizar la imagen" : "No se pudo ver: solo transcripción")}</span>
                  {r.video && <span className="px-1.5 py-0.5 rounded bg-muted">{r.video.formato}</span>}
                  <button onClick={() => setShowDetail((v) => !v)} className="text-primary hover:underline inline-flex items-center gap-0.5">Detalle<ChevronDown className={cn("w-3 h-3", showDetail && "rotate-180")} /></button>
                </div>
                {showDetail && (
                  <div className="mt-2 rounded-lg bg-muted/40 p-3 text-xs space-y-2 max-h-64 overflow-y-auto">
                    {r.video && (
                      <>
                        <p><b>Gancho:</b> {r.video.gancho}</p>
                        <p><b>Música:</b> {r.video.musica} · <b>Tono:</b> {r.video.tono}</p>
                        <p><b>Efectos:</b> {r.video.efectos_y_transiciones}</p>
                        <ul className="space-y-1">{r.video.escenas.map((s, i) => <li key={i}><span className="font-mono text-muted-foreground">{s.t}</span> {s.visual}{s.audio ? ` · 🔊 ${s.audio}` : ""}{s.texto_en_pantalla ? ` · “${s.texto_en_pantalla}”` : ""}</li>)}</ul>
                      </>
                    )}
                    {r.transcript && <p className="whitespace-pre-wrap"><b>Transcripción:</b> {r.transcript}</p>}
                  </div>
                )}
              </div>

              {r.matches.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Encaja en</p>
                  {r.matches.map((m) => (
                    <button key={m.concept_id} onClick={() => onAssign(m.concept_id, m.name)} disabled={it.stage === "analyzing"}
                      className="w-full text-left rounded-lg border border-border hover:border-primary hover:bg-primary/5 px-3 py-2 flex items-center gap-3 disabled:opacity-50">
                      <span className="w-12 shrink-0">
                        <span className={cn("block text-sm font-bold tabular-nums", m.confidence >= 70 ? "text-emerald-600" : m.confidence >= 40 ? "text-amber-600" : "text-muted-foreground")}>{m.confidence}%</span>
                        <span className="block h-1 rounded-full bg-muted overflow-hidden"><span className={cn("block h-full", m.confidence >= 70 ? "bg-emerald-500" : m.confidence >= 40 ? "bg-amber-400" : "bg-muted-foreground/40")} style={{ width: `${m.confidence}%` }} /></span>
                      </span>
                      <span className="flex-1 min-w-0"><b className="text-sm block truncate">{m.name}</b><span className="text-xs text-muted-foreground line-clamp-2">{m.reason}</span></span>
                      <span className="text-xs font-medium text-primary shrink-0">Asignar</span>
                    </button>
                  ))}
                </div>
              )}

              {d && (
                <div className="rounded-lg border border-dashed border-violet-300 dark:border-violet-800 p-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">O concepto nuevo (editable)</p>
                  <input value={d.name} onChange={(e) => set({ name: e.target.value })} className={cn(field, "font-medium")} />
                  <div className="grid sm:grid-cols-3 gap-2">
                    <select value={d.angle_type} onChange={(e) => set({ angle_type: e.target.value })} className={field}>{ANGULOS.map((a) => <option key={a}>{a}</option>)}</select>
                    <select value={d.funnel_stage} onChange={(e) => set({ funnel_stage: e.target.value as ConceptDraft["funnel_stage"] })} className={field}>{["TOF", "MOF", "BOF"].map((f) => <option key={f}>{f}</option>)}</select>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: lineColor(d.brand_line_id) }} />
                      <select value={d.brand_line_id ?? ""} onChange={(e) => set({ brand_line_id: e.target.value || null })} className={field}><option value="">General</option>{brandLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                    </div>
                  </div>
                  <textarea value={d.target_persona} onChange={(e) => set({ target_persona: e.target.value })} rows={2} placeholder="Persona" className={cn(field, "resize-none")} />
                  <textarea value={d.pain_point} onChange={(e) => set({ pain_point: e.target.value })} rows={2} placeholder="Dolor / deseo" className={cn(field, "resize-none")} />
                  <button onClick={onCreate} disabled={it.stage === "analyzing" || !d.name.trim()} className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-violet-700 disabled:opacity-50">
                    {it.stage === "analyzing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Crear concepto y asignar
                  </button>
                </div>
              )}
              {it.error && <p className="text-xs text-red-600">{it.error}</p>}
            </>
          )}
        </div>
      </div>
    </article>
  )
}
