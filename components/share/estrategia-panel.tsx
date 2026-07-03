"use client"

import type { Concepto } from "@/components/share/client-portal-app"

const FUNNEL_BG: Record<string, string> = { TOF: "#f0f9ff", MOF: "#f5f3ff", BOF: "#ecfdf5" }
const FUNNEL_FG: Record<string, string> = { TOF: "#0369a1", MOF: "#6d28d9", BOF: "#047857" }

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      <div className="text-[12.5px] leading-relaxed text-slate-700">{value || "—"}</div>
    </div>
  )
}

export function EstrategiaPanel({ concepto, tab, setTab, compact }: {
  concepto: Concepto
  tab: "id" | "teoria" | "mec"
  setTab: (t: "id" | "teoria" | "mec") => void
  compact?: boolean
}) {
  const tabs: { key: "id" | "teoria" | "mec"; label: string }[] = [
    { key: "id",     label: "Identificación" },
    { key: "teoria", label: compact ? "Teoría" : "Teoría del ángulo" },
    { key: "mec",    label: "Mecanismo" },
  ]

  const body = (
    <div className="px-5 py-4 bg-[#fbfcfe]" style={compact ? { borderRadius: "0 0 14px 14px" } : undefined}>
      {tab === "id" && (
        <div className="flex flex-col gap-3.5">
          <Field label="Principio organizador" value={concepto.estrategia.principio} />
          <div className="border-t border-[#eef2f7] pt-3">
            <Field label="A quién le hablamos" value={concepto.estrategia.quien} />
          </div>
          <div className="border-t border-[#eef2f7] pt-3">
            <Field label="Awareness stage" value={concepto.estrategia.awareness} />
          </div>
          {concepto.funnelCode && (
            <div className="border-t border-[#eef2f7] pt-3">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Funnel stage</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: FUNNEL_BG[concepto.funnelCode] ?? "#f1f5f9", color: FUNNEL_FG[concepto.funnelCode] ?? "#475569" }}>{concepto.funnelCode}</span>
                <span className="text-[11.5px] text-slate-500">{concepto.funnel}</span>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === "teoria" && (
        <div className="flex flex-col gap-2.5">
          {concepto.estrategia.teoriaGuiding && (
            <p className="text-[12.5px] leading-relaxed text-slate-500 italic m-0">{concepto.estrategia.teoriaGuiding}</p>
          )}
          <p className="text-[12.5px] leading-relaxed text-slate-700 m-0">{concepto.estrategia.teoriaMecanismo || "Sin teoría de ángulo asignada."}</p>
        </div>
      )}
      {tab === "mec" && (
        <div className="flex flex-col gap-3.5">
          <Field label="¿Por qué va a funcionar?" value={concepto.estrategia.porque} />
          <div className="border-t border-[#eef2f7] pt-3"><Field label="Problema específico" value={concepto.estrategia.problema} /></div>
          <div className="border-t border-[#eef2f7] pt-3"><Field label="Objeción que derrumba" value={concepto.estrategia.objecion} /></div>
          <div className="border-t border-[#eef2f7] pt-3"><Field label="Transformación prometida" value={concepto.estrategia.transformacion} /></div>
        </div>
      )}
    </div>
  )

  if (compact) {
    return (
      <div className="border-t border-[#eef2f7]">
        <div className="flex border-b border-[#eef2f7] px-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 text-center py-2.5 text-[8.5px] font-bold uppercase tracking-wide -mb-px"
              style={{ color: tab === t.key ? "#0f172a" : "#94a3b8", borderBottom: `2px solid ${tab === t.key ? "#2563eb" : "transparent"}` }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {body}
      </div>
    )
  }

  const totalPend = concepto.piezas.filter((p) => (p.client_status ?? "pending_review") === "pending_review" || p.client_status === null).length

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="flex border-b border-[#e8edf4] px-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 text-center py-3 text-[9px] font-bold uppercase tracking-wide -mb-px"
              style={{ color: tab === t.key ? "#0f172a" : "#94a3b8", borderBottom: `2px solid ${tab === t.key ? "#2563eb" : "transparent"}` }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {body}
        <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center gap-3 text-[11px]">
          <span className="font-semibold text-slate-700">{concepto.piezas.length} pieza{concepto.piezas.length !== 1 ? "s" : ""} en este concepto</span>
          {concepto.vigencia !== "archivado" && totalPend > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[#b45309]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {totalPend} pendiente{totalPend !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
