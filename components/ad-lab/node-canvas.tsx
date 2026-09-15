"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Plus, Save, Check, Loader2, PlayCircle } from "lucide-react"
import { AdNodeComponent, TYPE_STYLES, type AdNodeRenderData } from "@/components/ad-lab/nodes/ad-node"
import { SplitOrderEdge } from "@/components/ad-lab/edges/split-order-edge"
import { DeletableEdge } from "@/components/ad-lab/edges/deletable-edge"
import { splitPartColor } from "@/components/ad-lab/split-colors"
import { cn } from "@/lib/utils"
import { NodeConfigPanel } from "@/components/ad-lab/node-config-panel"
import { saveWorkflowGraph } from "@/lib/actions/ad-nodes/workflows"
import { runNode, runWorkflow, quoteWorkflow, pollNodeRun, getNodeRuns } from "@/lib/actions/ad-nodes/executor"
import type { AdNodeWorkflow, AdNodeGraphNode, AdNodeType, AdNodeRun, AdNodeConfig } from "@/lib/types"

const NODE_TYPES = { adNode: AdNodeComponent }
const EDGE_TYPES = { default: DeletableEdge, splitOrder: SplitOrderEdge }

const PALETTE: { type: AdNodeType; label: string }[] = [
  { type: "image", label: "Image" },
  { type: "analysis", label: "Image/Video Analysis" },
  { type: "text", label: "Text" },
  { type: "split_text", label: "Split Text" },
  { type: "llm", label: "LLM" },
  { type: "generate_image", label: "Generate Image" },
  { type: "generate_video", label: "Generate Video" },
  { type: "sticky_note", label: "Sticky Note" },
]

function defaultConfig(type: AdNodeType): AdNodeConfig {
  if (type === "generate_image" || type === "generate_video") return { aspectRatio: "1:1", safetyFilterLevel: "block_only_high" }
  if (type === "split_text") return { splitDelimiter: "newline" }
  return {}
}

