"use client"

import { useState } from "react"

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
  name:            string | null
  angle_type:      string | null
  target_persona:  string
  product_service: string | null
  pain_point:      string | null
  why_it_works:    string | null
  transformation:  string | null
  funnel_stage:    string | null
  status:          string
}

export function ConceptStrategyCard({ concept, angleEmoji, counts }: {
  concept:    Concept | null
  angleEmoji: string | null
  counts: {
    assets: number
    scripts: number
    pendingScripts: number
    pending: number
    approved: number
    changes: number
  }
}) {
  const [expanded, setExpanded] = useState(false)

  const fields = concept
    ? [
        concept.product_service && { label: "Producto / Servicio", value: concept.product_service },
        { label: "A quién le hablamos", value: concept.target_persona },
        concept.pain_point && { label: "Problema", value: concept.pain_point, accent: "rose" as const },
        concept.transformation && { label: "Transformación", value: concept.transformation, accent: "emerald" as const },
        concept.why_it_works && { label: "Por qué conecta", value: concept.why_it_works },
      ].filter(Boolean) as { label: string; value: string; accent?: "rose" | "emerald" }[]
    : []

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-center gap-3 flex-wrap hover:bg-slate-50/60 transition-colors"
      >
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
          {counts.scripts > 0 && (
            <span className="font-semibold text-slate-700">
              {counts.scripts} guión{counts.scripts !== 1 ? "es" : ""}
            </span>
          )}
          {(counts.pending + counts.pendingScripts) > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {counts.pending + counts.pendingScripts} pendiente{(counts.pending + counts.pendingScripts) !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {fields.length > 0 && (
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {expanded && (
        concept ? (
          <div className="px-5 pb-5 pt-1 border-t border-slate-100 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <StrategyField key={f.label} label={f.label} value={f.value} accent={f.accent} />
            ))}
          </div>
        ) : (
          <div className="px-5 pb-5 pt-1 border-t border-slate-100">
            <p className="text-sm text-slate-600 leading-relaxed">
              Contenido adicional que no está vinculado a un concepto específico.
            </p>
          </div>
        )
      )}
    </div>
  )
}

function StrategyField({ label, value, accent }: {
  label: string
  value: string
  accent?: "rose" | "emerald"
}) {
  const dot = accent === "rose" ? "bg-rose-400" : accent === "emerald" ? "bg-emerald-400" : "bg-slate-300"
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1 flex items-center gap-1.5">
        <span className={`w-1 h-1 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="text-[13px] leading-relaxed text-slate-700">{value}</p>
    </div>
  )
}
