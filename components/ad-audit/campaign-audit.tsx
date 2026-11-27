"use client"

import { useCallback, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  STORE_COLS_BY_KIND, computeMetric, formatMetric, formatMoney, metricById,
  type MetricId,
} from "@/lib/ad-audit/metrics"
import type { AuditAdView, CampaignAuditView } from "@/lib/ad-audit/queries"
import type { AuditJobStatus } from "@/lib/ad-audit/analysis-jobs"
import { setAdBrandLine, setAdsetResultOverride } from "@/lib/actions/ad-audits"
import { HoverVideo, MetricCell, VerdictChip, breakSummary } from "@/components/ad-audit/ui"
import { AnalysisQueueBar } from "@/components/ad-audit/analyze-parts-button"

const CREATIVE_COLS: MetricId[] = ["hook", "hold", "ctr", "cpm"]

const STORE_EVENT_LABEL: Record<string, string> = {
  landing_page_view: "visitas a la página", add_to_cart: "agregados al carrito", initiate_checkout: "pagos iniciados", purchase: "compras",
}

type SortKey = "spend" | "results" | "cpr"

export function CampaignAudit({ view, basePath, lines = [] }: {
  view: CampaignAuditView
  basePath: string
  lines?: { id: string; name: string; color: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adsetId, setAdsetId] = useState(view.adsets[0]?.id ?? "")
  const [mode, setMode] = useState<"creative" | "funnel">("creative")
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "spend", dir: -1 })
  // Selección individual para «Analizar partes» (no todos valen la pena).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const onStatus = useCallback((st: AuditJobStatus) => setPendingIds(new Set(st.pendingAdIds)), [])
  const allAds = view.adsets.flatMap((x) => x.ads)
  const canAnalyze = (a: AuditAdView) => !a.parts && a.format !== "other" && !!(a.videoUrl || a.imageUrl) && !pendingIds.has(a.id)
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const currency = view.account.currency ?? "MXN"
  const adset = view.adsets.find((s) => s.id === adsetId) ?? view.adsets[0]
  const kind = adset?.result.kind ?? "purchase"
  const cols = mode === "creative" ? CREATIVE_COLS : STORE_COLS_BY_KIND[kind]
  const grid = `28px minmax(260px,2.4fr) minmax(130px,1fr) minmax(130px,1fr) minmax(110px,0.9fr) repeat(${cols.length},minmax(84px,0.75fr)) minmax(190px,1.4fr)`

  const t = view.totals
  const kpi = (id: MetricId) => formatMetric(metricById(id, view.metrics), computeMetric(metricById(id, view.metrics), t, { isVideo: true, missing: view.campaign.missing_events }).value, currency)

  const sortVal = (a: AuditAdView) => sort.key === "spend" ? a.counters.spend : sort.key === "results" ? a.counters.results : (a.counters.results > 0 ? a.counters.spend / a.counters.results : Number.MAX_SAFE_INTEGER)
  const rows = adset ? [...adset.ads].sort((x, y) => (sortVal(x) - sortVal(y)) * sort.dir) : []
  const sortBtn = (key: SortKey, label: string) => (
    <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "cpr" ? 1 : -1 }))}
      className={cn("text-left uppercase tracking-wide", sort.key === key ? "text-foreground" : "")} aria-label={`Ordenar por ${label}`}>
      {label}{sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
    </button>
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Resumen: gasto y resultados primero */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Gasto</p>
          <p className="text-2xl font-bold tabular-nums">{formatMoney(t.spend, currency)}</p>
        </div>
        {view.resultSummary.map((r) => (
          <div key={r.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{r.label}</p>
            <p className="text-2xl font-bold tabular-nums">{Math.round(r.results).toLocaleString("es-MX")}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{r.results > 0 ? `${formatMoney(r.spend / r.results, currency)} c/u` : "—"}{r.kind === "purchase" && r.value > 0 && r.spend > 0 ? ` · ROAS ${(r.value / r.spend).toFixed(1)}` : ""}</p>
          </div>
        ))}
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">CPM · CTR</p>
          <p className="text-lg font-bold tabular-nums">{kpi("cpm")} · {kpi("ctr")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Anuncios</p>
          <p className="text-lg font-bold tabular-nums">{allAds.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {allAds.filter((a) => a.format !== "other" && a.parts).length} de {allAds.filter((a) => a.format !== "other").length} creativos analizados por partes (gancho, cuerpo y cierre).
        </p>
        <AnalysisQueueBar
          campaignId={view.campaign.id}
          selected={[...selected].filter((id) => allAds.some((a) => a.id === id && canAnalyze(a)))}
          selectable={allAds.filter(canAnalyze).length}
          onSelectAll={() => setSelected(new Set(allAds.filter(canAnalyze).map((a) => a.id)))}
          onClear={() => setSelected(new Set())}
          onStatus={onStatus}
        />
      </div>

      {view.campaign.missing_events.length > 0 && view.adsets.some((s) => s.result.kind === "purchase") && (
        <p className="rounded-lg border border-orange-500/40 bg-orange-500/5 px-3 py-2 text-sm">
          Esta cuenta no manda {view.campaign.missing_events.map((e) => STORE_EVENT_LABEL[e] ?? e).join(", ")}. Las métricas que dependen de eso dicen «no medido».
        </p>
      )}

      {/* Conjuntos */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2" role="tablist" aria-label="Conjuntos">
        {view.adsets.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === adset?.id} onClick={() => setAdsetId(s.id)}
            className={cn("h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
              s.id === adset?.id ? "border-border bg-muted text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {s.name} <span className="text-xs text-muted-foreground">· {s.ads.length}</span>
          </button>
        ))}
      </div>

      {adset && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Vista de la tabla">
                {(["creative", "funnel"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                    className={cn("h-8 rounded-md px-3 text-sm font-semibold", mode === m ? "bg-muted text-foreground" : "text-muted-foreground")}>
                    {m === "creative" ? "Creativo" : "Embudo"}
                  </button>
                ))}
              </div>
              {/* Qué cuenta como resultado en este conjunto (y corregirlo) */}
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Resultado:</span>
                <select
                  value={adset.result.source === "manual" ? (adset.result.actionTypes?.[0] ?? adset.result.field ?? "") : ""}
                  disabled={pending || !adset.id}
                  onChange={(e) => start(async () => { await setAdsetResultOverride(adset.id, e.target.value || null); router.refresh() })}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm font-semibold"
                >
                  <option value="">{adset.result.source === "manual" ? "Automático (lo que optimiza el conjunto)" : `${adset.result.label} (${adset.result.source === "fallback" ? "estimado" : "lo que optimiza"})`}</option>
                  {adset.result.options.map((o) => <option key={o.type} value={o.type}>{o.label} · {Math.round(o.total).toLocaleString("es-MX")}</option>)}
                  <option value="impressions">Impresiones</option>
                </select>
                {adset.result.source === "manual" && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">{adset.result.label} · elegido a mano</span>}
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              ↑ ↓ contra la mediana del conjunto · <span className="text-emerald-700 dark:text-emerald-300">verde</span> mejor, <span className="text-orange-700 dark:text-orange-300">naranja</span> peor · gris: muestra chica
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <div className="min-w-[1180px]">
              <div className="grid gap-3 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ gridTemplateColumns: grid }}>
                <span />
                <span>Creativo</span>
                {sortBtn("spend", "Gasto")}
                {sortBtn("results", adset.result.label)}
                <span>Veredicto</span>
                {cols.map((id) => (
                  <span key={id} title={`${metricById(id, view.metrics).formula} · mínimo ${metricById(id, view.metrics).min.label}`} className="cursor-help underline decoration-dotted underline-offset-4">{metricById(id, view.metrics).label}</span>
                ))}
                <span>Dónde se rompe</span>
              </div>
              {rows.map((ad) => {
                const share = ad.evaluation.spendShare
                return (
                  <div key={ad.id} className="grid items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0" style={{ gridTemplateColumns: grid }}>
                    {canAnalyze(ad) ? (
                      <input type="checkbox" checked={selected.has(ad.id)} onChange={() => toggle(ad.id)}
                        aria-label={`Analizar por partes ${ad.name}`} title="Marcar para analizar por partes" className="h-5 w-5 accent-primary" />
                    ) : <span aria-hidden="true" />}
                    <div className="flex min-w-0 items-center gap-3">
                      <Link href={`${basePath}/a/${ad.id}`} className="flex-none overflow-hidden rounded-lg border border-border">
                        <HoverVideo videoUrl={ad.videoUrl} posterUrl={ad.posterUrl} imageUrl={ad.imageUrl} label={ad.name}
                          className={ad.format === "video" ? "h-32 w-[72px]" : "h-24 w-24"} />
                      </Link>
                      <div className="flex min-w-0 flex-col gap-1">
                        <Link href={`${basePath}/a/${ad.id}`} className="font-semibold leading-tight hover:underline">{ad.name}</Link>
                        <span className="text-xs text-muted-foreground">{ad.format === "video" ? "Video" : ad.format === "image" ? "Imagen" : "Otro"}</span>
                        {!ad.parts && pendingIds.has(ad.id) && <span className="w-fit rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">En análisis…</span>}
                        {ad.parts && (
                          <span className="text-xs leading-snug" title={ad.conceptName ?? undefined}>
                            <span className="text-muted-foreground">G</span> {ad.parts.gancho.tipo} <span className="text-muted-foreground">· C</span> {ad.parts.cuerpo.tipo} <span className="text-muted-foreground">· Ci</span> {ad.parts.cierre.tipo}
                          </span>
                        )}
                        {lines.length > 0 && (
                          <select value={ad.brandLineId ?? ""} aria-label={`Brand Line de ${ad.name}`} disabled={pending}
                            onChange={(e) => start(async () => { await setAdBrandLine(ad.id, e.target.value || null); router.refresh() })}
                            className="h-8 w-fit max-w-full rounded-md border border-border bg-background px-1.5 text-xs">
                            <option value="">Sin línea</option>
                            {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    {/* Gasto: el foco */}
                    <div className="flex flex-col gap-1">
                      <span className="text-lg font-bold tabular-nums">{formatMoney(ad.counters.spend, currency)}</span>
                      <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, share * 100)}%` }} /></div>
                      <span className="text-xs text-muted-foreground tabular-nums">{(share * 100).toFixed(share < 0.1 ? 1 : 0)} % del conjunto</span>
                    </div>
                    {/* Resultados y su costo: el otro foco */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-lg font-bold tabular-nums">{Math.round(ad.counters.results).toLocaleString("es-MX")}</span>
                      <MetricCell id="cpr" defs={view.metrics} evaluation={ad.evaluation} currency={currency} />
                      <span className="text-[11px] text-muted-foreground">por resultado</span>
                    </div>
                    <VerdictChip evaluation={ad.evaluation} />
                    {cols.map((id) => (
                      <MetricCell key={id} id={id} defs={view.metrics} evaluation={ad.evaluation} currency={currency} isBreak={ad.evaluation.breakAt === id} />
                    ))}
                    <span className="text-[13px] leading-snug text-muted-foreground">{breakSummary(ad.evaluation, currency, view.metrics)}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Se compara solo dentro del conjunto (misma audiencia y fechas). Ganador/Perdedor por costo por resultado contra la mediana; «Sin oportunidad»: menos del 5 % del gasto; «Sin datos»: menos de 1,000 impresiones o 3 resultados. Conversiones con atribución de 7 días después del clic.
          </p>
        </div>
      )}
      {view.adsets.length === 0 && <p className="text-sm text-muted-foreground">Esta campaña no tiene anuncios capturados.</p>}
    </div>
  )
}
