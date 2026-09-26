"use client"

import { assetReviewTone } from "@/lib/utils/asset-review-tone"
import type { ManualCampaign } from "@/lib/actions/manual-campaigns"
import { derivedMetrics } from "@/lib/utils/manual-campaign-calc"
import { ManualCampaignModal } from "@/components/projects/hub/manual-campaigns/manual-campaign-modal"
import { useEffect, useState, useCallback } from "react"
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, applyNodeChanges,
  type Node, type Edge, type NodeProps, type NodeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Film, ImageIcon, AlertTriangle, ChevronDown, ChevronRight, Infinity as InfinityIcon, StickyNote as StickyNoteIcon, X, Search, Maximize2 } from "lucide-react"
import {
  getRelationshipMap, getRelationshipMapPositions, saveRelationshipMapPosition,
  getRelationshipMapNotes, createRelationshipMapNote, updateRelationshipMapNoteText,
  updateRelationshipMapNotePosition, deleteRelationshipMapNote,
  type RelationshipMapData,
} from "@/lib/actions/relationship-map"
import { METRIC_DEFS, TREND_WINDOW_LABELS, type MetricKey } from "@/lib/constants/paid-media-metrics"
import { CONCEPT_STATUS_COLORS, ANGLE_GUIDE, FUNNEL_COLORS, AWARENESS_LABELS } from "@/lib/constants/creatives"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { setCampaignTrendOverride } from "@/lib/actions/projects"
import { cn } from "@/lib/utils"
import type { CreativeConcept } from "@/lib/types"

interface Props {
  projectId: string
  cycleId: string | null
}

// Solo las métricas elegidas en Contexto de Cuenta (mismo criterio que el
// grid de creativos), en el orden de METRIC_DEFS.
const ALL_METRIC_KEYS = Object.keys(METRIC_DEFS) as MetricKey[]
const selectedKeys = (keys: MetricKey[]) => ALL_METRIC_KEYS.filter((k) => keys.includes(k))

// "2026-09-15" → "15 sep" (sin pasar por Date UTC, que corre el día).
function formatCycleStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}

// Mismo criterio "¿es buena o mala esta tendencia?" que ya usa cada
// tarjeta de MetricGrid, pero agregado — para poder mostrar un veredicto
// de un vistazo (medalla) en el header colapsado de un nodo de campaña,
// sin tener que expandirlo ni leer las 10 tarjetas una por una.
function summarizeHealth(metrics: Record<MetricKey, { value: number | null; trendPct: number | null; higherIsBetter: boolean }>, keys: MetricKey[]): { good: number; bad: number } {
  let good = 0, bad = 0
  for (const key of selectedKeys(keys)) {
    const m = metrics[key]
    if (!m || m.value === null || m.trendPct === null || Math.abs(m.trendPct) < 0.5) continue
    const isUp = m.trendPct > 0
    if (isUp === m.higherIsBetter) good++
    else bad++
  }
  return { good, bad }
}

// Medalla discreta con el veredicto agregado — verde/rojo/gris según si
// gana lo bueno, lo malo, o está parejo, con el desglose en el tooltip.
function HealthBadge({ metrics, keys }: { metrics: Record<MetricKey, { value: number | null; trendPct: number | null; higherIsBetter: boolean }>; keys: MetricKey[] }) {
  const { good, bad } = summarizeHealth(metrics, keys)
  if (good === 0 && bad === 0) return null
  const tone = good > bad ? "bg-emerald-100 text-emerald-700" : bad > good ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
  return (
    <span
      title={`${good} métrica${good !== 1 ? "s" : ""} mejorando · ${bad} empeorando este periodo`}
      className={cn("flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full", tone)}
    >
      <span className="text-emerald-600">▲{good}</span>
      <span className="text-destructive">▼{bad}</span>
    </span>
  )
}

