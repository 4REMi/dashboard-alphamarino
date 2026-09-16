"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Loader2, Check, X, Play, Copy, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AdNodeData, AdNodeRunStatus, AdNodeType, AdNodeRunOutput } from "@/lib/types"
import { splitPartColor } from "@/components/ad-lab/split-colors"
import { LLM_MODELS, IMAGE_MODELS, VIDEO_MODELS } from "@/lib/actions/ad-nodes/providers/models"

// Muestra qué modelo está eligiendo un nodo sin tener que abrirlo — busca
// en el catálogo curado correspondiente al tipo de nodo y devuelve su
// label legible (sin el sufijo "(APIMart)", ya redundante en un chip tan
// chico). Solo aplica a los tipos con modelo elegible por el usuario —
// Analysis usa un modelo fijo internamente, no hay nada que mostrar ahí.
function modelLabelFor(type: AdNodeType, model: string | undefined): string | undefined {
  if (!model) return undefined
  const list = type === "llm" ? LLM_MODELS : type === "generate_image" ? IMAGE_MODELS : type === "generate_video" ? VIDEO_MODELS : undefined
  return list?.find((m) => m.value === model)?.label.replace(/\s*\(APIMart\)$/, "")
}

// Single source of truth for the color-per-type coding — used both by the
// node card itself and the "+ Text / + Image / ..." toolbar buttons
// (node-canvas.tsx), so a type reads as the same color everywhere it
// appears, not just on the canvas.
export const TYPE_STYLES: Record<AdNodeType, { border: string; bg: string; badge: string; label: string }> = {
  text:           { border: "border-sky-300",     bg: "bg-sky-50",     badge: "border-sky-300 bg-sky-50 text-sky-700",         label: "Text" },
  image:          { border: "border-emerald-300",  bg: "bg-emerald-50", badge: "border-emerald-300 bg-emerald-50 text-emerald-700", label: "Image" },
  analysis:       { border: "border-cyan-300",      bg: "bg-cyan-50",    badge: "border-cyan-300 bg-cyan-50 text-cyan-700",       label: "Image/Video Analysis" },
  llm:            { border: "border-violet-300",    bg: "bg-violet-50",  badge: "border-violet-300 bg-violet-50 text-violet-700", label: "LLM" },
  generate_image: { border: "border-pink-300",      bg: "bg-pink-50",    badge: "border-pink-300 bg-pink-50 text-pink-700",       label: "Generate Image" },
  generate_video: { border: "border-orange-300",    bg: "bg-orange-50",  badge: "border-orange-300 bg-orange-50 text-orange-700", label: "Generate Video" },
  sticky_note:    { border: "border-amber-300",     bg: "bg-amber-50",   badge: "border-amber-300 bg-amber-50 text-amber-700",    label: "Sticky Note" },
  split_text:     { border: "border-indigo-300",    bg: "bg-indigo-50",  badge: "border-indigo-300 bg-indigo-50 text-indigo-700", label: "Split Text" },
}

const STATUS_PILL: Record<AdNodeRunStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  running: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  error: "bg-destructive/10 text-destructive",
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
}

