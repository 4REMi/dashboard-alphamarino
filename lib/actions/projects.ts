"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ProjectStatus, ProjectType } from "@/lib/types"

export async function getProjects() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("projects")
    .select("*, customer:customers(id, name, company)")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function getProject(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      customer:customers(id, name, company),
      tasks(*,assignee:profiles(id, full_name, avatar_url)),
      members:project_members(profile:profiles(id, full_name, avatar_url, position)),
      paid_media_context(*),
      web_context(*)
    `)
    .eq("id", id)
    .single()

  if (error) throw error
  return data
}

export async function createProject(formData: FormData) {
  const supabase = await createClient()

  const projectType = (formData.get("project_type") as ProjectType) ?? "paid_media"

  const { error } = await supabase.from("projects").insert({
    name: formData.get("name") as string,
    customer_id: (formData.get("customer_id") as string) || null,
    status: (formData.get("status") as ProjectStatus) ?? "Planning",
    project_type: projectType,
    start_date: (formData.get("start_date") as string) || null,
    end_date: (formData.get("end_date") as string) || null,
    budget: formData.get("budget") ? Number(formData.get("budget")) : null,
    description: (formData.get("description") as string) || null,
  })

  if (error) throw error
  revalidatePath("/projects")
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("projects")
    .update({
      name: formData.get("name") as string,
      customer_id: (formData.get("customer_id") as string) || null,
      status: formData.get("status") as ProjectStatus,
      project_type: formData.get("project_type") as ProjectType,
      start_date: (formData.get("start_date") as string) || null,
      end_date: (formData.get("end_date") as string) || null,
      budget: formData.get("budget") ? Number(formData.get("budget")) : null,
      description: (formData.get("description") as string) || null,
    })
    .eq("id", id)

  if (error) throw error
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
}

export async function deleteProject(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("projects").delete().eq("id", id)
  if (error) throw error
  revalidatePath("/projects")
}

export async function addProjectMember(projectId: string, profileId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, profile_id: profileId })

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function removeProjectMember(projectId: string, profileId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("profile_id", profileId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// PAID MEDIA ACTIONS
// ============================================================

export async function upsertPaidMediaContext(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const platforms = formData.getAll("platforms") as string[]

  const { error } = await supabase.from("paid_media_context").upsert({
    project_id: projectId,
    platforms,
    monthly_budget: formData.get("monthly_budget") ? Number(formData.get("monthly_budget")) : null,
    target_cpa: formData.get("target_cpa") ? Number(formData.get("target_cpa")) : null,
    target_roas: formData.get("target_roas") ? Number(formData.get("target_roas")) : null,
    notes: (formData.get("notes") as string) || null,
  }, { onConflict: "project_id" })

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function createPaidMediaCycle(projectId: string, cycleMonth: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("paid_media_cycles")
    .insert({ project_id: projectId, cycle_month: cycleMonth })
    .select()
    .single()

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
  return data
}

export async function updatePaidMediaCycle(cycleId: string, projectId: string, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("paid_media_cycles")
    .update({
      budget_spent: formData.get("budget_spent") ? Number(formData.get("budget_spent")) : null,
      impressions: formData.get("impressions") ? Number(formData.get("impressions")) : null,
      clicks: formData.get("clicks") ? Number(formData.get("clicks")) : null,
      conversions: formData.get("conversions") ? Number(formData.get("conversions")) : null,
      cpa: formData.get("cpa") ? Number(formData.get("cpa")) : null,
      roas: formData.get("roas") ? Number(formData.get("roas")) : null,
      notes: (formData.get("notes") as string) || null,
      status: (formData.get("status") as "active" | "closed") ?? "active",
    })
    .eq("id", cycleId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function getPaidMediaCycles(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("paid_media_cycles")
    .select("*, deliverables:paid_media_cycle_deliverables(*)")
    .eq("project_id", projectId)
    .order("cycle_month", { ascending: false })

  if (error) throw error
  return data
}

export async function toggleCycleDeliverable(deliverableId: string, done: boolean, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("paid_media_cycle_deliverables")
    .update({ done })
    .eq("id", deliverableId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function addCycleDeliverable(cycleId: string, projectId: string, title: string, dueDate?: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("paid_media_cycle_deliverables")
    .insert({ cycle_id: cycleId, title, due_date: dueDate || null })

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// SITIO WEB ACTIONS
// ============================================================

export async function upsertWebContext(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const tech_stack = (formData.get("tech_stack") as string)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const { error } = await supabase.from("web_context").upsert({
    project_id: projectId,
    tech_stack,
    repo_url: (formData.get("repo_url") as string) || null,
    staging_url: (formData.get("staging_url") as string) || null,
    production_url: (formData.get("production_url") as string) || null,
    notes: (formData.get("notes") as string) || null,
  }, { onConflict: "project_id" })

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function initWebPhases(projectId: string, phaseNames: string[]) {
  const supabase = await createClient()

  const rows = phaseNames.map((name, i) => ({
    project_id: projectId,
    name,
    phase_order: i,
    status: "pending" as const,
  }))

  const { error } = await supabase.from("web_phases").insert(rows)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function getWebPhases(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("web_phases")
    .select("*, deliverables:web_deliverables(*)")
    .eq("project_id", projectId)
    .order("phase_order", { ascending: true })

  if (error) throw error
  return data
}

export async function updateWebPhaseStatus(
  phaseId: string,
  projectId: string,
  status: "pending" | "in_progress" | "done"
) {
  const supabase = await createClient()
  const updates: Record<string, unknown> = { status }
  if (status === "in_progress") updates.started_at = new Date().toISOString()
  if (status === "done") updates.completed_at = new Date().toISOString()

  const { error } = await supabase.from("web_phases").update(updates).eq("id", phaseId)
  if (error) throw error

  // Recalculate web progress and update project
  const { data: progressData } = await supabase.rpc("get_web_progress", { p_project_id: projectId })
  if (progressData && progressData[0]) {
    await supabase
      .from("projects")
      .update({ progress: progressData[0].progress_pct })
      .eq("id", projectId)
  }

  revalidatePath(`/projects/${projectId}`)
}

export async function toggleWebDeliverable(deliverableId: string, done: boolean, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("web_deliverables")
    .update({ done })
    .eq("id", deliverableId)

  if (error) throw error

  // Recalculate progress
  const { data: progressData } = await supabase.rpc("get_web_progress", { p_project_id: projectId })
  if (progressData && progressData[0]) {
    await supabase
      .from("projects")
      .update({ progress: progressData[0].progress_pct })
      .eq("id", projectId)
  }

  revalidatePath(`/projects/${projectId}`)
}

export async function initWebDeliverables(phaseId: string, projectId: string, titles: string[]) {
  const supabase = await createClient()
  const rows = titles.map((title) => ({ phase_id: phaseId, project_id: projectId, title }))
  const { error } = await supabase.from("web_deliverables").insert(rows)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// PROJECT LOG ACTIONS
// ============================================================

export async function getProjectLog(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("project_log_entries")
    .select("*, author:profiles(id, full_name, avatar_url)")
    .eq("project_id", projectId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function addLogEntry(projectId: string, body: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("project_log_entries")
    .insert({ project_id: projectId, author_id: user.id, body })

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function toggleLogPin(entryId: string, pinned: boolean, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_log_entries")
    .update({ pinned })
    .eq("id", entryId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteLogEntry(entryId: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_log_entries")
    .delete()
    .eq("id", entryId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}
