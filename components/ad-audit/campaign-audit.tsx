"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  computeMetric, formatMetric, formatMoney, metricById,
  type MetricId,
} from "@/lib/ad-audit/metrics"
import type { CampaignAuditView } from "@/lib/ad-audit/queries"
import { HoverVideo, MetricCell, VerdictChip, breakSummary } from "@/components/ad-audit/ui"
import { AnalyzePartsButton } from "@/components/ad-audit/analyze-parts-button"

const CREATIVE_COLS: MetricId[] = ["hook", "hold", "ctr", "cpa"]
const STORE_COLS: MetricId[] = ["click_visit", "visit_cart", "cart_checkout", "checkout_purchase", "session_cvr", "aov", "roas"]

const STORE_EVENT_LABEL: Record<string, string> = {
  landing_page_view: "visitas a la página", add_to_cart: "agregados al carrito", initiate_checkout: "pagos iniciados", purchase: "compras",
}

export function CampaignAudit({ view, basePath }: { view: CampaignAuditView; basePath: string }) {
  const [adsetId, setAdsetId] = useState(view.adsets[0]?.id ?? "")
  const [mode, setMode] = useState<"creative" | "store">("creative")
  const currency = view.account.currency ?? "MXN"
  const adset = view.adsets.find((s) => s.id === adsetId) ?? view.adsets[0]
  const cols = mode === "creative" ? CREATIVE_COLS : STORE_COLS
  const grid = mode === "creative"
    ? "minmax(260px,2.6fr) minmax(120px,1fr) repeat(4,minmax(80px,0.8fr)) minmax(200px,1.6fr)"
    : "minmax(260px,2.6fr) minmax(120px,1fr) repeat(7,minmax(84px,0.75fr)) minmax(200px,1.5fr)"

  const t = view.totals
  const kpi = (id: MetricId) => formatMetric(metricById(id, view.metrics), computeMetric(metricById(id, view.metrics), t, { isVideo: true, missing: view.campaign.missing_events }).value, currency)

  return (
    <div className="flex flex-col gap-5">
      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          ["Gasto", formatMoney(t.spend, currency)],
          ["Compras · CPA", `${t.purchases.toLocaleString("es-MX")} · ${kpi("cpa")}`],
          ["ROAS", kpi("roas")],
          ["AOV", kpi("aov")],
          ["Conv. sesión", kpi("session_cvr")],
          ["Anuncios", String(view.adsets.reduce((n, s) => n + s.ads.length, 0))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {(() => {
            const all = view.adsets.flatMap((x) => x.ads).filter((a) => a.format !== "other")
            const done = all.filter((a) => a.parts).length
            return `${done} de ${all.length} creativos analizados por partes (gancho, cuerpo y cierre).`
          })()}
        </p>
        <AnalyzePartsButton pending={view.adsets.flatMap((x) => x.ads).filter((a) => !a.parts && a.format !== "other" && (a.videoUrl || a.imageUrl)).map((a) => ({ adId: a.id, key: a.analysisKey }))} />
      </div>

      {view.campaign.missing_events.length > 0 && (
        <p className="rounded-lg border border-orange-500/40 bg-orange-500/5 px-3 py-2 text-sm">
          Esta cuenta no manda {view.campaign.missing_events.map((e) => STORE_EVENT_LABEL[e] ?? e).join(", ")}. Las métricas que dependen de eso dicen «no medido».
        </p>
      )}

      {/* Conjuntos */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2" role="tablist" aria-label="Conjuntos">
        {view.adsets.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === adset?.id}
            onClick={() => setAdsetId(s.id)}
            className={cn("h-9 rounded-lg px-3 text-sm font-medium border transition-colors",
              s.id === adset?.id ? "bg-muted border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {s.name} <span className="text-xs text-muted-foreground">· {s.ads.length}</span>
          </button>
        ))}
      </div>

      {adset && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Vista de la tabla">
              {(["creative", "store"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                  className={cn("h-8 rounded-md px-3 text-sm font-semibold", mode === m ? "bg-muted text-foreground" : "text-muted-foreground")}>
                  {m === "creative" ? "Creativo" : "Tienda"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              ↑ ↓ contra la mediana del conjunto · <span className="text-emerald-700 dark:text-emerald-300">verde</span> mejor, <span className="text-orange-700 dark:text-orange-300">naranja</span> peor · gris: muestra chica, no se compara · pasa el mouse para ver fórmula y conteos
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <div className="min-w-[1000px]">
              <div className="grid gap-3 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ gridTemplateColumns: grid }}>
                <span>Creativo</span><span>Veredicto</span>
                {cols.map((id) => (
                  <span key={id} title={`${metricById(id, view.metrics).formula} · mínimo ${metricById(id, view.metrics).min.label}`} className="cursor-help underline decoration-dotted underline-offset-4">{metricById(id, view.metrics).label}</span>
                ))}
                <span>Dónde se rompe</span>
              </div>
              {adset.ads.map((ad) => (
                <div key={ad.id} className="grid items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0" style={{ gridTemplateColumns: grid }}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Link href={`${basePath}/a/${ad.id}`} className="flex-none overflow-hidden rounded-lg border border-border">
                      <HoverVideo videoUrl={ad.videoUrl} posterUrl={ad.posterUrl} imageUrl={ad.imageUrl} label={ad.name}
                        className={ad.format === "video" ? "h-32 w-[72px]" : "h-24 w-24"} />
                    </Link>
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link href={`${basePath}/a/${ad.id}`} className="truncate font-semibold hover:underline">{ad.name}</Link>
                      <span className="text-xs text-muted-foreground">{ad.format === "video" ? "Video" : ad.format === "image" ? "Imagen" : "Otro"} · {(ad.evaluation.spendShare * 100).toFixed(ad.evaluation.spendShare < 0.1 ? 1 : 0)} % del gasto</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatMoney(ad.counters.spend, currency)} · {ad.counters.purchases} compras</span>
                      {ad.parts && (
                        <span className="text-xs leading-snug" title={ad.conceptName ?? undefined}>
                          <span className="text-muted-foreground">G</span> {ad.parts.gancho.tipo} <span className="text-muted-foreground">· C</span> {ad.parts.cuerpo.tipo} <span className="text-muted-foreground">· Ci</span> {ad.parts.cierre.tipo}
                        </span>
                      )}
                    </div>
                  </div>
                  <VerdictChip evaluation={ad.evaluation} />
                  {cols.map((id) => (
                    <MetricCell key={id} id={id} defs={view.metrics} evaluation={ad.evaluation} currency={currency} isBreak={ad.evaluation.breakAt === id} />
                  ))}
                  <span className="text-[13px] leading-snug text-muted-foreground">{breakSummary(ad.evaluation, currency, view.metrics)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Se compara solo dentro del conjunto (misma audiencia y fechas). Ganador/Perdedor por CPA contra la mediana; «Sin oportunidad»: menos del 5 % del gasto; «Sin datos»: menos de 1,000 impresiones o 3 compras. Conversiones con atribución de 7 días después del clic.
          </p>
        </div>
      )}
      {view.adsets.length === 0 && <p className="text-sm text-muted-foreground">Esta campaña no tiene anuncios capturados.</p>}
    </div>
  )
}
