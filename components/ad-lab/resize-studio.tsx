"use client"

import { useRef, useState } from "react"
import { Expand, Upload, ImageIcon, X, Loader2, Download, FolderPlus, Check, ChevronDown } from "lucide-react"
import type { AdBoard } from "@/lib/types"
import { submitResizePrediction, pollResizePrediction, mirrorResizeResult } from "@/lib/actions/image-resize"
import { createClient } from "@/lib/supabase/client"
import { saveUploadedAdRecord } from "@/lib/actions/ad-lab"
import { cn } from "@/lib/utils"

const RATIOS: { value: string; label: string; description: string; cssRatio: string }[] = [
  { value: "1:1",  label: "1:1",  description: "Square",   cssRatio: "aspect-square"  },
  { value: "4:5",  label: "4:5",  description: "Portrait", cssRatio: "aspect-[4/5]"   },
  { value: "9:16", label: "9:16", description: "Story",    cssRatio: "aspect-[9/16]"  },
  { value: "16:9", label: "16:9", description: "Wide",     cssRatio: "aspect-video"   },
]

const MAX_SELECTION = 4
const POLL_INTERVAL = 3000

type PredictionState = {
  ratio:        string
  predictionId: string | null
  status:       "queued" | "processing" | "done" | "failed"
  url:          string | null
  savedToBoard: boolean
}

interface Props {
  boards: AdBoard[]
}

