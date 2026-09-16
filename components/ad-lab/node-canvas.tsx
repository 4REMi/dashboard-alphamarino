"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Plus, Save, Check, Loader2, PlayCircle, Copy, Trash2, Undo2, Redo2 } from "lucide-react"
import { AdNodeComponent, TYPE_STYLES, type AdNodeRenderData } from "@/components/ad-lab/nodes/ad-node"
import { SplitOrderEdge } from "@/components/ad-lab/edges/split-order-edge"
import { DeletableEdge } from "@/components/ad-lab/edges/deletable-edge"
import { splitPartColor } from "@/components/ad-lab/split-colors"
import { cn } from "@/lib/utils"
import { NodeConfigPanel } from "@/components/ad-lab/node-config-panel"
import { saveWorkflowGraph, uploadNodeImage } from "@/lib/actions/ad-nodes/workflows"
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved">("idle")
  const [isRunningAll, setIsRunningAll] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingGraph = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null)

  // Undo/redo — pilas de snapshots {nodes, edges} guardadas en refs (no
  // useState) para no disparar un re-render extra en cada acción; un
  // contador (historyTick) fuerza el re-render solo para habilitar/
  // deshabilitar los botones. recordHistory() se llama ANTES de aplicar
  // cada cambio estructural (agregar/borrar/duplicar nodo, conectar/borrar
  // arista, guardar config desde el panel) — guarda el estado tal como
  // estaba justo antes de esa acción. Tope de 50 pasos para no crecer sin
  // límite en una sesión larga.
  const pastRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const futureRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const [historyTick, setHistoryTick] = useState(0)
  const isDraggingRef = useRef(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  // Solo necesitamos screenToFlowPosition — se tipa mínimo así para no
  // pelearse con el tipo genérico de ReactFlowInstance (que se infiere del
  // shape de datos de renderNodes, no de nuestro Node plano).
  const rfInstanceRef = useRef<{ screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number } } | null>(null)
  // Espejo de `edges` legible desde el callback async de subida de imagen
  // arrastrada — para cuando el upload termina (después de que React haya
  // vuelto a renderizar varias veces) sin capturar un `edges` obsoleto del
  // closure original.
  const edgesRef = useRef<Edge[]>(edges)
  useEffect(() => { edgesRef.current = edges }, [edges])

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

  // Captura el estado ANTES de aplicar un cambio — llamar siempre justo
  // antes de mutar nodes/edges, nunca después.
  function recordHistory() {
    pastRef.current = [...pastRef.current, { nodes, edges }].slice(-50)
    futureRef.current = []
    setHistoryTick((t) => t + 1)
  }

  function undo() {
    const previous = pastRef.current[pastRef.current.length - 1]
    if (!previous) return
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [...futureRef.current, { nodes, edges }]
    setNodes(previous.nodes)
    setEdges(previous.edges)
    scheduleSave(previous.nodes, previous.edges)
    setHistoryTick((t) => t + 1)
  }

  function redo() {
    const next = futureRef.current[futureRef.current.length - 1]
    if (!next) return
    futureRef.current = futureRef.current.slice(0, -1)
    pastRef.current = [...pastRef.current, { nodes, edges }]
    setNodes(next.nodes)
    setEdges(next.edges)
    scheduleSave(next.nodes, next.edges)
    setHistoryTick((t) => t + 1)
  }

  // Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z — ignorados mientras el foco está en un
  // campo de texto (input/textarea/select), para no pelearse con el undo
  // nativo del navegador dentro del panel de configuración.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

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
    // Backspace nativo de React Flow sobre nodos seleccionados dispara un
    // change tipo "remove" aquí, sin pasar por deleteNode/deleteSelection —
    // hay que capturar el historial también para ese camino.
    if (changes.some((c) => c.type === "remove")) recordHistory()
    // Arrastrar un nodo dispara un change de "position" por cada frame del
    // mouse — grabar solo UNA vez por gesto de arrastre (al empezar), no en
    // cada pixel.
    const dragStart = changes.find((c) => c.type === "position" && c.dragging)
    if (dragStart && !isDraggingRef.current) { isDraggingRef.current = true; recordHistory() }
    if (changes.some((c) => c.type === "position" && c.dragging === false)) isDraggingRef.current = false
    setNodes((prev) => {
      const next = applyNodeChanges(changes, prev)
      scheduleSave(next, edges)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // Backspace nativo sobre una arista seleccionada — mismo caso que en
    // onNodesChange, no pasa por removeEdge().
    if (changes.some((c) => c.type === "remove")) recordHistory()
    setEdges((prev) => {
      const next = applyEdgeChanges(changes, prev)
      scheduleSave(nodes, next)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  // Una conexión que sale de un handle de parte de un nodo Split Text
  // ("part-0", "part-1", ...) se numera en el orden en que se hizo esa
  // conexión (1ra conexión de ESE nodo = 1, 2da = 2, ...) y se le asigna un
  // color fijo de la paleta compartida — así se ve de un vistazo qué parte
  // alimenta a qué nodo downstream, igual que pidió el usuario. Conexiones
  // desde cualquier otro tipo de nodo quedan como el edge default de
  // siempre, sin número ni color especial.
  const onConnect = useCallback((connection: Connection) => {
    recordHistory()
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
    recordHistory()
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

  // Arrastrar un archivo de imagen directo al canvas (desde el explorador
  // de archivos del sistema) crea un nodo Image ya con esa imagen — sin
  // pasar por "+ Image" → abrir el panel → "Subir imagen". Un nodo por
  // archivo si sueltas varios a la vez, colocados uno junto al otro en el
  // punto exacto donde soltaste (convertido de coordenadas de pantalla a
  // coordenadas del canvas vía la instancia de React Flow capturada en
  // onInit). El nodo aparece de inmediato en estado "subiendo…"; la URL
  // real se guarda cuando el upload a Storage termina.
  async function handleDropFiles(e: React.DragEvent) {
    e.preventDefault()
    setIsDraggingFile(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"))
    if (files.length === 0) return
    const instance = rfInstanceRef.current
    const basePosition = instance
      ? instance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      : { x: 100 + Math.random() * 300, y: 100 + Math.random() * 300 }

    recordHistory()
    const newNodes: Node[] = files.map((_, i) => ({
      id: crypto.randomUUID(),
      type: "adNode",
      position: { x: basePosition.x + i * 40, y: basePosition.y + i * 40 },
      data: { label: "Image", type: "image" as AdNodeType, config: {} },
    }))
    const next = [...nodes, ...newNodes]
    setNodes(next)
    scheduleSave(next, edges)

    // Cada imagen sube en paralelo y actualiza SU nodo cuando termina — un
    // archivo grande no bloquea a los demás.
    files.forEach((file, i) => {
      const fd = new FormData()
      fd.set("file", file)
      uploadNodeImage(workflow.id, fd)
        .then((url) => {
          setNodes((prev) => {
            const withImage = prev.map((n) => n.id === newNodes[i].id ? { ...n, data: { ...n.data, config: { imageUrl: url } } } : n)
            scheduleSave(withImage, edgesRef.current)
            return withImage
          })
        })
        .catch((err) => {
          window.alert(`No se pudo subir "${file.name}": ${err instanceof Error ? err.message : String(err)}`)
        })
    })
  }

  function updateNodeData(nodeId: string, label: string, config: AdNodeConfig) {
    recordHistory()
    const next = nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label, config } } : n)
    setNodes(next)
    scheduleSave(next, edges)
  }

  function duplicateNode(nodeId: string) {
    const source = nodes.find((n) => n.id === nodeId)
    if (!source) return
    recordHistory()
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
    recordHistory()
    const next = nodes.filter((n) => n.id !== nodeId)
    const nextEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
    setNodes(next)
    setEdges(nextEdges)
    scheduleSave(next, nextEdges)
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    setRuns((prev) => { const { [nodeId]: _removed, ...rest } = prev; return rest })
  }

  // Selección múltiple: mantener Ctrl (selectionKeyCode más abajo) y
  // arrastrar sobre el canvas dibuja un cuadro de selección; Ctrl+clic
  // agrega/quita un nodo puntual a la selección. Mover ya funciona nativo
  // de React Flow (arrastrar cualquiera de los seleccionados mueve a
  // todos) — solo duplicar/eliminar en lote necesitaban código propio.
  function duplicateSelection() {
    const sources = nodes.filter((n) => selectedNodeIds.includes(n.id))
    if (sources.length === 0) return
    recordHistory()
    const copies: Node[] = sources.map((source) => ({
      ...source,
      id: crypto.randomUUID(),
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      selected: false,
    }))
    const next = [...nodes, ...copies]
    setNodes(next)
    scheduleSave(next, edges)
    setSelectedNodeIds([])
  }

  function deleteSelection() {
    const idsToDelete = new Set(selectedNodeIds)
    if (idsToDelete.size === 0) return
    recordHistory()
    const next = nodes.filter((n) => !idsToDelete.has(n.id))
    const nextEdges = edges.filter((e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target))
    setNodes(next)
    setEdges(nextEdges)
    scheduleSave(next, nextEdges)
    if (selectedNodeId && idsToDelete.has(selectedNodeId)) setSelectedNodeId(null)
    setRuns((prev) => {
      const rest = { ...prev }
      for (const id of idsToDelete) delete rest[id]
      return rest
    })
    setSelectedNodeIds([])
  }

  // Borrar solo la conexión — antes únicamente posible seleccionándola y
  // presionando Backspace (nada descubrible); ahora también el botón × que
  // aparece directo sobre la línea (deletable-edge.tsx / split-order-edge.tsx).
  function removeEdge(edgeId: string) {
    recordHistory()
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

  // Referencias estables para el panel — sin esto, NodeConfigPanel recibía
  // una función NUEVA en cada render de NodeCanvas (que pasa a cada rato:
  // el polling de CUALQUIER nodo corriendo cada 4s, el ciclo
  // guardando/guardado del autoguardado, etc.), y como NodeConfigPanel está
  // memoizado (ver más abajo), esas referencias nuevas forzaban un
  // re-render igual — justo en medio de esos re-renders "de fondo" es
  // cuando un clic en un <select> a veces no se registraba (bug reportado:
  // "necesito doble clic en los dropdowns"). Solo cambian cuando de verdad
  // cambia el nodo seleccionado o el grafo (nodes/edges), nunca por runs o
  // saveState.
  const handlePanelClose = useCallback(() => setSelectedNodeId(null), [])
  const handlePanelSave = useCallback((label: string, config: AdNodeConfig) => {
    if (!selectedNodeId) return
    updateNodeData(selectedNodeId, label, config)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, nodes, edges])

  // Suma de lo ya gastado (estimado) en este workflow — solo nodos que de
  // verdad corrieron (done/running/error todos dejan su estimate, ya que
  // se calcula ANTES de enviar a APIMart, no después).
  const totalEstimatedCost = Object.values(runs).reduce((sum, r) => sum + (r.estimated_cost_usd ?? 0), 0)

  return (
    <div
      className="relative w-full h-[calc(100vh-8rem)] rounded-xl border border-border overflow-hidden"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setIsDraggingFile(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDraggingFile(false) }}
      onDrop={handleDropFiles}
    >
      {/* Overlay al arrastrar un archivo de imagen sobre el canvas — mismo
          patrón visual de "zona de drop" que el resto del dashboard. */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
          <p className="text-sm font-medium text-primary bg-card/90 px-4 py-2 rounded-lg shadow-sm">Suelta para crear un nodo Image</p>
        </div>
      )}
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
          <div className="flex items-center gap-0.5" data-history-tick={historyTick}>
            <button
              onClick={undo}
              disabled={pastRef.current.length === 0}
              title="Deshacer (Ctrl+Z)"
              className="p-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-40 disabled:hover:bg-background shadow-sm"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={futureRef.current.length === 0}
              title="Rehacer (Ctrl+Shift+Z)"
              className="p-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-40 disabled:hover:bg-background shadow-sm"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
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
        onSelectionChange={({ nodes: selected }) => setSelectedNodeIds(selected.map((n) => n.id))}
        onInit={(instance) => { rfInstanceRef.current = instance }}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        selectionKeyCode="Control"
        multiSelectionKeyCode="Control"
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable className="!bottom-3 !right-3" />
      </ReactFlow>

      {/* Barra de selección múltiple — mantener Ctrl y arrastrar dibuja un
          cuadro de selección sobre el canvas; Ctrl+clic agrega/quita un nodo
          puntual. Mover ya es nativo de React Flow (arrastrar cualquiera de
          los seleccionados mueve a todos juntos); duplicar/eliminar en lote
          se resuelven aquí. */}
      {selectedNodeIds.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-card/95 backdrop-blur rounded-lg border border-border px-3 py-2 shadow-lg">
          <span className="text-xs font-medium text-muted-foreground">{selectedNodeIds.length} nodos seleccionados</span>
          <button onClick={duplicateSelection} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-input bg-background hover:bg-muted">
            <Copy className="w-3.5 h-3.5" /> Duplicar
          </button>
          <button onClick={deleteSelection} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-destructive/40 text-destructive bg-background hover:bg-destructive/10">
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        </div>
      )}

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
          onClose={handlePanelClose}
          onSave={handlePanelSave}
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
