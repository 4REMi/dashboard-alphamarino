"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

export function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)

  // Only show toggle if text is long enough to overflow 3 lines (rough heuristic: >200 chars)
  const isLong = text.length > 200

  return (
    <div className="text-sm text-muted-foreground">
      <p className={cn("whitespace-pre-wrap", !expanded && isLong && "line-clamp-3")}>
        {text}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-primary hover:underline"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  )
}
