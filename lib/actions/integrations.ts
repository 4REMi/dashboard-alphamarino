"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { ProjectIntegration } from "@/lib/types"

export async function getProjectIntegrations(projectId: string): Promise<ProjectIntegration[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("project_integrations")
    .select("*")
    .eq("project_id", projectId)
    .order("platform")
  if (error) return []
  return data ?? []
}

export async function upsertProjectIntegration(projectId: string, platform: string, accountId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_integrations")
    .upsert(
      { project_id: projectId, platform, account_id: accountId, updated_at: new Date().toISOString() },
      { onConflict: "project_id,platform" }
    )
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteProjectIntegration(projectId: string, platform: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_integrations")
    .delete()
    .eq("project_id", projectId)
    .eq("platform", platform)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}
