"use client"

import { useState } from "react"
import type { PaidMediaCycle } from "@/lib/types"
import { DELIVERABLE_STATUS_LABELS, CAMPAIGN_STATUS_LABELS } from "@/lib/types"
import { formatCycleRange } from "@/lib/utils"

interface Props {
  cycles: PaidMediaCycle[]
}

export function PaidMediaCycleHistory({ cycles }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (cycles.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">Historial de Ciclos</h3>
      </div>
      <div className="divide-y divide-border">
        {cycles.map((cycle) => {
          const isOpen = openId === cycle.id
          return (
            <div key={cycle.id}>
              <button
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors text-left"
                onClick={() => setOpenId(isOpen ? null : cycle.id)}
              >
                <span className="text-sm font-medium text-foreground">{formatCycleRange(cycle.start_date, cycle.end_date)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {cycle.campaign_status ? CAMPAIGN_STATUS_LABELS[cycle.campaign_status] : "—"}
                  </span>
                  <span className="text-muted-foreground text-xs transition-transform" style={{ display: "inline-block", transform: isOpen ? "rotate(180deg)" : "none" }}>▾</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                    {[
                      { label: "Inversión", val: cycle.real_spend ? `$${cycle.real_spend.toLocaleString()}` : "—" },
                      { label: "ROAS", val: cycle.roas_real ? `${cycle.roas_real}x` : "—" },
                      { label: "CPA", val: cycle.cpa_real ? `$${cycle.cpa_real}` : "—" },
                      { label: "Resultados", val: cycle.real_results?.toString() ?? "—" },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-muted/30 rounded-lg p-2.5">
                        <p className="text-muted-foreground">{label}</p>
                        <p className="font-semibold text-foreground mt-0.5">{val}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 text-xs">
                    <span>Reporte: <span className="font-medium">{DELIVERABLE_STATUS_LABELS[cycle.report_status]}</span></span>
                    <span>Creativo: <span className="font-medium">{DELIVERABLE_STATUS_LABELS[cycle.creative_status]}</span></span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
