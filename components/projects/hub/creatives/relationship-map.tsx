"use client"

import { useEffect, useState, useCallback } from "react"
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, applyNodeChanges,
  type Node, type Edge, type NodeProps, type NodeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Film, ImageIcon, AlertTriangle, ChevronDown, ChevronRight, Infinity as InfinityIcon, StickyNote as StickyNoteIcon, X } from "lucide-react"
import {
  getRelationshipMap, getRelationshipMapPositions, saveRelationshipMapPosition,
  getRelationshipMapNotes, createRelationshipMapNote, updateRelationshipMapNoteText,
  updateRelationshipMapNotePosition, deleteRelationshipMapNote,
  type RelationshipMapData,
} from "@/lib/actions/relationship-map"
import { METRIC_DEFS, type MetricKey } from "@/lib/constants/paid-media-metrics"
import { CONCEPT_STATUS_COLORS, ANGLE_GUIDE, FUNNEL_COLORS } from "@/lib/constants/creatives"
import { cn } from "@/lib/utils"

interface Props {
  projectId: string
  cycleId: string | null
}

// Todas las métricas configuradas para el proyecto que tengan valor —
// a propósito NO resumido, ni colapsado ni expandido: si ya es un canvas
// "infinito", no hay razón para escatimar la información de cada nodo.
const ALL_METRIC_KEYS = Object.keys(METRIC_DEFS) as MetricKey[]

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

function ConceptNode({ data }: NodeProps<Node<{ concept: RelationshipMapData["concepts"][number] }>>) {
  const { concept } = data
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
        {concept.brandLine && (
          <span
            title={concept.brandLine.name}
            className="flex-shrink-0 w-2.5 h-2.5 rounded-full border border-white/60 ml-auto"
            style={{ backgroundColor: concept.brandLine.color }}
          />
        )}
      </div>
      <p className="text-sm font-semibold text-foreground truncate">{concept.name ?? concept.angleType ?? "Sin nombre"}</p>
      {concept.targetPersona && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{concept.targetPersona}</p>}
      {concept.brandLine && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{concept.brandLine.name}</p>}
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
  return (
    <div className="w-56 rounded-lg border-2 border-amber-300 bg-amber-50 shadow-sm">
      <div className="flex items-center justify-between px-2 py-1 border-b border-amber-200/70">
        <StickyNoteIcon className="w-3 h-3 text-amber-600" />
        <button onClick={() => data.onDelete(id)} title="Eliminar nota" className="nodrag p-0.5 rounded text-amber-700/60 hover:text-destructive hover:bg-black/5">
          <X className="w-3 h-3" />
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => data.onTextChange(id, value)}
        placeholder="Nota…"
        className="nodrag nowheel w-full h-24 resize-none bg-transparent px-2.5 py-2 text-xs text-foreground/80 focus:outline-none"
      />
    </div>
  )
}

const NODE_TYPES = { conceptNode: ConceptNode, assetNode: AssetNode, campaignNode: CampaignNode, stickyNode: StickyNode }

const COL_CONCEPT = 0
const COL_ASSET = 340
const COL_CAMPAIGN = 700
const CAMPAIGN_ROW_H = 210 // altura estimada COLAPSADA — expandir puede solapar visualmente, por eso los nodos son arrastrables
const ASSET_ROW_H = 90
const CONCEPT_ROW_H = 100

function buildGraph(data: RelationshipMapData): { nodes: Node[]; edges: Edge[] } {
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

        nodes.push({ id: `asset-${asset.id}`, type: "assetNode", position: { x: COL_ASSET, y: Math.max(campaignsStartY, cursorY - ASSET_ROW_H) }, data: { asset }, draggable: true })
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
  // El layout inicial (buildGraph) es solo el punto de partida — en
  // cuanto el usuario arrastra un nodo, esa posición se guarda en
  // relationship_map_positions (por proyecto+ciclo) y sobreescribe la
  // calculada la próxima vez que se abra el mapa. Así lo que el usuario
  // ya acomodó (típico: separar assets que el layout apiló encimados) no
  // se pierde en cada recarga.
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

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
    const graph = buildGraph(data)
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
  }, [data, projectId, cycleId])

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), [])

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (node.id.startsWith("note-")) {
      updateRelationshipMapNotePosition(node.id.slice("note-".length), node.position.x, node.position.y).catch(() => {})
    } else {
      saveRelationshipMapPosition(projectId, cycleId, node.id, node.position.x, node.position.y).catch(() => {})
    }
  }, [projectId, cycleId])

  const handleAddNote = useCallback(() => {
    createRelationshipMapNote(projectId, cycleId, 40, 40).then((note) => {
      setNodes((nds) => [...nds, noteToNode(note)])
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
    </div>
  )
}
