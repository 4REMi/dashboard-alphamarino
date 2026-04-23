"use client"

import { useState, useTransition } from "react"
import type { MetaCampaign } from "@/lib/types"
import { syncMetaCampaigns } from "@/lib/actions/meta"

interface Props {
  projectId: string
  cycleId: string
  campaigns: MetaCampaign[]
  hasCredentials: boolean
  canEdit: boolean
}

function fmt$(v: number | null) {
  if (v === null) return "—"
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtN(v: number | null) {
  if (v === null) return "—"
  return v.toLocaleString("en-US")
}

function fmtPct(v: number | null) {
  if (v === null) return "—"
  return `${Number(v).toFixed(2)}%`
}

export function MetaCampaignsPanel({ projectId, cycleId, campaigns: initialCampaigns, hasCredentials, canEdit }: Props) {
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>(initialCampaigns)
  const [isPending, startTransition] = useTransition()
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(
    initialCampaigns[0]?.synced_at ?? null
  )

  function handleSync() {
    setSyncError(null)
    startTransition(async () => {
      const result = await syncMetaCampaigns(projectId, cycleId)
      if (result.error) {
        setSyncError(result.error)
      } else {
        // Re-fetch updated campaigns
        const { getMetaCampaigns } = await import("@/lib/actions/meta")
        const updated = await getMetaCampaigns(projectId, cycleId)
        setCampaigns(updated)
        setLastSynced(new Date().toISOString())
      }
    })
  }

  const totalSpend = campaigns.reduce((s, c) => s + (c.spend ?? 0), 0)
  const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions ?? 0), 0)
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Campañas Meta</span>
          {lastSynced && (
            <span className="text-xs text-muted-foreground">
              · Sincronizado {new Date(lastSynced).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        {canEdit && (
          <button
            onClick={handleSync}
            disabled={isPending || !hasCredentials}
            title={!hasCredentials ? "Configura las credenciales de Meta en el contexto de cuenta" : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? (
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            Sincronizar
          </button>
        )}
      </div>

      {syncError && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">
          {syncError}
        </div>
      )}

      {!hasCredentials && (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          Configura el Ad Account ID y el Token en el contexto de cuenta para sincronizar campañas.
        </div>
      )}

      {hasCredentials && campaigns.length === 0 && !syncError && (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          Sin datos. Presiona <span className="font-medium">Sincronizar</span> para obtener métricas de este ciclo.
        </div>
      )}

      {campaigns.length > 0 && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-border bg-muted/20">
            <SummaryKpi label="Inversión total" value={fmt$(totalSpend)} />
            <SummaryKpi label="Impresiones" value={fmtN(totalImpressions)} />
            <SummaryKpi label="Clics" value={fmtN(totalClicks)} />
            <SummaryKpi label="CTR promedio" value={fmtPct(avgCtr)} />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2 font-medium text-muted-foreground">Campaña</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Inversión</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Impresiones</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Clics</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">CTR</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">CPC</th>
                  <th className="text-right px-5 py-2 font-medium text-muted-foreground">CPM</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-foreground truncate max-w-[200px]">
                      {c.campaign_name ?? c.campaign_id}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt$(c.spend)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtN(c.impressions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtN(c.clicks)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(c.ctr)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt$(c.cpc)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{fmt$(c.cpm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryKpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
