"use client"

import type { CreativeRequest } from "@/lib/types"
import { Film, ImageIcon } from "lucide-react"

interface MyCreativeRequestsProps {
  requests: CreativeRequest[]
}

export function MyCreativeRequests({ requests }: MyCreativeRequestsProps) {
  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <p>No tienes solicitudes de creativos pendientes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div key={r.id} className="border rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            {r.tipo === "video" ? (
              <Film className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {r.project?.name ?? "Proyecto"} — {r.concept?.name ?? r.concept?.angle_type ?? "Concepto"}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.tipo === "video" ? "Video" : "Imagen"}
              {r.notes ? ` · ${r.notes}` : ""}
            </p>
          </div>
          {r.project?.id && (
            <a
              href={`/projects/${r.project.id}#creative-tracker`}
              className="text-xs font-medium text-primary hover:underline flex-shrink-0"
            >
              Subir asset
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