function MetricGrid({ metrics, keys }: { metrics: Record<MetricKey, { value: number | null; trendPct: number | null; higherIsBetter: boolean }>; keys: MetricKey[] }) {
  const withValue = selectedKeys(keys).filter((k) => metrics[k]?.value !== null)
  return (
    <div className="grid grid-cols-2 gap-1.5 p-2.5">
      {withValue.map((key) => {
        const m = metrics[key]!
        const isUp = (m.trendPct ?? 0) > 0
        const isGood = m.trendPct === null ? null : isUp === m.higherIsBetter
        return (
          <div key={key} className="bg-muted/40 rounded-md p-1.5">
            <p className="text-[9px] text-muted-foreground">{METRIC_DEFS[key].label}</p>
            <div className="flex items-center gap-1">
              <p className="text-[11px] font-semibold">{METRIC_DEFS[key].format(m.value!)}</p>
              {isGood !== null && Math.abs(m.trendPct!) >= 0.5 && (
                <span className={cn("text-[9px] font-semibold", isGood ? "text-emerald-600" : "text-destructive")}>
                  {isUp ? "+" : ""}{m.trendPct!.toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Lectura de solo lectura del mismo detalle que ve ConceptDetailModal
// (concepts-table.tsx) — se duplica en vez de reusarlo directamente
// porque ese modal viene entrelazado con todas sus acciones de edición
// (promover/degradar/borrar, nuevo asset, nuevo brief, ...), que no
// aplican en un canvas de solo lectura.
function ConceptMechanismModal({ concept, onClose }: { concept: CreativeConcept; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"id" | "angle" | "mech">("id")
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angle_type)
  const fLabel = "text-[11px] font-medium text-muted-foreground/80 mb-0.5"
  const fEmpty = "text-sm text-muted-foreground/30 italic"

  function F({ label, value }: { label: string; value?: string | number | null }) {
    return (
      <div>
        <p className={fLabel}>{label}</p>
        {value ? <p className="text-sm leading-snug">{value}</p> : <p className={fEmpty}>—</p>}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-0">
          <div className="space-y-1">
            {concept.brand_line && (
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: concept.brand_line.color }}>
                {concept.brand_line.name}
              </p>
            )}
            <DialogTitle className="text-xl leading-tight">{concept.name || "Concepto"}</DialogTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn("text-xs border-0", CONCEPT_STATUS_COLORS[concept.status])}>{concept.status}</Badge>
              {angleEntry && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <span className="text-base">{angleEntry.emoji}</span>
                  {concept.angle_type}
                </span>
              )}
              {concept.funnel_stage && (
                <Badge className={cn("text-xs border-0", FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600")}>
                  {concept.funnel_stage}
                </Badge>
              )}
              {concept.awareness_stage && (
                <span className="text-xs text-muted-foreground">
                  Stage {concept.awareness_stage} · {AWARENESS_LABELS[concept.awareness_stage]}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="border rounded-xl overflow-hidden">
          <div className="flex border-b bg-muted/30">
            {([
              { key: "id" as const, label: "Identificación" },
              { key: "angle" as const, label: "Teoría del Ángulo" },
              { key: "mech" as const, label: "Mecanismo" },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors relative",
                  activeTab === tab.key ? "text-foreground bg-background" : "text-muted-foreground hover:text-foreground/70"
                )}
              >
                {tab.label}
                {activeTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
              </button>
            ))}
          </div>

          <div className="px-6 py-5 min-h-[180px]">
            {activeTab === "id" && (
              <div className="space-y-5">
                <F label="Principio organizador" value={concept.organizing_principle} />
                <div>
                  <p className={fLabel}>Persona objetivo</p>
                  {concept.target_persona ? <p className="text-sm leading-snug">{concept.target_persona}</p> : <p className={fEmpty}>—</p>}
                </div>
                <F label="Awareness Stage" value={concept.awareness_stage ? `${concept.awareness_stage} — ${AWARENESS_LABELS[concept.awareness_stage]}` : null} />
                <div>
                  <p className={fLabel}>Funnel Stage</p>
                  {concept.funnel_stage
                    ? <Badge className={cn("text-xs border-0 mt-0.5", FUNNEL_COLORS[concept.funnel_stage] ?? "bg-gray-100 text-gray-600")}>{concept.funnel_stage}</Badge>
                    : <p className={fEmpty}>—</p>}
                </div>
              </div>
            )}

            {activeTab === "angle" && (
              <div className="space-y-5">
                {angleEntry ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-4xl leading-none">{angleEntry.emoji}</span>
                      <div>
                        <p className="text-base font-semibold">{concept.angle_type}</p>
                        <p className="text-sm text-muted-foreground italic leading-snug">{angleEntry.guiding_question}</p>
                      </div>
                    </div>
                    {angleEntry.mechanism && <p className="text-sm text-muted-foreground leading-relaxed">{angleEntry.mechanism}</p>}
                  </>
                ) : (
                  <p className={fEmpty}>Sin ángulo asignado</p>
                )}
              </div>
            )}

            {activeTab === "mech" && (
              <div className="space-y-0 divide-y divide-border">
                {[
                  { label: "¿Por qué va a funcionar?", value: concept.why_it_works },
                  { label: "Pain Point específico", value: concept.pain_point },
                  { label: "Objeción que derrumba", value: concept.objection },
                  { label: "Transformación prometida", value: concept.transformation },
                ].map(({ label, value }) => (
                  <div key={label} className="py-4 first:pt-0 last:pb-0">
                    <p className={fLabel}>{label}</p>
                    {value ? <p className="text-sm leading-relaxed">{value}</p> : <p className={fEmpty}>—</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConceptNode({ data }: NodeProps<Node<{ concept: RelationshipMapData["concepts"][number]; onViewConcept: (concept: CreativeConcept) => void }>>) {
  const { concept, onViewConcept } = data
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angleType)
  // Evergreen es la excepción entre los status: en vez del pill de texto
  // (compite mucho visualmente con Brand Line/ángulo/funnel, y ya es
  // obvio por el ícono qué significa) se muestra como una medalla
  // discreta — un ícono de infinito, título al pasar el mouse.
  const isEvergreen = concept.status === "Evergreen"
  return (
    <div
      className="w-64 rounded-xl border-2 border-violet-300 bg-violet-50 p-3 shadow-sm"
      style={concept.brandLine ? { borderLeftColor: concept.brandLine.color, borderLeftWidth: 5 } : undefined}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      {/* Brand Line — por encima de todo, incluso de las medallas de
          status/ángulo/funnel: es la primera pregunta ("¿de qué línea de
          producto es esto?"), así que se lee antes que cualquier otra
          cosa. Negritas, color = el mismo del borde izquierdo. */}
      {concept.brandLine && (
        <p className="text-[10px] font-bold uppercase tracking-wide truncate mb-1" style={{ color: concept.brandLine.color }}>
          {concept.brandLine.name}
        </p>
      )}
      <div className="flex items-center gap-1.5 mb-1">
        {angleEntry && <span className="text-sm">{angleEntry.emoji}</span>}
        {isEvergreen ? (
          <span title="Evergreen" className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600">
            <InfinityIcon className="w-3 h-3" />
          </span>
        ) : (
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", CONCEPT_STATUS_COLORS[concept.status as keyof typeof CONCEPT_STATUS_COLORS] ?? "bg-gray-100 text-gray-600")}>
            {concept.status}
          </span>
        )}
        {concept.funnelStage && (
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", FUNNEL_COLORS[concept.funnelStage as keyof typeof FUNNEL_COLORS] ?? "bg-gray-100")}>
            {concept.funnelStage}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground truncate">{concept.name ?? concept.angleType ?? "Sin nombre"}</p>
      {concept.targetPersona && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{concept.targetPersona}</p>}
      <button
        onClick={(e) => { e.stopPropagation(); onViewConcept(concept.full) }}
        className="nodrag mt-2 flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800 transition-colors"
      >
        <Search className="w-3 h-3" />
        Ver concepto
      </button>
    </div>
  )
}

// Igual de espíritu que la miniatura en los nodos de Ad Lab
// (components/ad-lab/nodes/ad-node.tsx): video reproducible con controles
// directo en la tarjeta, imagen clickeable para agrandar (lightbox, ver
// onEnlarge más abajo) en vez del recorte chico + ícono de antes.
// Mismo código de color que el Creative Tracker (aprobado/cambios/
// borrador/en revisión) y, escrito, si el asset corre en algún ad del
// ciclo o nunca se ha probado — para no perder de vista cuál está vivo.
function AssetNode({ data }: NodeProps<Node<{ asset: RelationshipMapData["assets"][number]; inCampaign: boolean; manualChannels?: string[]; onEnlarge: (asset: RelationshipMapData["assets"][number]) => void }>>) {
  const { asset, inCampaign, manualChannels, onEnlarge } = data
  const isVideo = asset.fileType === "video"
  const media = asset.fileUrl ?? asset.thumbUrl
  const tone = assetReviewTone(asset)
  return (
    <div className={cn("w-56 rounded-xl border-2 shadow-sm overflow-hidden", tone.card, !inCampaign && "opacity-80")}>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="relative bg-black/90">
        {media ? (
          isVideo ? (
            <video src={media} controls className="nodrag nowheel w-full max-h-40 block" />
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onEnlarge(asset) }} className="nodrag block w-full group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media} alt="" className="w-full max-h-40 object-contain" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          )
        ) : (
          <div className="w-full h-24 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-white/30" />
          </div>
        )}
      </div>
      <div className="px-2.5 py-2 flex items-center gap-1.5">
        {isVideo && <Film className="w-3 h-3 text-sky-600 flex-shrink-0" />}
        <p className="text-xs font-medium truncate">{asset.format ?? "Asset"}</p>
        {asset.platform && <p className="text-[10px] text-muted-foreground truncate">· {asset.platform}</p>}
      </div>
      <div className="px-2.5 pb-2 flex items-center gap-1.5 flex-wrap">
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", tone.pill)}>{tone.label}</span>
        {inCampaign ? (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">En campaña{manualChannels?.length ? ` · ${[...new Set(manualChannels)].join(", ")}` : ""}</span>
        ) : (
          <span className="text-[10px] font-medium text-muted-foreground">Sin ad vinculado · no se ha probado</span>
        )}
      </div>
    </div>
  )
}

// El bloque real que resuelve "¿qué assets están anidados en la misma
// campaña?" — colapsado por default, mostrando las métricas
// agregadas elegidas en Contexto de Cuenta; al expandir aparece cada ad individual
// adentro, con su propio detalle completo — no se pierde nada, solo se
// organiza.
function CampaignNode({ data }: NodeProps<Node<{
  campaign: RelationshipMapData["campaigns"][number]
  projectId: string
  onOverrideChange: (campaignId: string, window: string | null) => void
  displayMetrics: MetricKey[]
  cycleStartDate: string | null
  currency: string | null
}>>) {
  const { campaign, projectId, onOverrideChange, displayMetrics, cycleStartDate, currency } = data
  const [expanded, setExpanded] = useState(false)
  const [savingWindow, setSavingWindow] = useState(false)
  // Ciclo = métricas del ciclo con tendencia; Máximo = totales de toda la
  // vida de la campaña (como el preset "Máximo" de Ads Manager), sin %.
  const [range, setRange] = useState<"cycle" | "lifetime">("cycle")
  const isLifetime = range === "lifetime"
  const activeCount = campaign.ads.filter((a) => a.status === "ACTIVE").length

  function handleWindowChange(value: string) {
    setSavingWindow(true)
    setCampaignTrendOverride(projectId, campaign.campaignId, value === "default" ? null : value)
      .then(() => onOverrideChange(campaign.campaignId, value === "default" ? null : value))
      .finally(() => setSavingWindow(false))
  }

  return (
    <div className="w-80 rounded-xl border-2 border-emerald-300 bg-white shadow-sm overflow-hidden">
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 p-2.5 border-b border-border hover:bg-muted/30 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{campaign.campaignName ?? "Sin campaña"}</p>
          <p className="text-[10px] text-muted-foreground">{campaign.ads.length} ad{campaign.ads.length !== 1 ? "s" : ""} · {activeCount} activo{activeCount !== 1 ? "s" : ""}</p>
        </div>
        {currency && (
          <span title={`Montos en ${currency}, la moneda de la cuenta publicitaria`} className="flex-shrink-0 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {currency}
          </span>
        )}
        {/* Medalla de salud — el veredicto agregado de todas las métricas
            de un vistazo, sin tener que expandir ni leer tarjeta por
            tarjeta. */}
        {!isLifetime && <HealthBadge metrics={campaign.aggregate} keys={displayMetrics} />}
      </button>

      <div className="nodrag flex border-b border-border text-[10px] font-semibold" onClick={(e) => e.stopPropagation()}>
        {([["cycle", "Ciclo"], ["lifetime", "Máximo"]] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setRange(val)}
            className={cn(
              "nodrag flex-1 py-1.5 transition-colors",
              range === val ? "bg-emerald-50 text-emerald-700" : "text-muted-foreground hover:bg-muted/40"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Ajuste puntual de ventana de tendencia por campaña — mismo ajuste
          que ya existía como backend (setCampaignTrendOverride) sin
          ningún lugar en la UI desde donde llamarlo; el mapa, al mostrar
          la campaña como su propio nodo, es un lugar natural para
          hacerlo sin ir a Contexto de Cuenta. */}
      {isLifetime ? (
        <p className="px-2.5 py-1.5 border-b border-border bg-muted/20 text-[10px] text-muted-foreground">
          Total de toda la vida de la campaña (como &quot;Máximo&quot; en Ads Manager)
        </p>
      ) : (
      <div className="nodrag px-2.5 py-1.5 border-b border-border bg-muted/20 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[9px] text-muted-foreground flex-shrink-0">Tendencia:</span>
        <select
          value={campaign.hasOverride ? campaign.trendWindow : "default"}
          onChange={(e) => handleWindowChange(e.target.value)}
          disabled={savingWindow}
          className="nodrag flex-1 text-[10px] font-medium bg-transparent border border-border rounded px-1 py-0.5 disabled:opacity-50"
        >
          <option value="default">Default de la cuenta</option>
          {Object.entries(TREND_WINDOW_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {val === "baseline" && cycleStartDate ? `${label} (${formatCycleStart(cycleStartDate)})` : label}
            </option>
          ))}
        </select>
      </div>
      )}

      {isLifetime && !campaign.lifetime ? (
        <p className="p-3 text-[11px] text-muted-foreground">Sin totales de Máximo todavía — se llenan en la próxima sincronización.</p>
      ) : (
        <MetricGrid metrics={isLifetime ? campaign.lifetime! : campaign.aggregate} keys={displayMetrics} />
      )}

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {campaign.ads.map((ad) => {
            const media = ad.displayImageUrl ?? ad.displayThumbnailUrl
            return (
              <div key={ad.ad_id} className="bg-muted/20">
                <div className="flex items-center gap-2 p-2.5">
                  <div className="w-8 h-8 rounded-md overflow-hidden bg-muted flex-shrink-0">
                    {media && <img src={media} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium truncate">{ad.ad_name ?? "Sin nombre"}</p>
                  </div>
                  <span className={cn(
                    "text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0",
                    ad.status === "ACTIVE" ? "bg-emerald-500 text-white" : "bg-slate-800 text-white"
                  )}>
                    {ad.status === "ACTIVE" ? "Activo" : ad.status ?? "—"}
                  </span>
                </div>
                {isLifetime && !campaign.adLifetime[ad.ad_id] ? (
                  <p className="px-2.5 pb-2.5 text-[10px] text-muted-foreground">Sin totales de Máximo todavía.</p>
                ) : (
                  <MetricGrid metrics={isLifetime ? campaign.adLifetime[ad.ad_id]! : ad.metrics} keys={displayMetrics} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Nota libre — no viene de los datos, el usuario la crea/mueve/borra a
// mano. Mismo espíritu que el Sticky Note de Ad Nodes, pero sin panel de
// config aparte: se edita inline, se guarda en blur (debounce simple).
function StickyNode({ id, data }: NodeProps<Node<{ text: string; onTextChange: (id: string, text: string) => void; onDelete: (id: string) => void }>>) {
  const [value, setValue] = useState(data.text)
  // `id` acá es el id del NODO de React Flow ("note-<uuid>"), no el id de
  // la fila en relationship_map_notes (solo el uuid) — los handlers
  // esperan este último, igual que onNodeDragStop más abajo.
  const noteId = id.slice("note-".length)
  return (
    <div className="w-56 rounded-lg border-2 border-amber-300 bg-amber-50 shadow-sm">
      <div className="flex items-center justify-between px-2 py-1 border-b border-amber-200/70">
        <StickyNoteIcon className="w-3 h-3 text-amber-600" />
        <button onClick={() => data.onDelete(noteId)} title="Eliminar nota" className="nodrag p-0.5 rounded text-amber-700/60 hover:text-destructive hover:bg-black/5">
          <X className="w-3 h-3" />
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => data.onTextChange(noteId, value)}
        placeholder="Nota…"
        className="nodrag nowheel w-full h-24 resize-none bg-transparent px-2.5 py-2 text-xs text-foreground/80 focus:outline-none"
      />
    </div>
  )
}

// Campaña manual (canal sin integración): mismo lugar que las de Meta,
// con su canal, etiqueta "Manual" y la fecha de la última captura. Click
// abre su ventana para capturar métricas o vincular assets.
function ManualCampaignNode({ data }: NodeProps<Node<{ campaign: ManualCampaign; onOpen: (c: ManualCampaign) => void }>>) {
  const { campaign: c, onOpen } = data
  const d = derivedMetrics(c.cycleTotals)
  const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`)
  return (
    <div className={cn("w-64 rounded-xl border-2 bg-violet-50 dark:bg-violet-950/30 shadow-sm", c.stale ? "border-amber-400" : "border-violet-300 dark:border-violet-900")}>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      {/* Toda la tarjeta se arrastra; solo el botón de abajo abre la campaña
          (antes la tarjeta entera era un botón "nodrag" y no se podía mover). */}
      <div className="w-full text-left px-3 py-2.5 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-foreground/5">{c.channel}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-200 text-violet-800 dark:bg-violet-900 dark:text-violet-200">Manual</span>
          {c.status !== "active" && <span className="text-[10px] text-muted-foreground">{c.status === "paused" ? "Pausada" : "Terminada"}</span>}
        </div>
        <p className="text-xs font-semibold truncate">{c.name}</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px]">
          {[["Inversión", money(c.cycleTotals?.spend)], ["Resultados", c.cycleTotals?.results?.toLocaleString("en-US") ?? "—"], ["CPA", money(d.cpa)]].map(([l, v]) => (
            <div key={l} className="rounded bg-background/70 px-1.5 py-1"><p className="text-muted-foreground">{l}</p><p className="font-semibold text-xs">{v}</p></div>
          ))}
        </div>
        <p className={cn("mt-1.5 text-[10px]", c.stale ? "text-amber-700 font-medium" : "text-muted-foreground")}>
          {c.lastSnapshotDate ? `Datos al ${c.lastSnapshotDate}` : "Sin métricas capturadas"}{c.stale ? " · actualizar" : ""}
        </p>
        <button onClick={() => onOpen(c)} className="nodrag mt-2 w-full text-[11px] font-semibold py-1 rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors">
          Capturar métricas / editar
        </button>
      </div>
    </div>
  )
}

const NODE_TYPES = { conceptNode: ConceptNode, assetNode: AssetNode, campaignNode: CampaignNode, stickyNode: StickyNode, manualCampaignNode: ManualCampaignNode }

const COL_CONCEPT = 0
const COL_ASSET = 340
const COL_CAMPAIGN = 760
const CAMPAIGN_ROW_H = 210 // altura estimada COLAPSADA — expandir puede solapar visualmente, por eso los nodos son arrastrables
const ASSET_ROW_H = 250 // el asset ahora muestra el media (imagen agrandable / video reproducible), como en Ad Lab — ya no es una fila chica de ícono + texto
const CONCEPT_ROW_H = 100
const MANUAL_ROW_H = 180

interface GraphHandlers {
  onViewConcept: (concept: CreativeConcept) => void
  onEnlarge: (asset: RelationshipMapData["assets"][number]) => void
  projectId: string
  onOverrideChange: (campaignId: string, window: string | null) => void
  onOpenManual: (c: ManualCampaign) => void
}

function buildGraph(data: RelationshipMapData, handlers: GraphHandlers): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let cursorY = 0
  const placedCampaignIds = new Set<string>()
  const campaignById = new Map(data.campaigns.map((c) => [c.campaignId, c]))
  const placedManualIds = new Set<string>()
  const placeManual = (c: ManualCampaign) => {
    nodes.push({ id: `manual-${c.id}`, type: "manualCampaignNode", position: { x: COL_CAMPAIGN, y: cursorY }, data: { campaign: c, onOpen: handlers.onOpenManual }, draggable: true })
    placedManualIds.add(c.id)
    cursorY += MANUAL_ROW_H
  }

  for (const concept of data.concepts) {
    const conceptAssets = data.assets.filter((a) => a.conceptId === concept.id)
    const assetsStartY = cursorY

    if (conceptAssets.length === 0) {
      cursorY += ASSET_ROW_H
    } else {
      for (const asset of conceptAssets) {
        const assetCampaignIds = data.assetCampaignEdges.filter((e) => e.assetId === asset.id).map((e) => e.campaignId)
        const assetRowStartY = cursorY
        const campaignsStartY = cursorY

        for (const campaignId of assetCampaignIds) {
          if (!placedCampaignIds.has(campaignId)) {
            const campaign = campaignById.get(campaignId)
            if (campaign) {
              nodes.push({ id: `campaign-${campaignId}`, type: "campaignNode", position: { x: COL_CAMPAIGN, y: cursorY }, data: { campaign, projectId: handlers.projectId, onOverrideChange: handlers.onOverrideChange, displayMetrics: data.displayMetrics, cycleStartDate: data.cycleStartDate, currency: data.currency }, draggable: true })
              cursorY += CAMPAIGN_ROW_H
            }
            placedCampaignIds.add(campaignId)
          }
          // La línea siempre se dibuja, aunque la campaña ya estuviera
          // colocada por otro asset/concepto — es justo ahí donde se ve
          // la convergencia que antes era invisible.
          edges.push({ id: `e-${asset.id}-${campaignId}`, source: `asset-${asset.id}`, target: `campaign-${campaignId}`, style: { stroke: "#10b981" } })
        }

        const assetManual = data.manualCampaigns.filter((m) => m.assetIds.includes(asset.id))
        for (const m of assetManual) {
          if (!placedManualIds.has(m.id)) placeManual(m)
          edges.push({ id: `e-${asset.id}-manual-${m.id}`, source: `asset-${asset.id}`, target: `manual-${m.id}`, style: { stroke: "#8b5cf6" } })
        }

        // cursorY debe avanzar SIEMPRE al menos ASSET_ROW_H por asset —
        // si sus campañas ya estaban colocadas (0 filas nuevas) esto no
        // pasaba antes, y varios assets terminaban apilados exactamente
        // en el mismo punto (el bug que hacía parecer que había un solo
        // asset donde en realidad había varios, solapados).
        cursorY = Math.max(cursorY, assetRowStartY + ASSET_ROW_H)

        nodes.push({ id: `asset-${asset.id}`, type: "assetNode", position: { x: COL_ASSET, y: Math.max(campaignsStartY, cursorY - ASSET_ROW_H) }, data: { asset, inCampaign: assetCampaignIds.length > 0 || assetManual.length > 0, manualChannels: assetManual.map((m) => m.channel), onEnlarge: handlers.onEnlarge }, draggable: true })
        edges.push({ id: `e-${concept.id}-${asset.id}`, source: `concept-${concept.id}`, target: `asset-${asset.id}`, style: { stroke: "#0ea5e9" } })
      }
    }

    nodes.push({ id: `concept-${concept.id}`, type: "conceptNode", position: { x: COL_CONCEPT, y: (assetsStartY + cursorY) / 2 - CONCEPT_ROW_H / 2 }, data: { concept, onViewConcept: handlers.onViewConcept }, draggable: true })
  }

  // Campañas manuales sin assets de este ciclo: igual se muestran (abajo),
  // para que no queden fuera de la vista.
  for (const m of data.manualCampaigns) if (!placedManualIds.has(m.id)) placeManual(m)

  return { nodes, edges }
}

export function RelationshipMap({ projectId, cycleId }: Props) {
  const [data, setData] = useState<RelationshipMapData | null>(null)
  const [loading, setLoading] = useState(true)
  // El layout inicial (buildGraph) es solo el punto de partida — en
  // cuanto el usuario arrastra un nodo, esa posición se guarda en
  // relationship_map_positions (por proyecto+ciclo) y sobreescribe la
  // calculada la próxima vez que se abra el mapa. Así lo que el usuario
  // ya acomodó (típico: separar assets que el layout apiló encimados) no
  // se pierde en cada recarga.
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [viewingConcept, setViewingConcept] = useState<CreativeConcept | null>(null)
  const [lightboxAsset, setLightboxAsset] = useState<RelationshipMapData["assets"][number] | null>(null)
  const [manualOpen, setManualOpen] = useState<ManualCampaign | "new" | null>(null)
  const handleOpenManual = useCallback((c: ManualCampaign) => setManualOpen(c), [])

  const handleViewConcept = useCallback((concept: CreativeConcept) => setViewingConcept(concept), [])
  const handleEnlarge = useCallback((asset: RelationshipMapData["assets"][number]) => setLightboxAsset(asset), [])

  const refetchData = useCallback(() => {
    if (!cycleId) return
    getRelationshipMap(projectId, cycleId).then(setData)
  }, [projectId, cycleId])

  useEffect(() => {
    if (!cycleId) { setData(null); setLoading(false); return }
    setLoading(true)
    getRelationshipMap(projectId, cycleId).then(setData).finally(() => setLoading(false))
  }, [projectId, cycleId])

  // El override de tendencia por campaña recalcula el aggregate del lado
  // del servidor (necesita las filas diarias completas) — el camino más
  // simple y correcto es re-traer todo el mapa; las posiciones ya
  // guardadas se vuelven a aplicar solas en el efecto de abajo, así que
  // esto no reacomoda nada que el usuario ya haya movido.
  const handleOverrideChange = useCallback(() => { refetchData() }, [refetchData])

  const handleNoteTextChange = useCallback((noteId: string, text: string) => {
    updateRelationshipMapNoteText(noteId, text).catch(() => {})
  }, [])

  const handleNoteDelete = useCallback((noteId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== `note-${noteId}`))
    deleteRelationshipMapNote(noteId).catch(() => {})
  }, [])

  function noteToNode(note: { id: string; x: number; y: number; text: string }): Node {
    return {
      id: `note-${note.id}`,
      type: "stickyNode",
      position: { x: note.x, y: note.y },
      data: { text: note.text, onTextChange: handleNoteTextChange, onDelete: handleNoteDelete },
      draggable: true,
    }
  }

  useEffect(() => {
    if (!data) { setNodes([]); setEdges([]); return }
    const graph = buildGraph(data, { onViewConcept: handleViewConcept, onEnlarge: handleEnlarge, projectId, onOverrideChange: handleOverrideChange, onOpenManual: handleOpenManual })
    Promise.all([
      getRelationshipMapPositions(projectId, cycleId),
      getRelationshipMapNotes(projectId, cycleId),
    ]).then(([saved, notes]) => {
      const savedById = new Map(saved.map((p) => [p.nodeId, p]))
      const generatedNodes = graph.nodes.map((n) => {
        const pos = savedById.get(n.id)
        return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n
      })
      setNodes([...generatedNodes, ...notes.map(noteToNode)])
    })
    setEdges(graph.edges)
  }, [data, projectId, cycleId, handleViewConcept, handleEnlarge, handleOverrideChange, handleOpenManual])

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), [])

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (node.id.startsWith("note-")) {
      updateRelationshipMapNotePosition(node.id.slice("note-".length), node.position.x, node.position.y).catch(() => {})
    } else {
      saveRelationshipMapPosition(projectId, cycleId, node.id, node.position.x, node.position.y).catch(() => {})
    }
  }, [projectId, cycleId])

  const handleAddNote = useCallback(() => {
    createRelationshipMapNote(projectId, cycleId, 40, 40)
      .then((note) => setNodes((nds) => [...nds, noteToNode(note)]))
      .catch((err) => {
        console.error(err)
        alert("No se pudo crear la nota — revisa que la migración de relationship_map_notes ya esté corrida en Supabase.")
      })
  }, [projectId, cycleId, handleNoteTextChange, handleNoteDelete])

  if (!cycleId) {
    return <p className="text-sm text-muted-foreground px-5 py-10 text-center">Elige un ciclo para ver su mapa.</p>
  }
  if (loading) {
    return <p className="text-sm text-muted-foreground px-5 py-10 text-center">Cargando mapa…</p>
  }
  if (nodes.length === 0) {
    return (
      <div className="px-5 py-10 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Sin conceptos en este ciclo todavía — o ninguno tiene assets vinculados a un ad de Meta.</p>
        <button onClick={() => setManualOpen("new")} className="text-xs px-2.5 py-1.5 rounded-lg border border-violet-300 bg-violet-100 text-violet-700 font-semibold">+ Campaña manual</button>
        {manualOpen && <ManualCampaignModal projectId={projectId} cycleId={cycleId} campaign={manualOpen === "new" ? null : manualOpen} onClose={() => { setManualOpen(null); refetchData() }} />}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.1}
        nodesDraggable
        nodesConnectable={false}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable className="!bottom-3 !right-3" />
      </ReactFlow>
      <div className="absolute top-3 left-3 flex items-center gap-2 text-[11px] text-muted-foreground bg-background/90 backdrop-blur px-2.5 py-1.5 rounded-lg border border-border">
        <AlertTriangle className="w-3 h-3" />
        Los datos son de solo lectura — puedes arrastrar los nodos para acomodar la vista, la posición se recuerda para la próxima vez.
      </div>
      <button
        onClick={() => setManualOpen("new")}
        className="absolute top-3 right-[5.5rem] flex items-center gap-1.5 text-[11px] font-semibold bg-violet-100 text-violet-700 border border-violet-300 px-2.5 py-1.5 rounded-lg shadow-sm hover:bg-violet-200 transition-colors"
      >
        + Campaña manual
      </button>
      {manualOpen && <ManualCampaignModal projectId={projectId} cycleId={cycleId} campaign={manualOpen === "new" ? null : manualOpen} onClose={() => { setManualOpen(null); refetchData() }} />}
      <button
        onClick={handleAddNote}
        className="absolute top-3 right-3 flex items-center gap-1.5 text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-300 px-2.5 py-1.5 rounded-lg shadow-sm hover:bg-amber-200 transition-colors"
      >
        <StickyNoteIcon className="w-3 h-3" />
        Nota
      </button>

      {viewingConcept && <ConceptMechanismModal concept={viewingConcept} onClose={() => setViewingConcept(null)} />}

      {lightboxAsset && (
        <Dialog open onOpenChange={() => setLightboxAsset(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
            <div className="bg-black flex items-center justify-center min-h-[300px] max-h-[80vh]">
              {lightboxAsset.fileUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lightboxAsset.fileUrl} alt="" className="max-w-full max-h-[80vh] object-contain" />
              ) : (
                <div className="text-white/40 text-sm py-20">Sin archivo</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
