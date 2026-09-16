"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { AdNodeGraph, AdNodeGraphNode, AdNodeRun, AdNodeRunOutput } from "@/lib/types"
import { runTextNode, runLLMNode, runAnalysisNode, runSplitTextNode } from "./node-handlers"
import { getGenerationAdapter } from "./providers/registry"
import { estimateImageCostUsd, estimateVideoCostUsd } from "./providers/pricing"

// Guards against `new Error(someObject)` silently turning into the useless
// "[object Object]" (e.g. a provider's error field being a nested object
// instead of a string) — always resolve to a readable message.
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try { return JSON.stringify(err) } catch { return String(err) }
}

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

// Kahn's algorithm — simple topological order, no external dependency
// needed for a graph this small (a workflow is dozens of nodes at most).
function topologicalOrder(graph: AdNodeGraph): AdNodeGraphNode[] {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()
  for (const node of graph.nodes) { inDegree.set(node.id, 0); adjacency.set(node.id, []) }
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue = graph.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id)
  const order: AdNodeGraphNode[] = []
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))

  while (queue.length > 0) {
    const id = queue.shift()!
    const node = byId.get(id)
    if (node) order.push(node)
    for (const next of adjacency.get(id) ?? []) {
      const deg = (inDegree.get(next) ?? 0) - 1
      inDegree.set(next, deg)
      if (deg === 0) queue.push(next)
    }
  }
  return order // a cycle simply leaves those nodes unvisited — never executed, never crashes
}

async function getNodeRunOutput(supabase: Awaited<ReturnType<typeof createClient>>, workflowId: string, nodeId: string): Promise<AdNodeRunOutput | null> {
  const { data } = await supabase
    .from("ad_node_runs")
    .select("status, output")
    .eq("workflow_id", workflowId)
    .eq("node_id", nodeId)
    .maybeSingle()
  if (!data || data.status !== "done") return null
  return data.output as AdNodeRunOutput
}

async function upsertRun(admin: ReturnType<typeof createAdminClient>, patch: Partial<AdNodeRun> & { workflow_id: string; node_id: string }) {
  const { error } = await admin
    .from("ad_node_runs")
    .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: "workflow_id,node_id" })
  if (error) throw error
}

export async function getNodeRuns(workflowId: string): Promise<AdNodeRun[]> {
  const { supabase } = await assertAuth()
  const { data, error } = await supabase.from("ad_node_runs").select("*").eq("workflow_id", workflowId)
  if (error) throw error
  return (data ?? []) as AdNodeRun[]
}

// Runs exactly ONE node — always reads the CACHED output of its upstream
// nodes (never re-runs them). This is the literal "re-run just this node"
// requirement; it errors clearly if an upstream node has no cached output
// yet rather than silently executing with empty input.
export async function runNode(workflowId: string, nodeId: string): Promise<void> {
  const { supabase } = await assertAuth()
  const admin = createAdminClient()

  const { data: workflow, error } = await supabase.from("ad_node_workflows").select("graph").eq("id", workflowId).single()
  if (error) throw error
  const graph = workflow.graph as AdNodeGraph

  const node = graph.nodes.find((n) => n.id === nodeId)
  if (!node) throw new Error("Nodo no encontrado en el workflow")
  if (node.data.type === "sticky_note") return // never executes

  // A Split Text node has one output per part, each with its own source
  // handle ("part-0", "part-1", ...) — a downstream node connected to a
  // specific handle only gets that one part as text, not the whole
  // {parts: [...]} blob (which no other node type knows how to read).
  const incomingEdges = graph.edges.filter((e) => e.target === nodeId)
  const upstreamOutputs: AdNodeRunOutput[] = []
  for (const edge of incomingEdges) {
    const upNode = graph.nodes.find((n) => n.id === edge.source)
    const output = await getNodeRunOutput(supabase, workflowId, edge.source)
    if (!output) throw new Error(`El nodo "${upNode?.data.label ?? edge.source}" todavía no tiene un resultado — córrelo primero.`)
    if (upNode?.data.type === "split_text" && edge.sourceHandle?.startsWith("part-")) {
      const partIndex = Number(edge.sourceHandle.replace("part-", ""))
      const part = output.parts?.[partIndex]
      if (part === undefined) throw new Error(`El nodo "${upNode.data.label}" no tiene una parte #${partIndex + 1} en su último resultado — vuelve a correrlo.`)
      upstreamOutputs.push({ text: part })
    } else {
      upstreamOutputs.push(output)
    }
  }

  await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "running", started_at: new Date().toISOString(), error_message: null })

  try {
    if (node.data.type === "text") {
      const output = await runTextNode(node.data.config)
      await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "done", output, finished_at: new Date().toISOString() })
    } else if (node.data.type === "image") {
      const output: AdNodeRunOutput = { image_urls: node.data.config.imageUrl ? [node.data.config.imageUrl] : [] }
      await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "done", output, finished_at: new Date().toISOString() })
    } else if (node.data.type === "llm") {
      const output = await runLLMNode(node.data.config, upstreamOutputs)
      await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "done", output, finished_at: new Date().toISOString() })
    } else if (node.data.type === "analysis") {
      const output = await runAnalysisNode(node.data.config, upstreamOutputs)
      await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "done", output, finished_at: new Date().toISOString() })
    } else if (node.data.type === "split_text") {
      const output = await runSplitTextNode(node.data.config, upstreamOutputs)
      await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "done", output, finished_at: new Date().toISOString() })
    } else if (node.data.type === "generate_image" || node.data.type === "generate_video") {
      await submitGeneration(admin, workflowId, node, upstreamOutputs)
    }
  } catch (err) {
    await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "error", error_message: messageOf(err), finished_at: new Date().toISOString() })
    throw err
  }
}

