"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { getManualCampaigns, endManualCampaign, type ManualCampaign } from "@/lib/actions/manual-campaigns"
import { isoToday } from "@/lib/utils/manual-campaign-calc"
import { ManualCampaignModal } from "./manual-campaigns/manual-campaign-modal"
import { ChannelSummaryEditor, channelTotals, draftsToRows, initialDrafts, type ChannelDraft } from "./channel-summary-editor"
import { Loader2, Star, Radio, Check } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { getCycleReviewData, completeCycleReview, editCarryOver, type CycleReviewData, type ConceptDecision } from "@/lib/actions/cycle-review"
import { closeCycle, suggestNextCycleStartDate } from "@/lib/actions/projects"
import type { CreativeAsset } from "@/lib/types"
import { formatCycleRange, cn } from "@/lib/utils"

// Repaso de cierre de ciclo. "close": cerrar el ciclo activo; "pending":
// ciclo ya cerrado (a mano o por auto-cierre) cuyo repaso falta; "edit":
// corregir qué pasó al ciclo siguiente. Nada se aplica hasta el último paso.
type Mode = "close" | "pending" | "edit"

const ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/`
const fmt$ = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`

function addOneMonthMinusOneDay(start: string): string {
  const [y, m, d] = start.split("-").map(Number)
  const end = new Date(Date.UTC(y, m, d - 1))
  return end.toISOString().slice(0, 10)
}

function daysBetween(start: string, end: string) {
  const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000) + 1
}

// Mismo código de color que las tarjetas de pieza del Creative Tracker.
function assetTone(a: CreativeAsset): { label: string; className: string; warning?: string } {
  if (!a.client_visible) return { label: "Borrador", className: "bg-amber-100 text-amber-800", warning: "Se lleva sin terminar" }
  if (a.client_status === "approved") return { label: "Aprobado", className: "bg-emerald-100 text-emerald-800" }
  if (a.client_status === "changes_requested") return { label: "Cambios pedidos", className: "bg-red-100 text-red-800", warning: "Se lleva con cambios pendientes" }
  return { label: "En revisión del cliente", className: "bg-muted text-muted-foreground" }
}

