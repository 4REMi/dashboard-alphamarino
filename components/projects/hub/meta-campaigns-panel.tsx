"use client"

import { Fragment, useEffect, useState, useTransition } from "react"
import type { MetaCampaign } from "@/lib/types"
import { syncMetaCampaigns, getMetaAdSets, getMetaAds, type MetaAdSetSummary, type MetaAdCreative } from "@/lib/actions/meta"

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

function fmtRoas(v: number | null) {
  if (v === null) return "—"
  return `${v.toFixed(2)}x`
}

function campaignRoas(c: MetaCampaign): number | null {
  if (c.purchase_value === null || !c.spend) return null
  return c.purchase_value / c.spend
}

const RESULTS_TYPE_LABELS: Record<string, string> = {
  "lead": "Leads",
  "purchase": "Compras",
  "omni_purchase": "Compras",
  "offsite_conversion.fb_pixel_purchase": "Compras (sitio)",
  "landing_page_view": "Vistas de landing",
  "offsite_conversion.fb_pixel_lead": "Leads (sitio)",
  "onsite_conversion.lead_grouped": "Leads",
  "offsite_conversion.fb_pixel_add_to_cart": "Agregados al carrito",
  "link_click": "Clics en el link",
  "post_engagement": "Interacciones",
  "page_engagement": "Interacciones con la página",
  "mobile_app_install": "Instalaciones de app",
  "app_install": "Instalaciones de app",
  "video_view": "Reproducciones de video",
  "store_visit": "Visitas a tienda",
  "onsite_conversion.messaging_conversation_started_7d": "Conversaciones iniciadas",
}

function resultsTypeLabel(t: string | null) {
  if (!t) return null
  return RESULTS_TYPE_LABELS[t] ?? t.replace(/^offsite_conversion\.fb_pixel_/, "").replace(/_/g, " ")
}

function isActiveStatus(status: string | null) {
  return status === "ACTIVE"
}

function StatusDot({ status }: { status: string | null }) {
  const active = isActiveStatus(status)
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
      }`}
      title={status ?? undefined}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
      {active ? "Activa" : status === "PAUSED" ? "Pausada" : status ? status : "—"}
    </span>
  )
}

export function MetaCampaignsPanel({ projectId, cycleId, campaigns: initialCampaigns, hasCredentials, canEdit }: Props) {
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>(initialCampaigns)
  const [isPending, startTransition] = useTransition()
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(
    initialCampaigns[0]?.synced_at ?? null
  )

  // Ads Manager-style drill-down — only one campaign expanded at a time to
  // keep the panel from growing too tall.
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null)

  function toggleCampaign(campaignId: string) {
    setExpandedCampaignId((prev) => prev === campaignId ? null : campaignId)
  }

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
  const totalResults = campaigns.reduce((s, c) => s + (c.results ?? 0), 0)
  const avgCostPerResult = totalResults > 0 ? totalSpend / totalResults : null
  const activeCount = campaigns.filter((c) => isActiveStatus(c.status)).length

  const salesCampaigns = campaigns.filter((c) => c.purchase_value !== null)
  const totalPurchaseValue = salesCampaigns.reduce((s, c) => s + (c.purchase_value ?? 0), 0)
  const totalSalesSpend = salesCampaigns.reduce((s, c) => s + (c.spend ?? 0), 0)
  const avgRoas = totalSalesSpend > 0 ? totalPurchaseValue / totalSalesSpend : null

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
            title={!hasCredentials ? "Configura Meta en la card Conexiones" : undefined}
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
          Configura Meta en la card Conexiones para sincronizar campañas.
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
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-3 px-5 py-3 border-b border-border bg-muted/20">
            <SummaryKpi label="Activas" value={`${activeCount}/${campaigns.length}`} />
            <SummaryKpi label="Inversión total" value={fmt$(totalSpend)} />
            <SummaryKpi label="Impresiones" value={fmtN(totalImpressions)} />
            <SummaryKpi label="Clics" value={fmtN(totalClicks)} />
            <SummaryKpi label="CTR promedio" value={fmtPct(avgCtr)} />
            <SummaryKpi label="Costo / resultado" value={fmt$(avgCostPerResult)} />
            <SummaryKpi label="ROAS" value={fmtRoas(avgRoas)} />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-6"></th>
                  <th className="text-left px-5 py-2 font-medium text-muted-foreground">Campaña</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Estado</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Inversión</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Impresiones</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Clics</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">CTR</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">CPC</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">CPM</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Resultados</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Costo/Resultado</th>
                  <th className="text-right px-5 py-2 font-medium text-muted-foreground">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const expanded = expandedCampaignId === c.campaign_id
                  return (
                  <Fragment key={c.id}>
                    <tr
                      onClick={() => toggleCampaign(c.campaign_id)}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      <td className="pl-4 text-muted-foreground">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                        </svg>
                      </td>
                      <td className="px-5 py-2.5 font-medium text-foreground truncate max-w-[200px]">
                        {c.campaign_name ?? c.campaign_id}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusDot status={c.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt$(c.spend)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtN(c.impressions)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtN(c.clicks)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(c.ctr)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt$(c.cpc)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt$(c.cpm)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtN(c.results)}
                        {c.results && resultsTypeLabel(c.results_type) && (
                          <span className="block text-[10px] text-muted-foreground font-normal">{resultsTypeLabel(c.results_type)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmt$(c.results ? (c.spend ?? 0) / c.results : null)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {fmtRoas(campaignRoas(c))}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-border/50">
                        <td colSpan={11} className="bg-muted/10 p-0">
                          <AdSetDrilldown campaignId={c.campaign_id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  )
                })}
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

// ── Ads Manager-style drill-down ────────────────────────────────────────────

function AdSetDrilldown({ campaignId }: { campaignId: string }) {
  const [adSets, setAdSets] = useState<MetaAdSetSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedAdSetId, setExpandedAdSetId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getMetaAdSets(campaignId).then((r) => {
      if (cancelled) return
      if (r.error) setError(r.error)
      setAdSets(r.adSets)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [campaignId])

  if (loading) return <div className="px-8 py-3 text-xs text-muted-foreground">Cargando ad sets…</div>
  if (error) return <div className="px-8 py-3 text-xs text-destructive">{error}</div>
  if (!adSets?.length) return <div className="px-8 py-3 text-xs text-muted-foreground">Sin ad sets.</div>

  return (
    <div className="px-8 py-3 space-y-1.5">
      {adSets.map((a) => (
        <AdSetRow
          key={a.id}
          adSet={a}
          expanded={expandedAdSetId === a.id}
          onToggle={() => setExpandedAdSetId((prev) => prev === a.id ? null : a.id)}
        />
      ))}
    </div>
  )
}

function AdSetRow({ adSet, expanded, onToggle }: {
  adSet: MetaAdSetSummary
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`w-3 h-3 text-muted-foreground transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
        </svg>
        <span className="text-xs font-medium flex-1 truncate">{adSet.name}</span>
        <StatusDot status={adSet.status} />
      </button>
      {expanded && <AdList adSetId={adSet.id} />}
    </div>
  )
}