async function submitGeneration(
  admin: ReturnType<typeof createAdminClient>,
  workflowId: string,
  node: AdNodeGraphNode,
  upstream: AdNodeRunOutput[],
) {
  const kind = node.data.type === "generate_image" ? "image" : "video"
  const model = node.data.config.model
  if (!model) throw new Error("Elige un modelo antes de correr este nodo")

  const prompt = [node.data.config.prompt, ...upstream.map((o) => o.text ?? o.analysis ?? "")].filter(Boolean).join("\n\n")
  const referenceImages = upstream.flatMap((o) => o.image_urls ?? [])
  const aspectRatio = node.data.config.aspectRatio ?? "1:1"

  const durationSeconds = node.data.config.durationSeconds ?? 30
  const resolution = node.data.config.resolution

  // Every curated model routes through APIMart's unified task API
  // (confirmed against real account logs, see providers/apimart.ts) —
  // image_urls/size, plus duration/resolution for video (matters for its
  // per-second billing, see the cost estimate below). "resolution" is only
  // included when the config panel actually set one — models that price by
  // quality tier instead of resolution (e.g. Kling) never get a resolution
  // picker in the UI (see getVideoModelResolutionOptions), so there's
  // nothing valid to send; a leftover default like "720P" would just be an
  // unsupported param that model doesn't expect.
  const input = kind === "video"
    ? { prompt, image_urls: referenceImages, size: aspectRatio, duration: durationSeconds, ...(resolution ? { resolution } : {}) }
    : { prompt, image_urls: referenceImages, size: aspectRatio }

  // Cost estimate — fetched live from APIMart's public pricing endpoint
  // (see providers/pricing.ts) right before submitting, so it reflects
  // whatever they're actually charging today. Never blocks the run if the
  // pricing lookup fails (network hiccup, unlisted model) — just stored as
  // null, surfaced as "—" in the UI instead of a guess.
  const estimatedCostUsd = kind === "video"
    ? await estimateVideoCostUsd(model.replace("apimart:", ""), resolution ?? "", durationSeconds).catch(() => null)
    : await estimateImageCostUsd(model.replace("apimart:", ""), aspectRatio).catch(() => null)

  const adapter = getGenerationAdapter(kind, model)
  const { jobId } = await adapter.submit(input)
  await upsertRun(admin, { workflow_id: workflowId, node_id: node.id, status: "running", provider_job_id: jobId, estimated_cost_usd: estimatedCostUsd })
}

// Cotización total ANTES de correr todo el workflow — suma el costo
// estimado de cada nodo de generación según su configuración actual,
// aunque nunca se haya corrido. Nunca bloquea el cálculo por un modelo sin
// precio estimable; esos simplemente se cuentan aparte para que el aviso
// sea honesto sobre qué tanto del total es real.
export async function quoteWorkflow(workflowId: string): Promise<{ totalUsd: number; estimableCount: number; unestimableCount: number; generationNodeCount: number }> {
  const { supabase } = await assertAuth()
  const { data: workflow, error } = await supabase.from("ad_node_workflows").select("graph").eq("id", workflowId).single()
  if (error) throw error
  const graph = workflow.graph as AdNodeGraph

  const generationNodes = graph.nodes.filter((n) => n.data.type === "generate_image" || n.data.type === "generate_video")

  let totalUsd = 0
  let estimableCount = 0
  let unestimableCount = 0

  for (const node of generationNodes) {
    const model = node.data.config.model
    if (!model) { unestimableCount++; continue }
    const kind = node.data.type === "generate_image" ? "image" : "video"
    // No default fallback resolution here — a guessed tier the model
    // doesn't actually support would silently give a wrong quote right
    // before the user commits to spending real money on it. Unset/invalid
    // resolution just counts as unestimable instead.
    const cost = kind === "video"
      ? await estimateVideoCostUsd(model.replace("apimart:", ""), node.data.config.resolution ?? "", node.data.config.durationSeconds ?? 30).catch(() => null)
      : await estimateImageCostUsd(model.replace("apimart:", ""), node.data.config.aspectRatio ?? "1:1").catch(() => null)
    if (cost === null) { unestimableCount++; continue }
    totalUsd += cost
    estimableCount++
  }

  return { totalUsd, estimableCount, unestimableCount, generationNodeCount: generationNodes.length }
}

