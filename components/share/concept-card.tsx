"use client"

import { useState } from "react"
import { ConceptStrategyModal } from "@/components/share/concept-strategy-modal"
import { ScriptReviewModal } from "@/components/share/script-review-modal"
import type { AdCloneLine, ClientReviewStatus } from "@/lib/types"

const FUNNEL_COLORS: Record<string, string> = {
  TOF: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/60",
  MOF: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/60",
  BOF: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60",
}
const FUNNEL_LABELS: Record<string, string> = {
  TOF: "Audiencia fría",
  MOF: "Audiencia tibia",
  BOF: "Audiencia caliente",
}

interface Concept {
  name:                  string | null
  angle_type:            string | null
  organizing_principle:  string | null
  target_persona:        string
  product_service:       string | null
  pain_point:            string | null
  objection:             string | null
  why_it_works:          string | null
  transformation:        string | null
  funnel_stage:          string | null
  awareness_stage:       number | null
  status:                string
}

interface Script {
  key:             string
  briefId:         string
  scriptKey:       string
  lines:           AdCloneLine[]
  client_status:   ClientReviewStatus | null
  client_feedback: string | null
}

const STATUS_DOT: Record<string, string> = {
  approved:          "bg-emerald-400",
  changes_requested: "bg-sky-400",
}
const STATUS_LABEL: Record<string, string> = {
  approved:          "Aprobado",
  changes_requested: "Cambios pedidos",
  pending_review:    "Pendiente",
}

export function ConceptCard({ concept, angleEmoji, counts, scripts }: {
  concept:    Concept | null
  angleEmoji: string | null
  counts: {
    assets: number
    pending: number
    approved: number
    changes: number
  }
  scripts: Script[]
}) {
  const [showStrategy, setShowStrategy] = useState(false)
  const [openScript, setOpenScript]     = useState<Script | null>(null)
  const openScriptIndex = openScript ? scripts.findIndex((s) => s.key === openScript.key) : -1

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {concept?.angle_type && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-900 text-white px-2 py-0.5 rounded-md">
              {angleEmoji && <span>{angleEmoji}</span>}
              {concept.angle_type}
            </span>
          )}
          {concept?.funnel_stage && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${FUNNEL_COLORS[concept.funnel_stage] ?? "bg-slate-100 text-slate-600"}`}>
              {FUNNEL_LABELS[concept.funnel_stage] ?? concept.funnel_stage}
            </span>
          )}
          {concept?.status === "Evergreen" && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/60">
              ⭐ Validado
            </span>
          )}
        </div>

        <h3 className="text-base font-bold tracking-tight text-slate-900 flex-1 min-w-[160px]">
          {concept ? (concept.name || "Concepto") : "Piezas sueltas"}
        </h3>

        <div className="flex items-center gap-3 text-[11px] flex-wrap">
          <span className="font-semibold text-slate-700">
            {counts.assets} pieza{counts.assets !== 1 ? "s" : ""}
          </span>
          {(counts.pending) > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {counts.pending} pendiente{counts.pending !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {concept && (
          <button
            onClick={() => setShowStrategy(true)}
            className="h-7 px-3 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors shrink-0"
          >
            Ver estrategia
          </button>
        )}
      </div>

      {scripts.length > 0 && (
        <div className="px-5 pb-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {scripts.map((s, i) => {
            const status = s.client_status ?? "pending_review"
            return (
              <button
                key={s.key}
                onClick={() => setOpenScript(s)}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-amber-400"}`} />
                Guión {scripts.length > 1 ? `#${i + 1}` : ""} · {STATUS_LABEL[status]}
              </button>
            )
          })}
        </div>
      )}

      {concept && (
        <ConceptStrategyModal
          concept={concept}
          open={showStrategy}
          onClose={() => setShowStrategy(false)}
        />
      )}

      {openScript && (
        <ScriptReviewModal
          script={openScript}
          label={`Guión ${scripts.length > 1 ? `#${openScriptIndex + 1}` : "adaptado"}`}
          open={!!openScript}
          onClose={() => setOpenScript(null)}
        />
      )}
    </div>
  )
}