export function AdNodeComponent({ data, selected }: NodeProps & { data: AdNodeRenderData }) {
  const style = TYPE_STYLES[data.type]
  const isSticky = data.type === "sticky_note"
  const isImage = data.type === "image"
  const imageThumbnail = isImage ? data.config.imageUrl : data.status === "done" ? data.output?.image_urls?.[0] : undefined
  const videoThumbnail = data.type === "generate_video" && data.status === "done" ? data.output?.video_url : undefined
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

  return (
    <div
      onClick={(e) => { if (e.ctrlKey || e.metaKey) return; data.onOpenConfig() }}
      className={cn(
        "group relative rounded-lg border-2 shadow-sm w-56 cursor-pointer transition-shadow",
        style.border, style.bg,
        selected && "ring-2 ring-primary"
      )}
    >
      {!isSticky && <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5" />}

      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{style.label}</p>
          <p className="text-sm font-medium truncate">{data.label}</p>
          {/* Qué modelo tiene elegido, visible sin abrir el nodo — para
              LLM/Generate Image/Generate Video, los únicos tipos con un
              modelo elegible por el usuario. */}
          {modelLabel && <p className="text-[10px] text-muted-foreground/70 truncate">{modelLabel}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isSticky && (
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", STATUS_PILL[data.status])}>
              {data.status === "running" ? <Loader2 className="w-3 h-3 animate-spin" /> : data.status === "done" ? <Check className="w-3 h-3" /> : data.status === "error" ? <X className="w-3 h-3" /> : "idle"}
            </span>
          )}
          {/* CRUD por nodo — siempre visibles (no ocultos tras hover: el
              hover vía `group-hover` resultó poco confiable dentro del
              contenedor de React Flow, así que en vez de seguir
              apostándole se deja el botón a la vista todo el tiempo).
              "nodrag" es obligatorio: sin esa clase, el sistema de
              arrastre/pan del canvas intercepta el mousedown antes de que
              el click le llegue al botón. */}
          <div className="nodrag flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); data.onDuplicate() }}
              title="Duplicar nodo"
              className="p-1 rounded text-muted-foreground/70 hover:text-foreground hover:bg-black/5"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); data.onDelete() }}
              title="Eliminar nodo"
              className="p-1 rounded text-muted-foreground/70 hover:text-destructive hover:bg-black/5"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Miniatura — para Image nodes es lo que se subió; para Generate
          Image ya corridos, el primer resultado. object-contain + sin
          alto fijo (solo un tope) en vez del object-cover recortado de
          antes — así se aprecia la proporción real de la imagen (un 9:16
          ya no se ve recortado a la fuerza en un cuadro cuadrado), nomás
          limitando qué tan alta puede crecer la tarjeta. */}
      {imageThumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageThumbnail} alt="" className="w-full max-h-48 object-contain bg-black/5 border-t border-black/5" />
      )}

      {/* Miniatura de video — antes Generate Video no mostraba nada del
          resultado en la tarjeta, había que abrir el panel para verlo.
          "nodrag" para que arrastrar los controles nativos no mueva el
          nodo en el canvas. */}
      {videoThumbnail && (
        <video src={videoThumbnail} controls className="nodrag w-full max-h-48 bg-black border-t border-black/5" />
      )}

      {/* Preview de texto — colapsado y recortado por default; al pasar el
          cursor se vuelve escroleable con fondo blanco (mismo patrón visual
          que el competidor), para poder leer todo sin abrir el panel.
          "nowheel" es de React Flow — sin eso, el scroll con el mouse
          adentro hace zoom/pan del canvas en vez de scrollear el texto. */}
      {textPreview && (
        <div className="nowheel px-3 py-2 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap border-t border-black/5 max-h-20 overflow-hidden hover:max-h-52 hover:overflow-y-auto hover:bg-white transition-[max-height]">
          {textPreview}
        </div>
      )}

      {isSticky ? (
        <p className="px-3 pb-2.5 text-xs text-foreground/80 whitespace-pre-wrap">{data.config.value || "Nota…"}</p>
      ) : (
        <div className="px-3 pb-2.5 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground truncate max-w-[70%]">
            {data.status === "error" ? data.errorMessage
              : data.estimatedCostUsd != null ? `$${data.estimatedCostUsd.toFixed(4)} USD`
              : "Click para configurar"}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); data.onRun() }}
            disabled={data.status === "running"}
            className="nodrag flex-shrink-0 p-1 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
            title="Correr este nodo"
          >
            <Play className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Split Text, corrido: cada parte es su propia fila con su propio
          handle de salida ("part-0", "part-1", ...) — reemplaza el handle
          genérico de la derecha, para poder conectar cada parte a un nodo
          downstream distinto. El color de cada fila es el mismo que el de
          la conexión numerada una vez conectada (ver split-colors.ts). */}
      {data.type === "split_text" && data.status === "done" && data.output?.parts && data.output.parts.length > 0 && (
        <div className="border-t border-black/5">
          {data.output.parts.map((part, i) => (
            <div key={i} className="relative flex items-center gap-2 px-3 py-1.5 border-b border-black/5 last:border-b-0">
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