// Runs every node in topological order — "run the whole workflow" means
// exactly that, not a smart skip-if-cached pass. Generation nodes (async)
// only get to "submitted" here; the client polls them the same way it
// polls a single re-run. Returns a summary instead of void so the caller
// (and the person who just clicked "Correr todo") can see the actual
// outcome — how many nodes made it, how many didn't, and how many were
// never attempted because their upstream failed first.
export async function runWorkflow(workflowId: string): Promise<{ succeeded: number; failed: number; skipped: number }> {
  const { supabase } = await assertAuth()
  const { data: workflow, error } = await supabase.from("ad_node_workflows").select("graph").eq("id", workflowId).single()
  if (error) throw error
  const graph = workflow.graph as AdNodeGraph

  const order = topologicalOrder(graph)
  const attempted = new Set(order.map((n) => n.id))
  let succeeded = 0, failed = 0

  for (const node of order) {
    if (node.data.type === "sticky_note") { attempted.delete(node.id); continue }
    try {
      await runNode(workflowId, node.id)
      succeeded++
    } catch {
      // Error already recorded on the node's own run row by runNode —
      // continue attempting downstream nodes; a node whose upstream errored
      // will itself fail fast in runNode with a clear "no result yet" message.
      failed++
    }
  }

  // A cycle in the graph leaves some nodes out of the topological order
  // entirely — topologicalOrder's own contract, never crashes, just skips
  // them. Surfaced here as "skipped" so "Correr todo" doesn't silently
  // under-report against the node count the user actually sees on canvas.
  const skipped = graph.nodes.filter((n) => n.data.type !== "sticky_note" && !attempted.has(n.id)).length

  return { succeeded, failed, skipped }
}

// Called by the client every few seconds while a generate_image/video node
// is "running" — mirrors pollImageGeneration's design
// (lib/actions/image-clone.ts) including the 5-minute stuck-job timeout.
export async function pollNodeRun(workflowId: string, nodeId: string): Promise<AdNodeRun> {
  const { supabase } = await assertAuth()
  const admin = createAdminClient()

  const { data: run, error } = await supabase
    .from("ad_node_runs")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("node_id", nodeId)
    .single()
  if (error) throw error
  if (run.status !== "running" || !run.provider_job_id) return run as AdNodeRun

  const { data: workflow } = await supabase.from("ad_node_workflows").select("graph").eq("id", workflowId).single()
  const graph = workflow?.graph as AdNodeGraph | undefined
  const node = graph?.nodes.find((n) => n.id === nodeId)
  if (!node || (node.data.type !== "generate_image" && node.data.type !== "generate_video")) return run as AdNodeRun

  const kind = node.data.type === "generate_image" ? "image" : "video"
  const adapter = getGenerationAdapter(kind, node.data.config.model ?? "")
  const result = await adapter.poll(run.provider_job_id)

  if (result.state === "running") {
    // Video toma mucho más que imagen (Seedance/Veo fácilmente pasan de
    // 5-10 minutos, sobre todo en resoluciones/duraciones altas) — el
    // límite de 5 minutos que compartían ambos venía de copiar el de
    // pollImageGeneration (image-clone.ts), pensado solo para imagen.
    const timeoutMs = kind === "video" ? 30 * 60 * 1000 : 10 * 60 * 1000
    const ageMs = run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0
    if (ageMs > timeoutMs) {
      const timeoutMsg = `Tiempo de espera agotado generando el resultado (más de ${Math.round(timeoutMs / 60000)} minutos) — el proveedor puede seguir procesándolo, pero dejamos de esperar aquí.`
      await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "error", error_message: timeoutMsg, finished_at: new Date().toISOString() })
      return { ...run, status: "error", error_message: timeoutMsg } as AdNodeRun
    }
    return run as AdNodeRun
  }

  if (result.state === "succeeded") {
    const output: AdNodeRunOutput = kind === "image" ? { image_urls: result.urls } : { video_url: result.urls[0] }
    await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "done", output, finished_at: new Date().toISOString() })
    return { ...run, status: "done", output } as AdNodeRun
  }

  await upsertRun(admin, { workflow_id: workflowId, node_id: nodeId, status: "error", error_message: result.error, finished_at: new Date().toISOString() })
  return { ...run, status: "error", error_message: result.error } as AdNodeRun
}