export function ResizeStudio({ boards }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [sourceFile,  setSourceFile]  = useState<File | null>(null)
  const [sourceUrl,   setSourceUrl]   = useState<string | null>(null)   // cached public URL
  const [preview,     setPreview]     = useState<string | null>(null)   // local blob URL
  const [selectedRatios, setSelectedRatios] = useState<string[]>([])
  const [predictions, setPredictions] = useState<PredictionState[]>([])
  const [isRunning,   setIsRunning]   = useState(false)
  const [uploadingSource, setUploadingSource] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [sessionId]   = useState(() => crypto.randomUUID())

  // Board selector per result
  const [savingRatio, setSavingRatio] = useState<string | null>(null)
  const [boardPickerRatio, setBoardPickerRatio] = useState<string | null>(null)

  function toggleRatio(ratio: string) {
    setSelectedRatios((prev) => {
      if (prev.includes(ratio)) return prev.filter((r) => r !== ratio)
      if (prev.length >= MAX_SELECTION) return prev
      return [...prev, ratio]
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith("image/")) { setError("Solo se aceptan imágenes"); return }
    if (f.size > 20 * 1024 * 1024) { setError("Máximo 20 MB"); return }

    setError(null)
    setSourceFile(f)
    setSourceUrl(null)
    setPreview(URL.createObjectURL(f))
    setPredictions([])
  }

  async function uploadSourceImage(): Promise<string> {
    if (!sourceFile) throw new Error("No hay imagen fuente")
    setUploadingSource(true)
    try {
      const supabase = createClient()
      const ext  = (sourceFile.name.split(".").pop() ?? "jpg").slice(0, 4)
      const path = `resizes/${sessionId}/source.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("ad-lab")
        .upload(path, sourceFile, { contentType: sourceFile.type, upsert: false })
      if (uploadError) throw new Error(uploadError.message)
      return supabase.storage.from("ad-lab").getPublicUrl(path).data.publicUrl
    } finally {
      setUploadingSource(false)
    }
  }

  async function handleGenerate() {
    if (!sourceFile || selectedRatios.length === 0) return
    setError(null)
    setIsRunning(true)
    setPredictions(selectedRatios.map((r) => ({
      ratio: r, predictionId: null, status: "queued", url: null, savedToBoard: false,
    })))

    try {
      // 1. Upload source image once (cached across re-generate in same session)
      const imgUrl = sourceUrl ?? await uploadSourceImage()
      setSourceUrl(imgUrl)

      // 2. Submit predictions sequentially
      const ids: string[] = []
      for (let i = 0; i < selectedRatios.length; i++) {
        if (i > 0) await sleep(500)
        const id = await submitResizePrediction(imgUrl, selectedRatios[i])
        ids.push(id)
        setPredictions((prev) => prev.map((p, idx) =>
          idx === i ? { ...p, predictionId: id, status: "processing" } : p
        ))
      }

      // 3. Poll all concurrently until all settle
      await pollAll(ids, selectedRatios)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar")
    } finally {
      setIsRunning(false)
    }
  }

  async function pollAll(ids: string[], ratios: string[]) {
    const done = new Set<number>()

    while (done.size < ids.length) {
      await sleep(POLL_INTERVAL)

      await Promise.all(ids.map(async (id, idx) => {
        if (done.has(idx)) return
        const result = await pollResizePrediction(id)

        if (result.status === "succeeded" || result.status === "failed") {
          done.add(idx)

          if (result.status === "succeeded" && result.url) {
            // Mirror to Supabase Storage so the URL doesn't expire
            const stableUrl = await mirrorResizeResult(result.url, sessionId, ratios[idx])
            setPredictions((prev) => prev.map((p, i) =>
              i === idx ? { ...p, status: "done", url: stableUrl } : p
            ))
          } else {
            setPredictions((prev) => prev.map((p, i) =>
              i === idx ? { ...p, status: "failed" } : p
            ))
          }
        }
      }))
    }
  }

  async function handleSaveToBoard(prediction: PredictionState, boardId: string) {
    if (!prediction.url) return
    setSavingRatio(prediction.ratio)
    try {
      const label = RATIOS.find((r) => r.value === prediction.ratio)?.description ?? prediction.ratio
      const name  = `${sourceFile?.name.replace(/\.[^.]+$/, "") ?? "Resize"} — ${label}`
      await saveUploadedAdRecord(prediction.url, name, false, boardId)
      setPredictions((prev) => prev.map((p) =>
        p.ratio === prediction.ratio ? { ...p, savedToBoard: true } : p
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setSavingRatio(null)
      setBoardPickerRatio(null)
    }
  }

  function handleDownload(url: string, ratio: string) {
    const a = document.createElement("a")
    a.href = url
    a.download = `resize-${ratio.replace(":", "x")}.jpg`
    a.target = "_blank"
    a.click()
  }

  const canGenerate = !!sourceFile && selectedRatios.length > 0 && !isRunning
  const hasResults  = predictions.some((p) => p.status === "done" || p.status === "failed")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Expand className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Image Resize</h1>
          <p className="text-sm text-muted-foreground">
            Expande un creativo a múltiples aspect ratios usando IA.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Left: source + config ── */}
        <div className="space-y-4">
          {/* Source image */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-medium">Imagen fuente</p>

            {preview ? (
              <div className="relative rounded-lg overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Source" className="w-full object-contain max-h-64" />
                <button
                  onClick={() => { setSourceFile(null); setSourceUrl(null); setPreview(null); setPredictions([]) }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full h-36 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/40 flex flex-col items-center justify-center gap-2 transition-colors"
              >
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  <span className="text-primary font-medium">Selecciona una imagen</span>
                </p>
                <p className="text-[11px] text-muted-foreground/60">JPG · PNG · WEBP · máx 20 MB</p>
              </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" onChange={handleFileChange} className="sr-only" />
          </div>

          {/* Ratio picker */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Aspect ratios objetivo</p>
              <span className="text-xs text-muted-foreground">{selectedRatios.length}/{MAX_SELECTION} seleccionados</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {RATIOS.map((r) => {
                const selected  = selectedRatios.includes(r.value)
                const maxed     = !selected && selectedRatios.length >= MAX_SELECTION
                return (
                  <button
                    key={r.value}
                    onClick={() => toggleRatio(r.value)}
                    disabled={maxed}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : maxed
                          ? "border-border opacity-40 cursor-not-allowed"
                          : "border-border hover:border-primary/50 hover:bg-muted/40"
                    )}
                  >
                    {/* Mini ratio preview */}
                    <div className={cn(
                      "flex-shrink-0 rounded border-2",
                      selected ? "border-primary" : "border-muted-foreground/30",
                      r.value === "1:1"  && "w-6 h-6",
                      r.value === "4:5"  && "w-5 h-[25px]",
                      r.value === "9:16" && "w-4 h-[28px]",
                      r.value === "16:9" && "w-[28px] h-4",
                    )} />
                    <div>
                      <p className="text-sm font-semibold leading-none">{r.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{r.description}</p>
                    </div>
                    {selected && <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isRunning || uploadingSource
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {uploadingSource ? "Preparando…" : "Generando…"}</>
              : <><Expand className="w-4 h-4" /> Generar {selectedRatios.length > 0 ? `${selectedRatios.length} versión${selectedRatios.length > 1 ? "es" : ""}` : ""}</>
            }
          </button>
        </div>

        {/* ── Right: results ── */}
        <div className="space-y-3">
          {predictions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border h-full min-h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Expand className="w-8 h-8 opacity-20" />
              <p className="text-sm">Los resultados aparecerán aquí</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {predictions.map((pred) => {
                const ratioMeta = RATIOS.find((r) => r.value === pred.ratio)
                return (
                  <div key={pred.ratio} className="rounded-xl border border-border bg-card overflow-hidden">
                    {/* Preview area */}
                    <div className={cn("relative bg-muted w-full overflow-hidden", ratioMeta?.cssRatio ?? "aspect-square")}>
                      {pred.status === "done" && pred.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pred.url} alt={pred.ratio} className="w-full h-full object-cover" />
                      ) : pred.status === "failed" ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                          <X className="w-5 h-5 text-destructive" />
                          <p className="text-xs text-destructive">Error</p>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            {pred.status === "queued" ? "En cola…" : "Generando…"}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="px-3 py-2 flex items-center justify-between gap-1">
                      <div>
                        <p className="text-xs font-semibold">{pred.ratio}</p>
                        <p className="text-[10px] text-muted-foreground">{ratioMeta?.description}</p>
                      </div>

                      {pred.status === "done" && pred.url && (
                        <div className="flex items-center gap-1">
                          {/* Download */}
                          <button
                            onClick={() => handleDownload(pred.url!, pred.ratio)}
                            title="Descargar"
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Save to board */}
                          {boards.length > 0 && (
                            <div className="relative">
                              <button
                                onClick={() => setBoardPickerRatio(boardPickerRatio === pred.ratio ? null : pred.ratio)}
                                disabled={savingRatio === pred.ratio || pred.savedToBoard}
                                title="Guardar en board"
                                className={cn(
                                  "p-1.5 rounded-lg transition-colors",
                                  pred.savedToBoard
                                    ? "text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                              >
                                {savingRatio === pred.ratio
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : pred.savedToBoard
                                    ? <Check className="w-3.5 h-3.5" />
                                    : <FolderPlus className="w-3.5 h-3.5" />
                                }
                              </button>

                              {boardPickerRatio === pred.ratio && (
                                <div className="absolute bottom-full right-0 mb-1 w-48 bg-popover border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                                  <p className="px-3 py-2 text-xs font-semibold border-b border-border">Guardar en board</p>
                                  <div className="py-1 max-h-40 overflow-y-auto">
                                    {boards.map((b) => (
                                      <button
                                        key={b.id}
                                        onClick={() => handleSaveToBoard(pred, b.id)}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors truncate"
                                      >
                                        {b.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {hasResults && (
            <button
              onClick={() => {
                predictions.filter((p) => p.status === "done" && p.url).forEach((p) => {
                  handleDownload(p.url!, p.ratio)
                })
              }}
              className="w-full h-9 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2 text-muted-foreground"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar todos
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