export function NodeCanvas({ workflow }: { workflow: AdNodeWorkflow }) {
  const [nodes, setNodes] = useState<Node[]>(() => workflow.graph.nodes.map(toFlowNode))
  const [edges, setEdges] = useState<Edge[]>(() => workflow.graph.edges as Edge[])
  const [runs, setRuns] = useState<Record<string, AdNodeRun>>({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved">("idle")
  const [isRunningAll, setIsRunningAll] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingGraph = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null)

  useEffect(() => {
    getNodeRuns(workflow.id).then((list) => {
      setRuns(Object.fromEntries(list.map((r) => [r.node_id, r])))
    })
  }, [workflow.id])

  function toFlowNode(n: AdNodeGraphNode): Node {
    return { id: n.id, type: "adNode", position: n.position, data: n.data as unknown as Record<string, unknown> }
  }

  async function persist(nextNodes: Node[], nextEdges: Edge[]) {
    setSaveState("saving")
    try {
      await saveWorkflowGraph(workflow.id, {
        nodes: nextNodes.map((n) => ({ id: n.id, type: "adNode", position: n.position, data: n.data as never })),
        edges: nextEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: e.type as "splitOrder" | undefined, data: e.data as { order: number; color: string } | undefined })),
      })
      setSaveState("saved")
    } catch {
      setSaveState("pending") // keep showing "sin guardar" so it's obvious a retry is needed
    }
  }

  function scheduleSave(nextNodes: Node[], nextEdges: Edge[]) {
    pendingGraph.current = { nodes: nextNodes, edges: nextEdges }
    setSaveState("pending")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (pendingGraph.current) persist(pendingGraph.current.nodes, pendingGraph.current.edges)
    }, 800)
  }

  // Explicit "Guardar" — flushes the debounce immediately instead of
  // waiting ~800ms, for the moment right before navigating away or when
  // the user just wants confirmation it's actually saved.
  function handleSaveNow() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    persist(nodes, edges)
  }

  // "Correr todo" — re-corre el workflow completo en orden topológico.
  // Precauciones: (1) fuerza el guardado del layout actual primero, para
  // que el ejecutor (que lee el `graph` ya persistido, no el estado local)
  // corra exactamente lo que se ve en pantalla; (2) cotiza el costo de los
  // nodos de generación ANTES de correr y pide confirmación explícita —
  // esto puede gastar dinero real; (3) deshabilita el botón mientras corre
  // para evitar un doble-click que dispare el mismo workflow dos veces;
  // (4) refresca `runs` al terminar para que el polling ya existente (cada
  // 4s) recoja cualquier nodo de generación que haya quedado "running".
  async function handleRunAll() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await persist(nodes, edges)

    const quote = await quoteWorkflow(workflow.id).catch(() => null)
    let confirmMessage = "¿Correr todos los nodos del workflow?"
    if (quote && quote.generationNodeCount > 0) {
      confirmMessage = `Esto va a correr ${quote.generationNodeCount} nodo(s) de generación. Costo estimado: $${quote.totalUsd.toFixed(4)} USD`
      if (quote.unestimableCount > 0) {
        confirmMessage += ` (${quote.unestimableCount} nodo(s) sin modelo elegido o sin precio disponible, no incluido(s) en el estimado)`
      }
      confirmMessage += ".\n\n¿Continuar?"
    }
    if (!window.confirm(confirmMessage)) return

    setIsRunningAll(true)
    try {
      const result = await runWorkflow(workflow.id)
      const list = await getNodeRuns(workflow.id)
      setRuns(Object.fromEntries(list.map((r) => [r.node_id, r])))
      const parts = [`${result.succeeded} nodo(s) corrieron bien`]
      if (result.failed > 0) parts.push(`${result.failed} fallaron`)
      if (result.skipped > 0) parts.push(`${result.skipped} se omitieron (ciclo en el grafo)`)
      window.alert(parts.join(", ") + ".")
    } catch (err) {
      window.alert(`No se pudo correr el workflow: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsRunningAll(false)
    }
  }

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => {
      const next = applyNodeChanges(changes, prev)
      scheduleSave(next, edges)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((prev) => {
      const next = applyEdgeChanges(changes, prev)
      scheduleSave(nodes, next)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes])

  // Una conexión que sale de un handle de parte de un nodo Split Text
  // ("part-0", "part-1", ...) se numera en el orden en que se hizo esa
  // conexión (1ra conexión de ESE nodo = 1, 2da = 2, ...) y se le asigna un
  // color fijo de la paleta compartida — así se ve de un vistazo qué parte
  // alimenta a qué nodo downstream, igual que pidió el usuario. Conexiones
  // desde cualquier otro tipo de nodo quedan como el edge default de
  // siempre, sin número ni color especial.
  const onConnect = useCallback((connection: Connection) => {
    setEdges((prev) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const isSplitPart = (sourceNode?.data as { type?: AdNodeType } | undefined)?.type === "split_text" && connection.sourceHandle?.startsWith("part-")
      let newEdge: Connection & { type?: "splitOrder"; data?: { order: number; color: string } } = connection
      if (isSplitPart) {
        const existingOrders = prev.filter((e) => e.source === connection.source && e.type === "splitOrder").length
        const order = existingOrders + 1
        newEdge = { ...connection, type: "splitOrder", data: { order, color: splitPartColor(order - 1) } }
      }
      const next = addEdge(newEdge, prev)
      scheduleSave(nodes, next)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes])

  function addNode(type: AdNodeType) {
    const id = crypto.randomUUID()
    const label = PALETTE.find((p) => p.type === type)?.label ?? type
    const node: Node = {
      id, type: "adNode",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 300 },
      data: { label, type, config: defaultConfig(type) },
    }
    const next = [...nodes, node]
    setNodes(next)
    scheduleSave(next, edges)
  }

  function updateNodeData(nodeId: string, label: string, config: AdNodeConfig) {
    const next = nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label, config } } : n)
    setNodes(next)
    scheduleSave(next, edges)
  }

  function duplicateNode(nodeId: string) {
    const source = nodes.find((n) => n.id === nodeId)
    if (!source) return
    const copy: Node = {
      ...source,
      id: crypto.randomUUID(),
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      selected: false,
    }
    const next = [...nodes, copy]
    setNodes(next)
    scheduleSave(next, edges)
  }

  function deleteNode(nodeId: string) {
    const next = nodes.filter((n) => n.id !== nodeId)
    const nextEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
    setNodes(next)
    setEdges(nextEdges)
    scheduleSave(next, nextEdges)
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    setRuns((prev) => { const { [nodeId]: _removed, ...rest } = prev; return rest })
  }

  // Borrar solo la conexión — antes únicamente posible seleccionándola y
  // presionando Backspace (nada descubrible); ahora también el botón × que
  // aparece directo sobre la línea (deletable-edge.tsx / split-order-edge.tsx).
  function removeEdge(edgeId: string) {
    const next = edges.filter((e) => e.id !== edgeId)
    setEdges(next)
    scheduleSave(nodes, next)
  }

  async function handleRun(nodeId: string) {
    setRuns((prev) => ({ ...prev, [nodeId]: { ...(prev[nodeId] ?? blankRun(workflow.id, nodeId)), status: "running" } }))
    try {
      await runNode(workflow.id, nodeId)
      const list = await getNodeRuns(workflow.id)
      setRuns(Object.fromEntries(list.map((r) => [r.node_id, r])))
    } catch (err) {
      setRuns((prev) => ({ ...prev, [nodeId]: { ...(prev[nodeId] ?? blankRun(workflow.id, nodeId)), status: "error", error_message: err instanceof Error ? err.message : String(err) } }))
    }
  }

  // Poll any node currently "running" (generate_image/video jobs) every 4s.
  useEffect(() => {
    const runningIds = Object.values(runs).filter((r) => r.status === "running").map((r) => r.node_id)
    if (runningIds.length === 0) {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
      return
    }
    if (pollTimer.current) return
    pollTimer.current = setInterval(async () => {
      for (const nodeId of runningIds) {
        try {
          const updated = await pollNodeRun(workflow.id, nodeId)
          setRuns((prev) => ({ ...prev, [nodeId]: updated }))
        } catch { /* keep polling */ }
      }
    }, 4000)
    return () => { if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null } }
  }, [runs, workflow.id])

  const renderNodes = useMemo(() => nodes.map((n) => ({
    ...n,
    data: {
      ...(n.data as unknown as { label: string; type: AdNodeType; config: AdNodeConfig }),
      status: runs[n.id]?.status ?? "idle",
      errorMessage: runs[n.id]?.error_message,
      estimatedCostUsd: runs[n.id]?.estimated_cost_usd,
      output: runs[n.id]?.output,
      onRun: () => handleRun(n.id),
      onOpenConfig: () => setSelectedNodeId(n.id),
      onDuplicate: () => duplicateNode(n.id),
      onDelete: () => deleteNode(n.id),
    } satisfies AdNodeRenderData,
  })), [nodes, runs]) // eslint-disable-line react-hooks/exhaustive-deps

  const renderEdges = useMemo(() => edges.map((e) => ({
    ...e,
    data: { ...(e.data as object | undefined), onDelete: () => removeEdge(e.id) },
  })), [edges]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  // Suma de lo ya gastado (estimado) en este workflow — solo nodos que de
  // verdad corrieron (done/running/error todos dejan su estimate, ya que
  // se calcula ANTES de enviar a APIMart, no después).
  const totalEstimatedCost = Object.values(runs).reduce((sum, r) => sum + (r.estimated_cost_usd ?? 0), 0)

  return (
    <div className="relative w-full h-[calc(100vh-8rem)] rounded-xl border border-border overflow-hidden">
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5 bg-card/95 backdrop-blur rounded-lg border border-border p-2 shadow-sm max-w-[75%]">
        {PALETTE.map((p) => (
          <button
            key={p.type}
            onClick={() => addNode(p.type)}
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border transition-colors hover:brightness-95",
              TYPE_STYLES[p.type].badge
            )}
          >
            <Plus className="w-3 h-3" /> {p.label}
          </button>
        ))}
      </div>

      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Guardando…</>}
            {saveState === "saved" && <><Check className="w-3 h-3 text-emerald-600" /> Guardado</>}
            {saveState === "pending" && "Sin guardar"}
          </span>
          <button
            onClick={handleSaveNow}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <Save className="w-3.5 h-3.5" /> Guardar
          </button>
          <button
            onClick={handleRunAll}
            disabled={isRunningAll}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
          >
            {isRunningAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />} Correr todo
          </button>
        </div>
        {totalEstimatedCost > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-600 text-white shadow-sm">
            Costo estimado del workflow: ${totalEstimatedCost.toFixed(4)} USD
          </div>
        )}
      </div>

      <ReactFlow
        nodes={renderNodes}
        edges={renderEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable className="!bottom-3 !right-3" />
      </ReactFlow>

      {selectedNode && (
        <NodeConfigPanel
          // Forces a fresh component instance per node — without this,
          // React reuses the same instance across selections and its
          // internal useState (label/config) never resets, leaking the
          // previous node's field values into the next one.
          key={selectedNode.id}
          workflowId={workflow.id}
          data={selectedNode.data as unknown as { label: string; type: AdNodeType; config: AdNodeConfig }}
          run={runs[selectedNode.id]}
          onClose={() => setSelectedNodeId(null)}
          onSave={(label, config) => updateNodeData(selectedNode.id, label, config)}
        />
      )}
    </div>
  )
}

function blankRun(workflowId: string, nodeId: string): AdNodeRun {
  return {
    id: "", workflow_id: workflowId, node_id: nodeId, status: "idle",
    input_snapshot: null, output: null, error_message: null, provider_job_id: null,
    estimated_cost_usd: null, started_at: null, finished_at: null, updated_at: new Date().toISOString(),
  }
}
