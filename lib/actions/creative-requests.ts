"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CreativeRequest } from "@/lib/types"

async function getRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  return { userId: user.id, role: data?.role ?? "employee" }
}

function isAdminOrSubadmin(role: string) {
  return role === "admin" || role === "subadmin"
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
}

// ── CREATE (imagen only — video requests are always auto-created) ──────────

export async function createImageRequest(
  projectId: string,
  conceptId: string,
  assignedTo: string | null,
  notes: string | null,
  imageCloneId?: string | null,
): Promise<void> {
  const supabase = await createClient()
  const { userId, role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase.from("creative_requests").insert({
    project_id: projectId,
    concept_id: conceptId,
    tipo: "imagen",
    assigned_to: assignedTo || null,
    notes: notes || null,
    image_clone_id: imageCloneId || null,
    created_by: userId,
  })
  if (error) throw error
  revalidateProject(projectId)
}

// ── READ ─────────────────────────────────────────────────────────────────

export async function getRequestsForProject(projectId: string): Promise<CreativeRequest[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_requests")
    .select(`
      *,
      assigned_to_profile:profiles!assigned_to(id, full_name, avatar_url),
      image_clone:image_clones!image_clone_id(id, generated_image_urls, status),
      fulfilled_by_asset:creative_assets!fulfilled_by_asset_id(id, asset_url, thumbnail_path, file_type)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as CreativeRequest[]
}

export async function getImageClonesForConcept(conceptId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("image_clones")
    .select("id, generated_image_urls, status, created_at")
    .eq("concept_id", conceptId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
  if (error) throw error
  return data ?? []
}

// Cross-project — everything currently assigned to me and still pending.
export async function getMyRequests(): Promise<CreativeRequest[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("creative_requests")
    .select(`
      *,
      project:projects!project_id(id, name),
      concept:creative_concepts!concept_id(id, name, angle_type)
    `)
    .eq("assigned_to", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as CreativeRequest[]
}

// ── MUTATE ───────────────────────────────────────────────────────────────

export async function cancelRequest(id: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { role } = await getRole()
  if (!isAdminOrSubadmin(role)) throw new Error("Permission denied")

  const { error } = await supabase
    .from("creative_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
  if (error) throw error
  revalidateProject(projectId)
}

// Callable by the assigned user (fulfilling their own request) or an admin/subadmin.
export async function linkAssetToRequest(requestId: string, assetId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: request } = await supabase
    .from("creative_requests")
    .select("project_id, assigned_to")
    .eq("id", requestId)
    .single()
  if (!request) throw new Error("Request not found")

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  const canFulfill = isAdminOrSubadmin(profile?.role ?? "employee") || request.assigned_to === user.id
  if (!canFulfill) throw new Error("Permission denied")

  const { error } = await supabase
    .from("creative_requests")
    .update({ status: "fulfilled", fulfilled_by_asset_id: assetId })
    .eq("id", requestId)
  if (error) throw error
  revalidateProject(request.project_id)
}

// Internal helper — video requests are NEVER created manually, only here,
// triggered when a script's client review flips to "approved". Runs off the
// admin client since it's called from the client-portal review path (no
// authenticated internal user). Idempotent: skips insert if a request for
// this brief+scriptKey combo already exists.
export async function autoCreateVideoRequestForScript(
  briefId: string,
  projectId: string,
  conceptId: string,
  scriptKey: string,
): Promise<void> {
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from("creative_requests")
    .select("id")
    .eq("brief_id", briefId)
    .eq("script_key", scriptKey)
    .eq("tipo", "video")
    .maybeSingle()
  if (existing) return

  const { error } = await supabase.from("creative_requests").insert({
    project_id: projectId,
    concept_id: conceptId,
    brief_id: briefId,
    tipo: "video",
    status: "pending",
    script_key: scriptKey,
  })
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}
