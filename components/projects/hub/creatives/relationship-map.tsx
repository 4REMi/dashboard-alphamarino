"use client"

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
import { METRIC_DEFS, type MetricKey } from "@/lib/constants/paid-media-metrics"
import { CONCEPT_STATUS_COLORS, ANGLE_GUIDE, FUNNEL_COLORS, AWARENESS_LABELS } from "@/lib/constants/creatives"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { CreativeConcept } from "@/lib/types"

interface Props {
  projectId: string
  cycleId: string | null
}

// Todas las métricas configuradas para el proyecto que tengan valor —
// a propósito NO resumido, ni colapsado ni expandido: si ya es un canvas
// "infinito", no hay razón para escatimar la información de cada nodo.
const ALL_METRIC_KEYS = Object.keys(METRIC_DEFS) as MetricKey[]

// Mismo criterio "¿es buena o mala esta tendencia?" que ya usa cada
// tarjeta de MetricGrid, pero agregado — para poder mostrar un veredicto
// de un vistazo (medalla) en el header colapsado de un nodo de campaña,
// sin tener que expandirlo ni leer las 10 tarjetas una por una.
function summarizeHealth(metrics: Record<MetricKey, { value: number | null; trendPct: number | null; higherIsBetter: boolean }>): { good: number; bad: number } {
  let good = 0, bad = 0
  for (const key of ALL_METRIC_KEYS) {
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
function HealthBadge({ metrics }: { metrics: Record<MetricKey, { value: number | null; trendPct: number | null; higherIsBetter: boolean }> }) {
  const { good, bad } = summarizeHealth(metrics)
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

function MetricGrid({ metrics }: { metrics: Record<MetricKey, { value: number | null; trendPct: number | null; higherIsBetter: boolean }> }) {
  const withValue = ALL_METRIC_KEYS.filter((k) => metrics[k]?.value !== null)
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
function AssetNode({ data }: NodeProps<Node<{ asset: RelationshipMapData["assets"][number]; onEnlarge: (asset: RelationshipMapData["assets"][number]) => void }>>) {
  const { asset, onEnlarge } = data
  const isVideo = asset.fileType === "video"
  const media = asset.fileUrl ?? asset.thumbUrl
  return (
    <div className="w-56 rounded-xl border-2 border-sky-300 bg-sky-50 shadow-sm overflow-hidden">
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
    </div>
  )
}

// El bloque real que resuelve "¿qué assets están anidados en la misma
// campaña?" — colapsado por default, mostrando TODAS las métricas
// agregadas (nunca resumido); al expandir aparece cada ad individual
// adentro, con su propio detalle completo — no se pierde nada, solo se
// organiza.
function CampaignNode({ data }: NodeProps<Node<{ campaign: RelationshipMapData["campaigns"][number] }>>) {
  const { campaign } = data
  const [expanded, setExpanded] = useState(false)
  const activeCount = campaign.ads.filter((a) => a.status === "ACTIVE").length

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
        {/* Medalla de salud — el veredicto agregado de todas las métricas
            de un vistazo, sin tener que expandir ni leer tarjeta por
            tarjeta. */}
        <HealthBadge metrics={campaign.aggregate} />
      </button>

      <MetricGrid metrics={campaign.aggregate} />

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {campaign.ads.map((ad) => {
            const media = ad.image_url ?? ad.thumbnail_url
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
                <MetricGrid metrics={ad.metrics} />
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

const NODE_TYPES = { conceptNode: ConceptNode, assetNode: AssetNode, campaignNode: CampaignNode, stickyNode: StickyNode }

const COL_CONCEPT = 0
const COL_ASSET = 340
const COL_CAMPAIGN = 760
const CAMPAIGN_ROW_H = 210 // altura estimada COLAPSADA — expandir puede solapar visualmente, por eso los nodos son arrastrables
const ASSET_ROW_H = 230 // el asset ahora muestra el media (imagen agrandable / video reproducible), como en Ad Lab — ya no es una fila chica de ícono + texto
const CONCEPT_ROW_H = 100

interface GraphHandlers {
  onViewConcept: (concept: CreativeConcept) => void
  onEnlarge: (asset: RelationshipMapData["assets"][number]) => void
}

function buildGraph(data: RelationshipMapData, handlers: GraphHandlers): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let cursorY = 0
  const placedCampaignIds = new Set<string>()
  const campaignById = new Map(data.campaigns.map((c) => [c.campaignId, c]))

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
              nodes.push({ id: `campaign-${campaignId}`, type: "campaignNode", position: { x: COL_CAMPAIGN, y: cursorY }, data: { campaign }, draggable: true })
              cursorY += CAMPAIGN_ROW_H
            }
            placedCampaignIds.add(campaignId)
          }
          // La línea siempre se dibuja, aunque la campaña ya estuviera
          // colocada por otro asset/concepto — es justo ahí donde se ve
          // la convergencia que antes era invisible.
          edges.push({ id: `e-${asset.id}-${campaignId}`, source: `asset-${asset.id}`, target: `campaign-${campaignId}`, style: { stroke: "#10b981" } })
        }

        // cursorY debe avanzar SIEMPRE al menos ASSET_ROW_H por asset —
        // si sus campañas ya estaban colocadas (0 filas nuevas) esto no
        // pasaba antes, y varios assets terminaban apilados exactamente
        // en el mismo punto (el bug que hacía parecer que había un solo
        // asset donde en realidad había varios, solapados).
        cursorY = Math.max(cursorY, assetRowStartY + ASSET_ROW_H)

        nodes.push({ id: `asset-${asset.id}`, type: "assetNode", position: { x: COL_ASSET, y: Math.max(campaignsStartY, cursorY - ASSET_ROW_H) }, data: { asset, onEnlarge: handlers.onEnlarge }, draggable: true })
        edges.push({ id: `e-${concept.id}-${asset.id}`, source: `concept-${concept.id}`, target: `asset-${asset.id}`, style: { stroke: "#0ea5e9" } })
      }
    }

    nodes.push({ id: `concept-${concept.id}`, type: "conceptNode", position: { x: COL_CONCEPT, y: (assetsStartY + cursorY) / 2 - CONCEPT_ROW_H / 2 }, data: { concept, onViewConcept: handlers.onViewConcept }, draggable: true })
  }

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

  const handleViewConcept = useCallback((concept: CreativeConcept) => setViewingConcept(concept), [])
  const handleEnlarge = useCallback((asset: RelationshipMapData["assets"][number]) => setLightboxAsset(asset), [])

  useEffect(() => {
    if (!cycleId) { setData(null); setLoading(false); return }
    setLoading(true)
    getRelationshipMap(projectId, cycleId).then(setData).finally(() => setLoading(false))
  }, [projectId, cycleId])

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
    const graph = buildGraph(data, { onViewConcept: handleViewConcept, onEnlarge: handleEnlarge })
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
  }, [data, projectId, cycleId, handleViewConcept, handleEnlarge])

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
      <p className="text-sm text-muted-foreground px-5 py-10 text-center">
        Sin conceptos en este ciclo todavía — o ninguno tiene assets vinculados a un ad de Meta.
      </p>
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
