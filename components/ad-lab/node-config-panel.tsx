"use client"

import { useEffect, useRef, useState } from "react"
import { X, Upload, Loader2, DollarSign } from "lucide-react"
import type { AdNodeData, AdNodeConfig, AdNodeRun } from "@/lib/types"
import { LLM_MODELS, IMAGE_MODELS, VIDEO_MODELS } from "@/lib/actions/ad-nodes/providers/models"
import { uploadNodeImage } from "@/lib/actions/ad-nodes/workflows"
import { estimateImageCostUsd, estimateVideoCostUsd } from "@/lib/actions/ad-nodes/providers/pricing"
import { SPLIT_PART_COLORS } from "@/components/ad-lab/split-colors"

interface Props {
  workflowId: string
  data: AdNodeData
  run: AdNodeRun | undefined
  onClose: () => void
  onSave: (label: string, config: AdNodeConfig) => void
}

// 3-column layout matching the competitor screenshots: INPUT (read-only —
// what this node type expects from upstream edges), PARAMETERS (the
// editable model/prompt/config), OUTPUT (the last cached result, if any).
export function NodeConfigPanel({ workflowId, data, run, onClose, onSave }: Props) {
  const [label, setLabel] = useState(data.label)
  const [config, setConfig] = useState<AdNodeConfig>(data.config)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [estimatedCost, setEstimatedCost] = useState<number | null | "loading">(null)

  function set<K extends keyof AdNodeConfig>(key: K, value: AdNodeConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  // Live cost estimate — refetched from APIMart's public pricing endpoint
  // whenever the fields that affect price change, so it's never stale
  // relative to what's actually configured.
  const isGeneration = data.type === "generate_image" || data.type === "generate_video"
  useEffect(() => {
    if (!isGeneration || !config.model?.startsWith("apimart:")) { setEstimatedCost(null); return }
    const model = config.model.replace("apimart:", "")
    setEstimatedCost("loading")
    const promise = data.type === "generate_video"
      ? estimateVideoCostUsd(model, config.resolution ?? "720P", config.durationSeconds ?? 30)
      : estimateImageCostUsd(model, config.aspectRatio ?? "1:1")
    promise.then(setEstimatedCost).catch(() => setEstimatedCost(null))
  }, [isGeneration, data.type, config.model, config.aspectRatio, config.resolution, config.durationSeconds])

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const url = await uploadNodeImage(workflowId, fd)
      set("imageUrl", url)
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo subir la imagen")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function handleSave() {
    onSave(label, config)
    onClose()
  }

  const inputHint: Record<string, string> = {
    text: "Sin inputs — este nodo es el punto de partida.",
    image: "Sin inputs — sube o pega una URL de imagen.",
    analysis: "Requiere una imagen de un nodo Image conectado.",
    llm: "Opcional: texto/resultado de nodos conectados, se agrega antes de tu prompt.",
    generate_image: "Opcional: texto (para el prompt) e imágenes (como referencia) de nodos conectados.",
    generate_video: "Opcional: texto (para el prompt) e imágenes (como referencia) de nodos conectados.",
    sticky_note: "No aplica — es solo una nota visual.",
    split_text: "Texto propio (abajo) o, si se deja vacío, el texto de un nodo conectado.",
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[520px] bg-card border-l border-border shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="text-sm font-semibold bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 -mx-1"
        />
        <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Input</p>
          <p className="text-xs text-muted-foreground">{inputHint[data.type]}</p>
        </section>

        <section className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Parameters</p>

          {(data.type === "text" || data.type === "sticky_note") && (
            <textarea
              value={config.value ?? ""}
              onChange={(e) => set("value", e.target.value)}
              rows={4}
              placeholder="Texto…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          )}

          {data.type === "split_text" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Delimitador</label>
                <select
                  value={config.splitDelimiter ?? "newline"}
                  onChange={(e) => set("splitDelimiter", e.target.value as "newline" | "json")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="newline">Salto de línea (una parte por línea)</option>
                  <option value="json">JSON (array de strings, u objeto — sus valores)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Texto (opcional si viene de un nodo conectado)</label>
                <textarea
                  value={config.value ?? ""}
                  onChange={(e) => set("value", e.target.value)}
                  rows={4}
                  placeholder={config.splitDelimiter === "json" ? '["hook 1", "hook 2", "hook 3"]' : "Línea 1\nLínea 2\nLínea 3"}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>
          )}

          {data.type === "image" && (
            <div className="space-y-2">
              {config.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={config.imageUrl} alt="" className="rounded-md w-full max-h-48 object-contain bg-muted/30" />
              )}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFilePick}
                  className="hidden"
                  id="node-image-upload"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Subir imagen
                </button>
              </div>
              <input
                value={config.imageUrl ?? ""}
                onChange={(e) => set("imageUrl", e.target.value)}
                placeholder="O pega una URL de imagen"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {(data.type === "llm" || data.type === "analysis") && (
            <>
              {data.type === "llm" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Modelo</label>
                  <select
                    value={config.model ?? "claude-sonnet-4-6"}
                    onChange={(e) => set("model", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {LLM_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              )}
              {data.type === "llm" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">System prompt (opcional)</label>
                  <textarea
                    value={config.systemPrompt ?? ""}
                    onChange={(e) => set("systemPrompt", e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Prompt</label>
                <textarea
                  value={config.prompt ?? ""}
                  onChange={(e) => set("prompt", e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </>
          )}

          {(data.type === "generate_image" || data.type === "generate_video") && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Modelo</label>
                <select
                  value={config.model ?? ""}
                  onChange={(e) => set("model", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Elige un modelo</option>
                  {(data.type === "generate_image" ? IMAGE_MODELS : VIDEO_MODELS).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Prompt adicional</label>
                <textarea
                  value={config.prompt ?? ""}
                  onChange={(e) => set("prompt", e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Aspect ratio</label>
                  <select
                    value={config.aspectRatio ?? "1:1"}
                    onChange={(e) => set("aspectRatio", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {["1:1", "9:16", "16:9", "4:5"].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {data.type === "generate_image" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Nivel de seguridad</label>
                    <select
                      value={config.safetyFilterLevel ?? "block_only_high"}
                      onChange={(e) => set("safetyFilterLevel", e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="block_most">Estricto</option>
                      <option value="block_only_high">Default</option>
                      <option value="block_none">Permisivo</option>
                    </select>
                  </div>
                )}
                {data.type === "generate_video" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Resolución</label>
                    <select
                      value={config.resolution ?? "720P"}
                      onChange={(e) => set("resolution", e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {["480P", "720P", "1080P"].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {data.type === "generate_video" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Duración (segundos)</label>
                  <input
                    type="number"
                    min={1}
                    value={config.durationSeconds ?? 30}
                    onChange={(e) => set("durationSeconds", Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* Costo estimado — jalado en vivo de la tabla de precios
                  pública de APIMart, nunca un número fijo en el código.
                  Solo aplica a modelos de APIMart; Replicate no tiene un
                  endpoint de precios equivalente que podamos consultar. */}
              {isGeneration && config.model?.startsWith("apimart:") && (
                <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                  {estimatedCost === "loading" ? "Calculando costo estimado…"
                    : estimatedCost === null ? "No se pudo estimar el costo para esta configuración"
                    : `Costo estimado: $${estimatedCost.toFixed(4)} USD (precio oficial de APIMart, en vivo)`}
                </div>
              )}
            </>
          )}
        </section>

        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Output</p>
          {!run || run.status === "idle" ? (
            <p className="text-xs text-muted-foreground">Sin resultado todavía — dale Run en el nodo.</p>
          ) : run.status === "running" ? (
            <p className="text-xs text-amber-700">Generando…</p>
          ) : run.status === "error" ? (
            <p className="text-xs text-destructive">{run.error_message}</p>
          ) : (
            <div className="space-y-2">
              {run.estimated_cost_usd !== null && (
                <p className="text-[11px] font-medium text-emerald-700">
                  Costo estimado de esta corrida: ${run.estimated_cost_usd.toFixed(4)} USD
                </p>
              )}
              {run.output?.text && <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded-md p-2">{run.output.text}</p>}
              {run.output?.parts?.map((part, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-muted/40 rounded-md p-2">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full text-[10px] font-semibold flex items-center justify-center text-white" style={{ backgroundColor: SPLIT_PART_COLORS[i % SPLIT_PART_COLORS.length] }}>{i + 1}</span>
                  <span className="whitespace-pre-wrap">{part}</span>
                </div>
              ))}
              {run.output?.analysis && <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded-md p-2">{run.output.analysis}</p>}
              {run.output?.image_urls?.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="rounded-md w-full" />
              ))}
              {run.output?.video_url && (
                <video src={run.output.video_url} controls className="rounded-md w-full" />
              )}
            </div>
          )}
        </section>
      </div>

      <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5">Cancelar</button>
        <button onClick={handleSave} className="text-sm bg-primary text-primary-foreground px-4 py-1.5 rounded-md hover:bg-primary/90">Guardar</button>
      </div>
    </div>
  )
}
