"use client"

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"

// Renders a colored numbered badge at the midpoint of a connection that
// came out of a Split Text node's part handle — the number is the order in
// which that node's connections were made (1st connection = 1, 2nd = 2,
// ...), and the color matches that part's badge on the node itself
// (split-colors.ts) so a part reads as the same color everywhere.
export function SplitOrderEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const edgeData = data as { order?: number; color?: string } | undefined
  const color = edgeData?.color ?? "#6366f1"
  const order = edgeData?.order ?? 1

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, backgroundColor: color }}
          className="nodrag nopan absolute w-5 h-5 rounded-full text-[11px] font-semibold text-white flex items-center justify-center shadow"
        >
          {order}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
