"use client"

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"
import { X } from "lucide-react"

// Registered as the "default" edge type — every plain connection (not
// coming out of a Split Text part handle) gets this. Borrar una conexión
// solo era posible seleccionándola y presionando Backspace, nada
// descubrible — este botón × en medio de la línea (visible siempre, mismo
// criterio que los botones CRUD del nodo) la borra con un clic directo.
// onDelete viene inyectado en `data` por node-canvas.tsx (no usa
// useReactFlow directamente porque `edges` es estado controlado del padre
// — mutar el store interno de React Flow se revertiría en el siguiente
// render con el prop `edges` del padre).
export function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const onDelete = (data as { onDelete?: () => void } | undefined)?.onDelete

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.() }}
          // EdgeLabelRenderer's wrapper div has pointer-events: none so it
          // never blocks the canvas — without pointerEvents: "all" here,
          // clicks on this button fall straight through to the pane
          // underneath and never reach onClick at all.
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
          className="nodrag nopan absolute w-4 h-4 rounded-full bg-white border border-border text-muted-foreground hover:text-destructive hover:border-destructive flex items-center justify-center shadow"
          title="Eliminar conexión"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </EdgeLabelRenderer>
    </>
  )
}
