"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, AlertTriangle } from "lucide-react"
import { getManualCampaigns, type ManualCampaign } from "@/lib/actions/manual-campaigns"
import { derivedMetrics } from "@/lib/utils/manual-campaign-calc"
import { cn } from "@/lib/utils"
import { ManualCampaignModal } from "./manual-campaign-modal"

// Campañas manuales del ciclo en el hub, junto a los anuncios de Meta —
// para que lo que corre en TikTok/Pinterest no quede fuera de la vista
// del proyecto. Activas sin captura reciente salen en ámbar.

const money = (v: number | null) => (v === null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`)
const STATUS: Record<ManualCampaign["status"], { label: string; className: string }> = {
  active: { label: "Activa", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  paused: { label: "Pausada", className: "bg-muted text-muted-foreground" },
  ended: { label: "Terminada", className: "bg-muted text-muted-foreground" },
}

export function fmtShortDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}

export function ManualCampaignsPanel({ projectId, cycleId }: { projectId: string; cycleId: string }) {
  const [campaigns, setCampaigns] = useState<ManualCampaign[] | null>(null)
  const [open, setOpen] = useState<ManualCampaign | "new" | null>(null)
  const load = useCallback(() => { getManualCampaigns(projectId, cycleId).then(setCampaigns) }, [projectId, cycleId])
  useEffect(load, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Campañas manuales</h3>
        <span className="text-[11px] text-muted-foreground">Canales sin integración · internas</span>
        <button onClick={() => setOpen("new")} className="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted">
          <Plus className="w-3.5 h-3.5" /> Campaña manual
        </button>
      </div>
      {campaigns && campaigns.length === 0 && (
        <p className="text-xs text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">
          Sin campañas manuales en este ciclo. Úsalas para TikTok, Pinterest u otros canales que todavía no están conectados.
        </p>
      )}
      {!!campaigns?.length && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {campaigns.map((c) => {
            const d = derivedMetrics(c.cycleTotals)
            return (
              <button key={c.id} onClick={() => setOpen(c)} className={cn("text-left rounded-xl border bg-card p-3.5 hover:border-primary/50 transition-colors", c.stale ? "border-amber-300 dark:border-amber-900" : "border-border")}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-foreground/5 text-foreground">{c.channel}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">Manual</span>
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", STATUS[c.status].className)}>{STATUS[c.status].label}</span>
                </div>
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">{c.assetIds.length} assets{c.result_type ? ` · resultado: ${c.result_type}` : ""}</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
                  {[
                    ["Inversión", money(c.cycleTotals?.spend ?? null)],
                    ["Resultados", c.cycleTotals?.results?.toLocaleString("en-US") ?? "—"],
                    ["CPA", money(d.cpa)],
                    ["CTR", d.ctr === null ? "—" : `${d.ctr.toFixed(2)}%`],
                    ["CPC", money(d.cpc)],
                    ["Impresiones", c.cycleTotals?.impressions?.toLocaleString("en-US") ?? "—"],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-md bg-muted/40 px-2 py-1">
                      <p className="text-[10px] text-muted-foreground">{l}</p>
                      <p className="font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
                <p className={cn("mt-2 text-[11px] flex items-center gap-1", c.stale ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                  {c.stale && <AlertTriangle className="w-3 h-3" />}
                  {c.lastSnapshotDate ? `Datos al ${fmtShortDate(c.lastSnapshotDate)}` : "Sin métricas capturadas"}
                  {c.stale && " · actualízalas"}
                </p>
              </button>
            )
          })}
        </div>
      )}
      {open && (
        <ManualCampaignModal
          projectId={projectId}
          cycleId={cycleId}
          campaign={open === "new" ? null : open}
          onClose={() => { setOpen(null); load() }}
        />
      )}
    </div>
  )
}
