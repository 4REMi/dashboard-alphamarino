"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { AdNodeWorkflow, AdNodeGraph } from "@/lib/types"

async function assertAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  return { supabase, user }
}

const EMPTY_GRAPH: AdNodeGraph = { nodes: [], edges: [] }

export async function listWorkflows(): Promise<Pick<AdNodeWorkflow, "id" | "name" | "created_at" | "updated_at">[]> {
  const { supabase } = await assertAuth()
  const { data, error } = await supabase
    .from("ad_node_workflows")
    .select("id, name, created_at, updated_at")
    .order("updated_at", { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getWorkflow(id: string): Promise<AdNodeWorkflow | null> {
  const { supabase } = await assertAuth()
  const { data, error } = await supabase
    .from("ad_node_workflows")
    .select("*")
    .eq("id", id)
    .single()
  if (error) return null
  return data as AdNodeWorkflow
}

export async function createWorkflow(name: string, brandBrainId?: string | null): Promise<AdNodeWorkflow> {
  const { supabase, user } = await assertAuth()
  const { data, error } = await supabase
    .from("ad_node_workflows")
    .insert({
      name: name.trim() || "Workflow sin nombre",
      brand_brain_id: brandBrainId || null,
      graph: EMPTY_GRAPH,
      created_by: user.id,
    })
    .select("*")
    .single()
  if (error) throw error
  revalidatePath("/ad-lab/nodes")
  return data as AdNodeWorkflow
}

export async function saveWorkflowGraph(workflowId: string, graph: AdNodeGraph): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("ad_node_workflows")
    .update({ graph, updated_at: new Date().toISOString() })
    .eq("id", workflowId)
  if (error) throw error
}

export async function renameWorkflow(workflowId: string, name: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase
    .from("ad_node_workflows")
    .update({ name: name.trim() || "Workflow sin nombre", updated_at: new Date().toISOString() })
    .eq("id", workflowId)
  if (error) throw error
  revalidatePath("/ad-lab/nodes")
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  const { supabase } = await assertAuth()
  const { error } = await supabase.from("ad_node_workflows").delete().eq("id", workflowId)
  if (error) throw error
  revalidatePath("/ad-lab/nodes")
}

// Lets an Image node upload a file directly instead of only accepting a
// pasted URL — same "ad-lab" storage bucket the rest of Ad Lab already
// uses, under its own workflow-scoped path.
export async function uploadNodeImage(workflowId: string, formData: FormData): Promise<string> {
  await assertAuth()
  const file = formData.get("file") as File | null
  if (!file) throw new Error("Ningún archivo recibido")

  const adminStorage = createAdminClient()
  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `ad-node-workflows/${workflowId}/${Date.now()}.${ext}`
  const buffer = await file.arrayBuffer()

  const { error } = await adminStorage.storage
    .from("ad-lab")
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (error) throw new Error(`Error subiendo imagen: ${error.message}`)

  const { data: { publicUrl } } = adminStorage.storage.from("ad-lab").getPublicUrl(path)
  return publicUrl
}
