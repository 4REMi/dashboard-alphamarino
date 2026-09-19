"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Loader2, Play, Pencil, Copy, Trash2, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AdNodeData, AdNodeConfig, AdNodeRunStatus, AdNodeType, AdNodeRunOutput } from "@/lib/types"
import { splitPartColor } from "@/components/ad-lab/split-colors"
import { LLM_MODELS, IMAGE_MODELS, VIDEO_MODELS, VIDEO_ASPECT_RATIOS } from "@/lib/actions/ad-nodes/providers/models"
import { FALLBACK_ASPECT_RATIOS } from "@/components/ad-lab/node-config-panel"

// Muestra qué modelo está eligiendo un nodo sin tener que abrirlo — busca
// en el catálogo curado correspondiente al tipo de nodo y devuelve su
// label legible (sin el sufijo "(APIMart)", ya redundante en un chip tan
// chico). Solo aplica a los tipos con modelo elegible por el usuario —
// Analysis usa un modelo fijo internamente, no hay nada que mostrar ahí.
function modelListFor(type: AdNodeType) {
  return type === "llm" ? LLM_MODELS : type === "generate_image" ? IMAGE_MODELS : type === "generate_video" ? VIDEO_MODELS : undefined
}
function modelLabelFor(type: AdNodeType, model: string | undefined): string | undefined {
  if (!model) return undefined
  return modelListFor(type)?.find((m) => m.value === model)?.label.replace(/\s*\(APIMart\)$/, "")
}

// Single source of truth for the color-per-type coding — used both by the
// node card itself and the "+ Text / + Image / ..." toolbar buttons
// (node-canvas.tsx), so a type reads as the same color everywhere it
// appears, not just on the canvas. `accentText` is the color used for the
// TYPE label under the node's title — deliberately kept prominent (per
// diseño de referencia: el modelo y el tipo de generación son lo primero
// que se debe poder leer, sin abrir el nodo).
export const TYPE_STYLES: Record<AdNodeType, { border: string; bg: string; badge: string; accentText: string; label: string }> = {
  text:           { border: "border-sky-300",     bg: "bg-sky-50",     badge: "border-sky-300 bg-sky-50 text-sky-700",         accentText: "text-sky-600",     label: "Text" },
  image:          { border: "border-emerald-300",  bg: "bg-emerald-50", badge: "border-emerald-300 bg-emerald-50 text-emerald-700", accentText: "text-emerald-600", label: "Image" },
  analysis:       { border: "border-cyan-300",      bg: "bg-cyan-50",    badge: "border-cyan-300 bg-cyan-50 text-cyan-700",       accentText: "text-cyan-600",    label: "Image/Video Analysis" },
  llm:            { border: "border-violet-300",    bg: "bg-violet-50",  badge: "border-violet-300 bg-violet-50 text-violet-700", accentText: "text-violet-600",  label: "LLM" },
  generate_image: { border: "border-pink-300",      bg: "bg-pink-50",    badge: "border-pink-300 bg-pink-50 text-pink-700",       accentText: "text-pink-600",    label: "Generate Image" },
  generate_video: { border: "border-orange-300",    bg: "bg-orange-50",  badge: "border-orange-300 bg-orange-50 text-orange-700", accentText: "text-orange-600",  label: "Generate Video" },
  sticky_note:    { border: "border-amber-300",     bg: "bg-amber-50",   badge: "border-amber-300 bg-amber-50 text-amber-700",    accentText: "text-amber-600",   label: "Sticky Note" },
  split_text:     { border: "border-indigo-300",    bg: "bg-indigo-50",  badge: "border-indigo-300 bg-indigo-50 text-indigo-700", accentText: "text-indigo-600",  label: "Split Text" },
}

// Anillo de color alrededor de toda la tarjeta según el estado de la
// última corrida — reemplaza el pill de estado que había en el header
// (competía visualmente con el tipo/modelo, que es lo que debe destacar
// según el diseño de referencia). "running" también se refleja en el
// botón Run (disabled + spinner), así que aquí solo hace falta
// done/error para que el estado siga siendo visible de un vistazo.
const STATUS_RING: Partial<Record<AdNodeRunStatus, string>> = {
  done: "ring-1 ring-emerald-400",
  error: "ring-1 ring-destructive",
}