function AdList({ adSetId }: { adSetId: string }) {
  const [ads, setAds] = useState<MetaAdCreative[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedAd, setSelectedAd] = useState<MetaAdCreative | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getMetaAds(adSetId).then((r) => {
      if (cancelled) return
      if (r.error) setError(r.error)
      setAds(r.ads)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [adSetId])

  return (
    <div className="border-t border-border/60 px-3 py-3">
      {loading && <p className="text-xs text-muted-foreground">Cargando ads…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!loading && !error && ads?.length === 0 && <p className="text-xs text-muted-foreground">Sin ads.</p>}
      {!loading && ads && ads.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ads.map((ad) => (
            <button key={ad.id} onClick={() => setSelectedAd(ad)} className="w-20 flex flex-col gap-1 items-center group">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border relative">
                {(ad.thumbnailUrl || ad.imageUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ad.thumbnailUrl ?? ad.imageUrl!} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] text-center px-1">Sin preview</div>
                )}
                {ad.videoUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">{ad.name}</span>
            </button>
          ))}
        </div>
      )}
      {selectedAd && <AdCreativeModal ad={selectedAd} onClose={() => setSelectedAd(null)} />}
    </div>
  )
}

function AdCreativeModal({ ad, onClose }: { ad: MetaAdCreative; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70" onClick={onClose}>
      <div className="bg-card rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold truncate">{ad.name}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>
        <div className="bg-black flex justify-center">
          {ad.videoUrl ? (
            <video src={ad.videoUrl} controls className="max-w-full max-h-[400px]" />
          ) : ad.imageUrl || ad.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.imageUrl ?? ad.thumbnailUrl!} alt="" className="max-w-full max-h-[400px] object-contain" />
          ) : (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-xs">Sin preview disponible</div>
          )}
        </div>
        <div className="p-4 space-y-2 text-sm">
          {ad.title && <p className="font-semibold">{ad.title}</p>}
          {ad.body && <p className="text-muted-foreground whitespace-pre-wrap">{ad.body}</p>}
          {ad.cta && <span className="inline-block text-xs font-medium bg-muted px-2 py-1 rounded">{ad.cta}</span>}
          {!ad.title && !ad.body && !ad.cta && <p className="text-xs text-muted-foreground">Sin copy disponible.</p>}
        </div>
      </div>
    </div>
  )
}
