"use client"

import { useState } from "react"
import { X } from "lucide-react"
import type { AdNodeData, AdNodeConfig, AdNodeRun } from "@/lib/types"
import { IMAGE_MODELS, VIDEO_MODELS } from "@/lib/actions/ad-nodes/providers/models"

interface Props {
  data: AdNodeData
  run: AdNodeRun | undefined
  onClose: () => void
  onSave: (label: string, config: AdNodeConfig) => void
}

// 3-column layout matching the competitor screenshots: INPUT (read-only —
// what this node type expects from upstream edges), PARAMETERS (the
// editable model/prompt/config), OUTPUT (the last cached result, if any).
export function NodeConfigPanel({ data, run, onClose, onSave }: Props) {
  const [label, setLabel] = useState(data.label)
  const [config, setConfig] = useState<AdNodeConfig>(data.config)

  function set<K extends keyof AdNodeConfig>(key: K, value: AdNodeConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }))
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

          {data.type === "image" && (
            <input
              value={config.imageUrl ?? ""}
              onChange={(e) => set("imageUrl", e.target.value)}
              placeholder="URL de la imagen"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}

          {(data.type === "llm" || data.type === "analysis") && (
            <>
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
              </div>
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
              {run.output?.text && <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded-md p-2">{run.output.text}</p>}
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