export function CycleReviewModal({ projectId, cycleId, mode, onClose }: {
  projectId: string
  cycleId: string
  mode: Mode
  onClose: () => void
}) {
  const router = useRouter()
  const [data, setData] = useState<CycleReviewData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState(mode === "edit" ? 2 : 1)
  const [channels, setChannels] = useState<ChannelDraft[]>([])
  // continues: null = sin decidir (concepto sin anuncios vinculados — no
  // hay datos para sugerir nada, así que se obliga a elegir).
  const [decisions, setDecisions] = useState<Record<string, Omit<ConceptDecision, "continues"> & { continues: boolean | null }>>({})
  const [assetIds, setAssetIds] = useState<Set<string>>(new Set())
  const [nextStart, setNextStart] = useState("")
  const [nextEnd, setNextEnd] = useState("")
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState<ManualCampaign | null>(null)

  // Campañas manuales: no se cierra el ciclo con una activa sin su captura
  // al cierre (o marcada como terminada) — así no se quedan huérfanas.
  const closeDate = data ? (data.cycle.end_date < isoToday() ? data.cycle.end_date : isoToday()) : ""
  const pendingManual = mode === "edit" || !data ? [] : data.manualCampaigns.filter(
    (m) => m.status !== "ended" && (!m.lastSnapshotDate || m.lastSnapshotDate < closeDate),
  )
  function reloadManual() {
    getManualCampaigns(projectId, cycleId).then((mc) => {
      setData((d) => (d ? { ...d, manualCampaigns: mc } : d))
      // Actualiza las filas de canal que vienen de campañas manuales.
      const byChannel = new Map<string, { spend: number; results: number | null }>()
      for (const m of mc) if (m.cycleTotals) {
        const cur = byChannel.get(m.channel) ?? { spend: 0, results: null }
        cur.spend += m.cycleTotals.spend
        if (m.cycleTotals.results !== null) cur.results = (cur.results ?? 0) + m.cycleTotals.results
        byChannel.set(m.channel, cur)
      }
      setChannels((rows) => {
        const r2 = (v: number) => String(Math.round(v * 100) / 100)
        const next = rows.map((r) => {
          const v = byChannel.get(r.channel)
          if (!v) return r
          byChannel.delete(r.channel)
          return { ...r, spend: r2(v.spend), results: v.results === null ? r.results : r2(v.results) }
        })
        return [...next, ...[...byChannel].map(([channel, v]) => ({ channel, spend: r2(v.spend), results: v.results === null ? "" : r2(v.results), roas: "" }))]
      })
    })
  }
  function endManual(m: ManualCampaign) {
    startTransition(async () => {
      await endManualCampaign(projectId, m.id, data!.cycle.end_date < isoToday() ? data!.cycle.end_date : isoToday())
      reloadManual()
    })
  }

  useEffect(() => {
    getCycleReviewData(projectId, cycleId).then((d) => {
      setData(d)
      const c = d.cycle
      setChannels(initialDrafts(c.channel_breakdown, c, d.syncedSpend, d.manualCampaigns
        .filter((m) => m.cycleTotals)
        .map((m) => ({ channel: m.channel, spend: m.cycleTotals!.spend, results: m.cycleTotals!.results }))))
      // Sugerencias: continúa lo que corre en Meta o ya era Evergreen; en
      // modo corrección, lo que ya está en el ciclo siguiente.
      const initial: Record<string, Omit<ConceptDecision, "continues"> & { continues: boolean | null }> = {}
      for (const rc of d.concepts) {
        const isEvergreen = rc.concept.status === "Evergreen"
        const hasLinkedAds = rc.spend > 0 || rc.running
        const continues = mode === "edit"
          ? d.nextConceptIds.includes(rc.concept.id)
          : rc.running || isEvergreen ? true
          : hasLinkedAds ? false
          : null
        initial[rc.concept.id] = { conceptId: rc.concept.id, continues, evergreen: isEvergreen }
      }
      setDecisions(initial)
      const preselected = mode === "edit"
        ? d.assets.filter((ra) => d.nextAssetIds.includes(ra.asset.id))
        : d.assets.filter((ra) => {
            const concept = ra.asset.concept_id ? initial[ra.asset.concept_id] : null
            if (!concept?.continues) return false
            // Borradores nunca publicados no se preseleccionan (suelen ser
            // ideas que se quedaron en el camino); lo aprobado, lo que corre
            // y lo que está en revisión o con cambios, sí.
            return ra.running || ra.asset.client_visible
          })
      setAssetIds(new Set(preselected.map((ra) => ra.asset.id)))
    }).catch((e) => setLoadError(e instanceof Error ? e.message : "No se pudo cargar el repaso"))

    if (mode !== "edit") {
      Promise.all([suggestNextCycleStartDate(projectId), getCycleReviewData(projectId, cycleId)]).then(([suggested, d]) => {
        // Nunca empezar el mismo día (o antes) de que termina este ciclo:
        // el día fijo puede caer justo en su fecha de fin.
        const [y, m, day] = d.cycle.end_date.split("-").map(Number)
        const dayAfterEnd = new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10)
        const start = suggested > d.cycle.end_date ? suggested : dayAfterEnd
        setNextStart(start)
        setNextEnd(addOneMonthMinusOneDay(start))
      })
    }
  }, [projectId, cycleId, mode])

  const continuing = useMemo(() => Object.values(decisions).filter((d) => d.continues === true), [decisions])
  const stopping = useMemo(() => Object.values(decisions).filter((d) => d.continues === false), [decisions])
  const undecided = useMemo(() => Object.values(decisions).filter((d) => d.continues === null), [decisions])
  const selectedAssetsCount = data ? data.assets.filter((ra) => assetIds.has(ra.asset.id) && ra.asset.concept_id && decisions[ra.asset.concept_id]?.continues).length : 0

  function setDecision(id: string, patch: Partial<Omit<ConceptDecision, "continues"> & { continues: boolean | null }>) {
    setDecisions((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function toggleAsset(id: string) {
    setAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCloseWithoutReview() {
    if (!confirm("¿Cerrar el ciclo sin hacer el repaso? Quedará pendiente, y el siguiente ciclo solo se abre al completarlo.")) return
    startTransition(async () => {
      await closeCycle(cycleId, projectId)
      router.refresh()
      onClose()
    })
  }

  function handleSubmit() {
    if (!data) return
    setSaveError(null)
    // Solo assets de conceptos que continúan.
    const finalAssets = data.assets
      .filter((ra) => assetIds.has(ra.asset.id) && ra.asset.concept_id && decisions[ra.asset.concept_id]?.continues)
      .map((ra) => ra.asset.id)
    startTransition(async () => {
      try {
        if (mode === "edit") {
          await editCarryOver({ projectId, cycleId, decisions: Object.values(decisions) as ConceptDecision[], assetIds: finalAssets })
        } else {
          await completeCycleReview({
            projectId,
            cycleId,
            summary: { ...channelTotals(draftsToRows(channels)), channel_breakdown: draftsToRows(channels) },
            decisions: Object.values(decisions) as ConceptDecision[],
            assetIds: finalAssets,
            nextCycle: data.otherActiveCycle ? null : { start: nextStart, end: nextEnd },
          })
        }
        router.refresh()
        onClose()
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "No se pudo guardar")
      }
    })
  }

  const steps = mode === "edit"
    ? [{ n: 2, label: "Conceptos" }, { n: 3, label: "Assets" }]
    : [{ n: 1, label: "Resumen" }, { n: 2, label: "Conceptos" }, { n: 3, label: "Assets" }, { n: 4, label: "Confirmar" }]
  const lastStep = steps[steps.length - 1].n
  const firstStep = steps[0].n

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {mode === "edit" ? "Corregir lo que pasó al siguiente ciclo" : "Repaso de cierre de ciclo"}
            {data && <span className="font-normal text-muted-foreground"> · {formatCycleRange(data.cycle.start_date, data.cycle.end_date)}</span>}
          </DialogTitle>
          <div className="flex items-center gap-2 pt-2">
            {steps.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                {i > 0 && <span className="w-6 h-px bg-border" />}
                <span className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-full",
                  step === s.n ? "bg-primary text-primary-foreground" : step > s.n ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"
                )}>
                  {i + 1}. {s.label}
                </span>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-2">
          {loadError && <p className="text-sm text-destructive">{loadError}</p>}
          {!data && !loadError && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>}

          {data && step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3 max-w-xl">
                {[
                  { label: "Duración", value: `${daysBetween(data.cycle.start_date, data.cycle.end_date)} días` },
                  { label: "Gasto sincronizado de Meta", value: fmt$(data.syncedSpend) },
                  { label: "Conceptos en el ciclo", value: String(data.concepts.length) },
                ].map((t) => (
                  <div key={t.label} className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{t.label}</p>
                    <p className="text-sm font-semibold">{t.value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-sm font-medium">Resumen del ciclo por canal</p>
                <p className="text-xs text-muted-foreground mb-2">Meta viene del sync; el resto de canales (Google, TikTok…) se captura a mano. Los totales se calculan solos.</p>
                <ChannelSummaryEditor drafts={channels} onChange={setChannels} />
              </div>
              {data.manualCampaigns.length > 0 && (
                <div>
                  <p className="text-sm font-medium">Campañas manuales</p>
                  <p className="text-xs text-muted-foreground mb-2">Captura sus números al cierre ({closeDate}) o márcalas como terminadas. Su gasto ya se suma a su canal arriba.</p>
                  <div className="space-y-1.5 max-w-3xl">
                    {data.manualCampaigns.map((m) => {
                      const pending = pendingManual.includes(m)
                      return (
                        <div key={m.id} className={cn("flex items-center gap-2 flex-wrap rounded-lg border px-3 py-2 text-xs", pending ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900" : "border-border")}>
                          <span className="font-semibold px-1.5 py-0.5 rounded bg-foreground/5">{m.channel}</span>
                          <span className="font-medium">{m.name}</span>
                          <span className="text-muted-foreground">
                            {m.status === "ended" ? "Terminada" : m.lastSnapshotDate ? `Datos al ${m.lastSnapshotDate}` : "Sin métricas"}
                            {m.cycleTotals ? ` · ${fmt$(m.cycleTotals.spend)} en el ciclo` : ""}
                          </span>
                          {pending && <span className="text-amber-700 dark:text-amber-400 font-medium">Falta captura al cierre</span>}
                          <span className="ml-auto flex gap-2">
                            <button type="button" onClick={() => setManualOpen(m)} className="text-primary hover:underline">Capturar</button>
                            {m.status !== "ended" && <button type="button" onClick={() => endManual(m)} disabled={isPending} className="text-muted-foreground hover:text-foreground">Terminó</button>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {manualOpen && (
                <ManualCampaignModal projectId={projectId} cycleId={cycleId} campaign={manualOpen} onClose={() => { setManualOpen(null); reloadManual() }} />
              )}
            </div>
          )}

          {data && step === 2 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Elige qué conceptos continúan al siguiente ciclo. Vienen sugeridos: continúa lo que corre en Meta o ya es Evergreen.
              </p>
              {data.concepts.length === 0 && <p className="text-sm text-muted-foreground italic">Este ciclo no tiene conceptos.</p>}
              {data.concepts.map((rc) => {
                const d = decisions[rc.concept.id]
                if (!d) return null
                const cpr = rc.results > 0 ? rc.spend / rc.results : null
                return (
                  <div
                    key={rc.concept.id}
                    className={cn(
                      "rounded-xl border px-4 py-3 flex items-center gap-4 flex-wrap",
                      d.continues === true ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900"
                        : d.continues === null ? "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-900"
                        : "bg-muted/40"
                    )}
                  >
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2">
                        {rc.concept.brand_line && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: rc.concept.brand_line.color }} title={rc.concept.brand_line.name} />}
                        <p className="text-sm font-medium truncate">{rc.concept.name || rc.concept.angle_type || "Concepto"}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {rc.spend > 0
                          ? `${fmt$(rc.spend)} · ${rc.results.toLocaleString("en-US")} resultados${cpr !== null ? ` · $${cpr.toFixed(2)} por resultado` : ""}`
                          : "Sin anuncios vinculados este ciclo"}
                      </p>
                      {d.continues === null && (
                        <span className="inline-flex mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          Sin decidir — no hay anuncios vinculados para sugerir
                        </span>
                      )}
                      {rc.running && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <Radio className="w-3 h-3" /> Corriendo en Meta
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-lg border bg-background p-0.5">
                        <button
                          type="button"
                          onClick={() => setDecision(rc.concept.id, { continues: true })}
                          className={cn("text-xs font-medium px-3 py-1.5 rounded-md transition-colors", d.continues === true ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-foreground")}
                        >
                          Continúa
                        </button>
                        <button
                          type="button"
                          onClick={() => setDecision(rc.concept.id, { continues: false })}
                          className={cn("text-xs font-medium px-3 py-1.5 rounded-md transition-colors", d.continues === false ? "bg-slate-600 text-white" : "text-muted-foreground hover:text-foreground")}
                        >
                          Termina
                        </button>
                      </div>
                      {d.continues === null ? null : d.continues ? (
                        <button
                          type="button"
                          onClick={() => setDecision(rc.concept.id, { evergreen: !d.evergreen })}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors",
                            d.evergreen ? "bg-amber-50 border-amber-300 text-amber-800" : "text-muted-foreground hover:text-foreground"
                          )}
                          title="Etiqueta manual para los conceptos que siempre funcionan"
                        >
                          <Star className={cn("w-3.5 h-3.5", d.evergreen && "fill-amber-400 text-amber-500")} />
                          Evergreen
                        </button>
                      ) : (
                        <input
                          value={d.reason ?? ""}
                          onChange={(e) => setDecision(rc.concept.id, { reason: e.target.value })}
                          placeholder="¿Por qué termina? (opcional)"
                          className="w-56 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {data && step === 3 && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Elige qué piezas se llevan. Vienen marcadas las que corren en Meta o ya se publicaron al cliente; los borradores no.
              </p>
              {continuing.length === 0 && <p className="text-sm text-muted-foreground italic">Ningún concepto continúa.</p>}
              {data.concepts.filter((rc) => decisions[rc.concept.id]?.continues).map((rc) => {
                const pieces = data.assets.filter((ra) => ra.asset.concept_id === rc.concept.id)
                return (
                  <div key={rc.concept.id}>
                    <p className="text-sm font-medium mb-2">{rc.concept.name || "Concepto"} <span className="font-normal text-muted-foreground">· {pieces.length} pieza{pieces.length !== 1 ? "s" : ""}</span></p>
                    {pieces.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Sin assets en este ciclo — el concepto continúa vacío.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3">
                        {pieces.map((ra) => {
                          const a = ra.asset
                          const selected = assetIds.has(a.id)
                          const tone = assetTone(a)
                          const thumb = a.thumbnail_path ? ASSET_BASE + a.thumbnail_path : a.file_path ? ASSET_BASE + a.file_path : a.asset_url
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => toggleAsset(a.id)}
                              className={cn("rounded-xl border-2 overflow-hidden text-left transition-colors", selected ? "border-primary" : "border-border opacity-70 hover:opacity-100")}
                            >
                              <div className="relative aspect-[4/5] bg-muted">
                                {thumb && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                                )}
                                <span className={cn("absolute top-1.5 left-1.5 w-5 h-5 rounded-md border-2 flex items-center justify-center", selected ? "bg-primary border-primary" : "bg-white/80 border-white")}>
                                  {selected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                                </span>
                                {ra.running && (
                                  <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded">En Meta</span>
                                )}
                              </div>
                              <div className="p-2 space-y-1">
                                <span className={cn("inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full", tone.className)}>{tone.label}</span>
                                {selected && tone.warning && <p className="text-[10px] text-muted-foreground">{tone.warning}</p>}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {data && step === 4 && (
            <div className="space-y-5 max-w-xl">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <p className="text-[11px] text-emerald-800">Continúan</p>
                  <p className="text-sm font-semibold text-emerald-900">{continuing.length} concepto{continuing.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <p className="text-[11px] text-emerald-800">Assets que se llevan</p>
                  <p className="text-sm font-semibold text-emerald-900">{selectedAssetsCount}</p>
                </div>
                <div className="rounded-lg bg-muted/60 border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Terminan</p>
                  <p className="text-sm font-semibold">{stopping.length} concepto{stopping.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              {data.otherActiveCycle ? (
                <p className="text-sm">
                  Ya hay un ciclo activo ({formatCycleRange(data.otherActiveCycle.start_date, data.otherActiveCycle.end_date)}): lo que continúa se agrega a ese ciclo.
                </p>
              ) : (
                <div>
                  <p className="text-sm font-medium mb-1">Siguiente ciclo</p>
                  <div className="flex items-end gap-3">
                    <label className="text-xs">
                      <span className="text-muted-foreground">Inicio</span>
                      <input type="date" value={nextStart} onChange={(e) => { setNextStart(e.target.value); setNextEnd(addOneMonthMinusOneDay(e.target.value)) }}
                        className="mt-0.5 block rounded-md border border-input bg-background px-2.5 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs">
                      <span className="text-muted-foreground">Fin</span>
                      <input type="date" value={nextEnd} onChange={(e) => setNextEnd(e.target.value)}
                        className="mt-0.5 block rounded-md border border-input bg-background px-2.5 py-1.5 text-sm" />
                    </label>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                No se borra nada: el historial de este ciclo se conserva, y podrás corregir lo que continúa después desde el historial de ciclos.
              </p>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 border-t pt-3 flex items-center justify-between gap-2">
          <div>
            {mode === "close" && step === 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={handleCloseWithoutReview} disabled={isPending} className="text-muted-foreground">
                Cerrar sin repaso (lo haré después)
              </Button>
            )}
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          </div>
          <div className="flex items-center gap-2">
            {step > firstStep && (
              <Button type="button" variant="outline" size="sm" onClick={() => setStep((s) => s - 1)} disabled={isPending}>Atrás</Button>
            )}
            {step === 2 && undecided.length > 0 && (
              <span className="text-xs text-amber-700">Faltan {undecided.length} concepto{undecided.length !== 1 ? "s" : ""} por decidir</span>
            )}
            {step < lastStep ? (
              <Button type="button" size="sm" onClick={() => setStep((s) => s + 1)} disabled={!data || (step === 1 && pendingManual.length > 0) || (step === 2 && undecided.length > 0)}>Siguiente</Button>
            ) : (
              <Button type="button" size="sm" onClick={handleSubmit} disabled={!data || isPending || (mode !== "edit" && !data.otherActiveCycle && (!nextStart || !nextEnd))}>
                {isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {mode === "edit" ? "Guardar cambios" : data?.otherActiveCycle ? "Cerrar y traspasar" : "Cerrar y abrir siguiente ciclo"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