export interface AdNodeRenderData extends AdNodeData {
  status: AdNodeRunStatus
  errorMessage?: string | null
  estimatedCostUsd?: number | null
  output?: AdNodeRunOutput | null
  onRun: () => void
  onOpenConfig: () => void
  onDuplicate: () => void
  onDelete: () => void
  onUpdateConfig: (partial: Partial<AdNodeConfig>) => void
}

export function AdNodeComponent({ data, selected }: NodeProps & { data: AdNodeRenderData }) {
  const style = TYPE_STYLES[data.type]
  const isSticky = data.type === "sticky_note"
  const isImage = data.type === "image"
  const isGeneration = data.type === "generate_image" || data.type === "generate_video"
  const imageThumbnail = isImage ? data.config.imageUrl : data.status === "done" ? data.output?.image_urls?.[0] : undefined
  const videoThumbnail = data.type === "generate_video" && data.status === "done" ? data.output?.video_url : undefined
  const downloadUrl = imageThumbnail && !isImage ? imageThumbnail : videoThumbnail
  // Text preview — for Text nodes it's the literal input; for LLM/Analysis
  // once run, it's the actual generated text. Matches the competitor's
  // cards showing the real content directly, no need to open the node
  // just to see what it's actually saying.
  const textPreview = data.type === "text"
    ? data.config.value
    : (data.type === "llm" || data.type === "analysis") && data.status === "done"
      ? data.output?.text ?? data.output?.analysis
      : undefined
  const modelLabel = modelLabelFor(data.type, data.config.model)
  const modelList = modelListFor(data.type)

  return (
    <div
      onClick={(e) => { if (e.ctrlKey || e.metaKey) return; data.onOpenConfig() }}
      className={cn(
        "relative rounded-xl border shadow-sm w-64 cursor-pointer transition-shadow bg-white",
        style.border,
        !isSticky && STATUS_RING[data.status],
        selected && "ring-2 ring-primary"
      )}
    >
      {!isSticky && <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5" />}

      <div className={cn("px-3.5 pt-3 pb-2.5 rounded-t-xl", style.bg)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{data.label}</p>
            {/* Tipo de nodo — texto de color, no un badge chiquito — es lo
                primero que se debe leer sin abrir el nodo. Si hay modelo
                elegido, va justo al lado, mismo color. */}
            <p className={cn("text-[11px] font-semibold uppercase tracking-wide truncate", style.accentText)}>
              {style.label}{modelLabel ? ` · ${modelLabel}` : ""}
            </p>
          </div>
          {/* CRUD por nodo — siempre visibles (no ocultos tras hover: el
              hover vía `group-hover` resultó poco confiable dentro del
              contenedor de React Flow). "nodrag" es obligatorio: sin esa
              clase, el sistema de arrastre/pan del canvas intercepta el
              mousedown antes de que el click le llegue al botón. */}
          <div className="nodrag flex items-center gap-0.5 flex-shrink-0">
            {!isSticky && (
              <button
                onClick={(e) => { e.stopPropagation(); data.onOpenConfig() }}
                title="Editar nodo"
                className="p-1 rounded text-muted-foreground/70 hover:text-foreground hover:bg-black/5"
              >
                {data.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); data.onDuplicate() }}
              title="Duplicar nodo"
              className="p-1 rounded text-muted-foreground/70 hover:text-foreground hover:bg-black/5"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); data.onDelete() }}
              title="Eliminar nodo"
              className="p-1 rounded text-muted-foreground/70 hover:text-destructive hover:bg-black/5"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Miniatura — para Image nodes es lo que se subió; para Generate
          Image/Video ya corridos, el resultado. object-contain + sin alto
          fijo (solo un tope) para respetar la proporción real en vez de
          recortarla, con padding/esquinas redondeadas como en el diseño de
          referencia en vez de ir a los bordes de la tarjeta. Botón de
          descarga flotante cuando hay un resultado real generado (no para
          la imagen de referencia que subiste tú mismo). */}
      {(imageThumbnail || videoThumbnail) && (
        <div className="relative px-3 pt-3">
          {imageThumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageThumbnail} alt="" className="w-full max-h-52 object-contain rounded-lg bg-black/5" />
          )}
          {videoThumbnail && (
            <video src={videoThumbnail} controls className="nodrag w-full max-h-52 rounded-lg bg-black" />
          )}
          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              onClick={(e) => e.stopPropagation()}
              title="Descargar"
              className="nodrag absolute top-4 right-4 p-1.5 rounded-md bg-white/90 text-foreground shadow hover:bg-white"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Preview de texto — alto FIJO con scroll siempre disponible al
          pasar el mouse encima (nunca crece el nodo). Antes se expandía en
          hover, lo cual movía todo lo demás en el canvas de forma molesta.
          "nowheel" es de React Flow — sin eso, el scroll con el mouse
          adentro hace zoom/pan del canvas en vez de scrollear el texto. */}
      {textPreview && (
        <div className="nowheel mx-3.5 mt-3 px-2.5 py-2 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap border border-border rounded-lg bg-muted/30 h-24 overflow-y-auto">
          {textPreview}
        </div>
      )}

      {/* Controles rápidos directo en la tarjeta — modelo y aspect ratio
          para Generate Image/Video, sin tener que abrir el panel. Aspect
          ratio para video usa la lista real confirmada por modelo
          (VIDEO_ASPECT_RATIOS, sacada de docs.apimart.ai/api-reference —
          ver providers/models.ts); para imagen sigue el fallback estático
          del panel (ningún modelo de imagen publica esto todavía).
          "nodrag" en los selects, igual que los botones — si no, el primer
          clic solo selecciona el nodo en vez de abrir el dropdown. */}
      {isGeneration && (
        <div className="nodrag px-3.5 pt-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          <select
            value={data.config.model ?? ""}
            onChange={(e) => data.onUpdateConfig({ model: e.target.value })}
            className="w-full rounded-lg border border-input bg-white px-2.5 py-1.5 text-xs font-medium"
          >
            <option value="">Elige un modelo</option>
            {modelList?.map((m) => <option key={m.value} value={m.value}>{m.label.replace(/\s*\(APIMart\)$/, "")}</option>)}
          </select>
          <select
            value={data.config.aspectRatio ?? "1:1"}
            onChange={(e) => data.onUpdateConfig({ aspectRatio: e.target.value })}
            className="w-full rounded-lg border border-input bg-white px-2.5 py-1.5 text-xs font-medium"
          >
            {(data.type === "generate_video" ? VIDEO_ASPECT_RATIOS[(data.config.model ?? "").replace(/^apimart:/, "")] : undefined)
              ?.map((r) => <option key={r} value={r}>{r}</option>)
              ?? FALLBACK_ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}

      {isSticky ? (
        <p className="px-3.5 py-3 text-xs text-foreground/80 whitespace-pre-wrap">{data.config.value || "Nota…"}</p>
      ) : (
        <div className="px-3.5 py-3 flex items-center justify-between gap-2">
          <p className={cn("text-[11px] truncate", data.status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {data.status === "error" ? data.errorMessage
              : data.estimatedCostUsd != null ? `$${data.estimatedCostUsd.toFixed(4)} USD`
              : ""}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); data.onRun() }}
            disabled={data.status === "running"}
            className="nodrag flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full bg-foreground text-background disabled:opacity-50"
          >
            {data.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            Run
          </button>
        </div>
      )}

      {/* Split Text, corrido: cada parte es su propia fila con su propio
          handle de salida ("part-0", "part-1", ...) — reemplaza el handle
          genérico de la derecha, para poder conectar cada parte a un nodo
          downstream distinto. El color de cada fila es el mismo que el de
          la conexión numerada una vez conectada (ver split-colors.ts). */}
      {data.type === "split_text" && data.status === "done" && data.output?.parts && data.output.parts.length > 0 && (
        <div className="border-t border-border">
          {data.output.parts.map((part, i) => (
            <div key={i} className="relative flex items-center gap-2 px-3.5 py-1.5 border-b border-border last:border-b-0">
              <span
                className="flex-shrink-0 w-4 h-4 rounded-full text-[9px] font-semibold flex items-center justify-center text-white"
                style={{ backgroundColor: splitPartColor(i) }}
              >
                {i + 1}
              </span>
              <span className="text-[11px] text-foreground/80 truncate">{part || "(vacío)"}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={`part-${i}`}
                className="!w-2.5 !h-2.5"
                style={{ backgroundColor: splitPartColor(i), borderColor: splitPartColor(i) }}
              />
            </div>
          ))}
        </div>
      )}

      {!isSticky && data.type !== "split_text" && <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5" />}
    </div>
  )
}
