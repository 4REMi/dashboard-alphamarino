"use client"

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"
import { X } from "lucide-react"

// Renders a colored numbered badge at the midpoint of a connection that
// came out of a Split Text node's part handle — the number is the order in
// which that node's connections were made (1st connection = 1, 2nd = 2,
// ...), and the color matches that part's badge on the node itself
// (split-colors.ts) so a part reads as the same color everywhere. Same
// onDelete-via-data pattern as deletable-edge.tsx — a small × button right
// next to the number.
export function SplitOrderEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const edgeData = data as { order?: number; color?: string; onDelete?: () => void } | undefined
  const color = edgeData?.color ?? "#6366f1"
  const order = edgeData?.order ?? 1

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        <div
          // pointerEvents: "all" is required — EdgeLabelRenderer's wrapper
          // has pointer-events: none by default so it never blocks the
          // canvas, which also swallows clicks on children unless
          // explicitly re-enabled here.
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
          className="nodrag nopan absolute flex items-center gap-1"
        >
          <div
            style={{ backgroundColor: color }}
            className="w-5 h-5 rounded-full text-[11px] font-semibold text-white flex items-center justify-center shadow"
          >
            {order}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); edgeData?.onDelete?.() }}
            className="w-4 h-4 rounded-full bg-white border border-border text-muted-foreground hover:text-destructive hover:border-destructive flex items-center justify-center shadow"
            title="Eliminar conexión"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
