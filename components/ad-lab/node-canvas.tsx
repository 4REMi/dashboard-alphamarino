"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Plus } from "lucide-react"
import { AdNodeComponent, type AdNodeRenderData } from "@/components/ad-lab/nodes/ad-node"
import { NodeConfigPanel } from "@/components/ad-lab/node-config-panel"
import { saveWorkflowGraph } from "@/lib/actions/ad-nodes/workflows"
import { runNode, pollNodeRun, getNodeRuns } from "@/lib/actions/ad-nodes/executor"
import type { AdNodeWorkflow, AdNodeGraphNode, AdNodeType, AdNodeRun, AdNodeConfig } from "@/lib/types"

const NODE_TYPES = { adNode: AdNodeComponent }

const PALETTE: { type: AdNodeType; label: string }[] = [
  { type: "image", label: "Image" },
  { type: "analysis", label: "Image/Video Analysis" },
  { type: "text", label: "Text" },
  { type: "llm", label: "LLM" },
  { type: "generate_image", label: "Generate Image" },
  { type: "generate_video", label: "Generate Video" },
  { type: "sticky_note", label: "Sticky Note" },
]

function defaultConfig(type: AdNodeType): AdNodeConfig {
  if (type === "generate_image" || type === "generate_video") return { aspectRatio: "1:1", safetyFilterLevel: "block_only_high" }
  return {}
}

export function NodeCanvas({ workflow }: { workflow: AdNodeWorkflow }) {
  const [nodes, setNodes] = useState<Node[]>(() => workflow.graph.nodes.map(toFlowNode))
  const [edges, setEdges] = useState<Edge[]>(() => workflow.graph.edges as Edge[])
  const [runs, setRuns] = useState<Record<string, AdNodeRun>>({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    getNodeRuns(workflow.id).then((list) => {
      setRuns(Object.fromEntries(list.map((r) => [r.node_id, r])))
    })
  }, [workflow.id])

  function toFlowNode(n: AdNodeGraphNode): Node {
    return { id: n.id, type: "adNode", position: n.position, data: n.data as unknown as Record<string, unknown> }
  }

  function scheduleSave(nextNodes: Node[], nextEdges: Edge[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveWorkflowGraph(workflow.id, {
        nodes: nextNodes.map((n) => ({ id: n.id, type: "adNode", position: n.position, data: n.data as never })),
        edges: nextEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
      }).catch(() => {})
    }, 800)
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

  const onConnect = useCallback((connection: Connection) => {
    setEdges((prev) => {
      const next = addEdge(connection, prev)
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
      output: runs[n.id]?.output,
      onRun: () => handleRun(n.id),
      onOpenConfig: () => setSelectedNodeId(n.id),
      onDuplicate: () => duplicateNode(n.id),
      onDelete: () => deleteNode(n.id),
    } satisfies AdNodeRenderData,
  })), [nodes, runs]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  return (
    <div className="relative w-full h-[calc(100vh-8rem)] rounded-xl border border-border overflow-hidden">
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5 bg-card/95 backdrop-blur rounded-lg border border-border p-2 shadow-sm max-w-[90%]">
        {PALETTE.map((p) => (
          <button
            key={p.type}
            onClick={() => addNode(p.type)}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-border bg-background hover:bg-muted transition-colors"
          >
            <Plus className="w-3 h-3" /> {p.label}
          </button>
        ))}
      </div>

      <ReactFlow
        nodes={renderNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={NODE_TYPES}
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
    started_at: null, finished_at: null, updated_at: new Date().toISOString(),
  }
}
