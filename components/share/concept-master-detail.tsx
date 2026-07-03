"use client"

import { useState } from "react"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"
import { ConceptCard } from "@/components/share/concept-card"
import { ConceptAssetsGallery } from "@/components/share/concept-assets-gallery"

interface Item {
  id:      string
  concept: any | null
  assets:  any[]
  scripts: any[]
}

const FUNNEL_DOT: Record<string, string> = {
  TOF: "bg-sky-400",
  MOF: "bg-violet-400",
  BOF: "bg-emerald-400",
}

export function ConceptMasterDetail({ items }: { items: Item[] }) {
  const firstPendingIdx = items.findIndex((it) => {
    const p = it.assets.filter((a) => !a.client_status || a.client_status === "pending_review").length
    const ps = it.scripts.filter((s) => !s.client_status || s.client_status === "pending_review").length
    return p > 0 || ps > 0
  })
  const [selectedId, setSelectedId] = useState<string | null>(
    items[firstPendingIdx >= 0 ? firstPendingIdx : 0]?.id ?? null
  )

  const selected = items.find((it) => it.id === selectedId) ?? null

  return (
    <div className="flex gap-6 items-start">
      {/* ── List ── */}
      <nav className={`w-full md:w-[300px] md:shrink-0 rounded-2xl border border-slate-200/80 bg-white overflow-hidden ${selectedId ? "hidden md:block" : ""}`}>
        {items.map((it) => {
          const pending = it.assets.filter((a) => !a.client_status || a.client_status === "pending_review").length
            + it.scripts.filter((s) => !s.client_status || s.client_status === "pending_review").length
          const total = it.assets.length + it.scripts.length
          const dotColor = it.concept?.funnel_stage ? FUNNEL_DOT[it.concept.funnel_stage] ?? "bg-slate-300" : "bg-slate-300"
          return (
            <button
              key={it.id}
              onClick={() => setSelectedId(it.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-2.5 border-b border-slate-100 last:border-0 transition-colors ${
                selectedId === it.id ? "bg-slate-900 text-white" : "hover:bg-slate-50 text-slate-800"
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${selectedId === it.id ? "bg-white/70" : dotColor}`} />
              <span className="flex-1 min-w-0 truncate text-sm font-medium">
                {it.concept ? (it.concept.name || "Concepto") : "Piezas sueltas"}
              </span>
              {pending > 0 ? (
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 ${
                  selectedId === it.id ? "bg-white text-amber-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {pending}
                </span>
              ) : total > 0 ? (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selectedId === it.id ? "bg-emerald-300" : "bg-emerald-400"}`} />
              ) : null}
            </button>
          )
        })}
      </nav>

      {/* ── Detail ── */}
      <div className={`flex-1 min-w-0 ${!selectedId ? "hidden md:block" : ""}`}>
        {selected ? (
          <div className="space-y-4">
            <button
              onClick={() => setSelectedId(null)}
              className="md:hidden inline-flex items-center gap-1 text-xs font-medium text-slate-500 mb-1"
            >
              ← Volver a la lista
            </button>

            <ConceptCard
              concept={selected.concept}
              angleEmoji={selected.concept ? ANGLE_GUIDE.find((a) => a.name === selected.concept.angle_type)?.emoji || null : null}
              counts={{
                assets:   selected.assets.length,
                pending:  selected.assets.filter((a) => !a.client_status || a.client_status === "pending_review").length,
                approved: selected.assets.filter((a) => a.client_status === "approved").length,
                changes:  selected.assets.filter((a) => a.client_status === "changes_requested").length,
              }}
              scripts={selected.scripts}
            />

            {selected.assets.length > 0 && (
              <ConceptAssetsGallery
                assets={selected.assets.map((a) => ({
                  id:              a.id,
                  format:          a.format,
                  platform:        a.platform,
                  asset_url:       a.asset_url,
                  file_path:       a.file_path ?? null,
                  thumbnail_path:  a.thumbnail_path ?? null,
                  file_type:       a.file_type ?? null,
                  client_status:   a.client_status,
                  client_feedback: a.client_feedback,
                  concept_name:    a.concept?.name ?? null,
                  concept_angle:   a.concept?.angle_type ?? null,
                  brief_id:        a.brief_id ?? null,
                }))}
              />
            )}

            {selected.assets.length === 0 && selected.scripts.length === 0 && (
              <p className="text-sm text-slate-500 px-1">
                Este concepto todavía no tiene piezas producidas ni guión en revisión.
              </p>
            )}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            Selecciona un concepto de la lista
          </div>
        )}
      </div>
    </div>
  )
}
