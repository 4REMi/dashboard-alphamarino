"use client"

import { useEffect, useState, useCallback } from "react"
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, applyNodeChanges,
  type Node, type Edge, type NodeProps, type NodeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Film, ImageIcon, AlertTriangle } from "lucide-react"
import { getRelationshipMap, type RelationshipMapData } from "@/lib/actions/relationship-map"
import { METRIC_DEFS, type MetricKey } from "@/lib/constants/paid-media-metrics"
import { CONCEPT_STATUS_COLORS, ANGLE_GUIDE, FUNNEL_COLORS } from "@/lib/constants/creatives"
import { cn } from "@/lib/utils"

interface Props {
  projectId: string
  cycleId: string | null
}

// Todas las métricas configuradas para el proyecto que tengan valor en
// este ad — a propósito NO resumido: si ya es un canvas "infinito", no
// hay razón para escatimar la información que trae cada nodo.
const ALL_METRIC_KEYS = Object.keys(METRIC_DEFS) as MetricKey[]

function ConceptNode({ data }: NodeProps<Node<{ concept: RelationshipMapData["concepts"][number] }>>) {
  const { concept } = data
  const angleEntry = ANGLE_GUIDE.find((a) => a.name === concept.angleType)
  return (
    <div className="w-64 rounded-xl border-2 border-violet-300 bg-violet-50 p-3 shadow-sm">
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="flex items-center gap-1.5 mb-1">
        {angleEntry && <span className="text-sm">{angleEntry.emoji}</span>}
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", CONCEPT_STATUS_COLORS[concept.status as keyof typeof CONCEPT_STATUS_COLORS] ?? "bg-gray-100 text-gray-600")}>
          {concept.status}
        </span>
        {concept.funnelStage && (
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", FUNNEL_COLORS[concept.funnelStage as keyof typeof FUNNEL_COLORS] ?? "bg-gray-100")}>
            {concept.funnelStage}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground truncate">{concept.name ?? concept.angleType ?? "Sin nombre"}</p>
      {concept.targetPersona && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{concept.targetPersona}</p>}
    </div>
  )
}

function AssetNode({ data }: NodeProps<Node<{ asset: RelationshipMapData["assets"][number] }>>) {
  const { asset } = data
  return (
    <div className="w-48 rounded-xl border-2 border-sky-300 bg-sky-50 p-2.5 shadow-sm flex items-center gap-2.5">
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
        {asset.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
        )}
        {asset.fileType === "video" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Film className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{asset.format ?? "Asset"}</p>
        {asset.platform && <p className="text-[10px] text-muted-foreground truncate">{asset.platform}</p>}
      </div>
    </div>
  )
}

function AdNode({ data }: NodeProps<Node<{ ad: RelationshipMapData["ads"][number] }>>) {
  const { ad } = data
  const media = ad.image_url ?? ad.thumbnail_url
  const metricsWithValue = ALL_METRIC_KEYS.filter((k) => ad.metrics[k]?.value !== null)

  return (
    <div className="w-72 rounded-xl border-2 border-emerald-300 bg-white shadow-sm overflow-hidden">
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <div className="flex items-center gap-2 p-2.5 border-b border-border">
        <div className="w-10 h-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {media && <img src={media} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{ad.ad_name ?? "Sin nombre"}</p>
          <p className="text-[10px] text-muted-foreground truncate">{ad.campaign_name ?? "Sin campaña"}</p>
        </div>
        <span className={cn(
          "text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0",
          ad.status === "ACTIVE" ? "bg-emerald-500 text-white" : "bg-slate-800 text-white"
        )}>
          {ad.status === "ACTIVE" ? "Activo" : ad.status ?? "—"}
        </span>
      </div>
      {/* Todas las métricas con dato — sin resumir */}
      <div className="grid grid-cols-2 gap-1.5 p-2.5">
        {metricsWithValue.map((key) => {
          const m = ad.metrics[key]!
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
    </div>
  )
}

const NODE_TYPES = { conceptNode: ConceptNode, assetNode: AssetNode, adNode: AdNode }

const COL_CONCEPT = 0
const COL_ASSET = 340
const COL_AD = 700
const AD_ROW_H = 210
const ASSET_ROW_H = 90
const CONCEPT_ROW_H = 100

function buildGraph(data: RelationshipMapData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let cursorY = 0

  for (const concept of data.concepts) {
    const conceptAssets = data.assets.filter((a) => a.conceptId === concept.id)
    const assetsStartY = cursorY

    if (conceptAssets.length === 0) {
      cursorY += ASSET_ROW_H
    } else {
      for (const asset of conceptAssets) {
        const assetAds = data.ads.filter((ad) => data.assetAdEdges.some((e) => e.assetId === asset.id && e.adId === ad.ad_id))
        const adsStartY = cursorY

        if (assetAds.length === 0) {
          cursorY += ASSET_ROW_H
        } else {
          for (const ad of assetAds) {
            nodes.push({ id: `ad-${ad.ad_id}`, type: "adNode", position: { x: COL_AD, y: cursorY }, data: { ad }, draggable: true })
            edges.push({ id: `e-${asset.id}-${ad.ad_id}`, source: `asset-${asset.id}`, target: `ad-${ad.ad_id}`, animated: ad.status === "ACTIVE", style: { stroke: "#10b981" } })
            cursorY += AD_ROW_H
          }
        }

        nodes.push({ id: `asset-${asset.id}`, type: "assetNode", position: { x: COL_ASSET, y: (adsStartY + cursorY) / 2 - ASSET_ROW_H / 2 }, data: { asset }, draggable: true })
        edges.push({ id: `e-${concept.id}-${asset.id}`, source: `concept-${concept.id}`, target: `asset-${asset.id}`, style: { stroke: "#0ea5e9" } })
      }
    }

    nodes.push({ id: `concept-${concept.id}`, type: "conceptNode", position: { x: COL_CONCEPT, y: (assetsStartY + cursorY) / 2 - CONCEPT_ROW_H / 2 }, data: { concept }, draggable: true })
  }

  return { nodes, edges }
}

export function RelationshipMap({ projectId, cycleId }: Props) {
  const [data, setData] = useState<RelationshipMapData | null>(null)
  const [loading, setLoading] = useState(true)
  // Reacomodar nodos es puramente visual (para que esto se pueda volver
  // la vista canónica de referencia) — nunca se guarda, y se resetea al
  // recargar los datos (nuevo ciclo, o el layout recalculado).
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  useEffect(() => {
    if (!cycleId) { setData(null); setLoading(false); return }
    setLoading(true)
    getRelationshipMap(projectId, cycleId).then(setData).finally(() => setLoading(false))
  }, [projectId, cycleId])

  useEffect(() => {
    const graph = data ? buildGraph(data) : { nodes: [], edges: [] }
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [data])

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), [])

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
        Los datos son de solo lectura — puedes arrastrar los nodos para acomodar la vista, no se guarda ni afecta nada real.
      </div>
    </div>
  )
}
