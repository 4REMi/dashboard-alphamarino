"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ProjectStatus, PhaseStatus, CycleDeliverableStatus, CampaignStatus } from "@/lib/types"

// ============================================================
// READ
// ============================================================

export async function getProjects() {
  const supabase = await createClient()
  const now = new Date().toISOString().split("T")[0]

  // Try full query first; fall back to minimal if any join table is missing
  let rawData: Record<string, unknown>[] | null = null

  const { data: fullData, error: fullError } = await supabase
    .from("projects")
    .select(`
      *,
      customer:customers(id, name, company),
      project_type:project_types(id, name),
      members:project_members(profile_id),
      tasks(id, status, due_date),
      phases:project_phases(id, status)
    `)
    .order("created_at", { ascending: false })

  if (!fullError) {
    rawData = fullData ?? []
  } else {
    // Fallback: minimal query without optional joins
    const { data: minimal, error: minError } = await supabase
      .from("projects")
      .select(`
        *,
        customer:customers(id, name, company),
        members:project_members(profile_id),
        tasks(id, status, due_date)
      `)
      .order("created_at", { ascending: false })
    if (minError) throw minError
    rawData = (minimal ?? []).map((p) => ({ ...p, project_type: null, phases: [] }))
  }

  // Try to fetch log entries separately
  let logMap: Record<string, string> = {}
  try {
    const { data: logs } = await supabase
      .from("project_log_entries")
      .select("project_id, created_at")
      .order("created_at", { ascending: false })
    if (logs) {
      for (const l of logs) {
        if (!logMap[l.project_id as string]) logMap[l.project_id as string] = l.created_at as string
      }
    }
  } catch { /* table may not exist yet */ }

  return rawData.map((p) => {
    const tasks = (p.tasks ?? []) as Array<{ status: string; due_date: string | null }>
    const phases = (p.phases ?? []) as Array<{ status: string }>

    const hasOverdueTasks = tasks.some(
      (t) => t.status !== "Done" && t.due_date && (t.due_date as string) < now
    )
    const hasBlockedPhase = phases.some((ph) => ph.status === "blocked")

    const lastActivity = logMap[p.id as string] ?? (p.created_at as string)
    const inactiveForDays = Math.floor(
      (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      ...p,
      members: ((p.members ?? []) as Array<{ profile_id: string }>).map((m) => m.profile_id),
      attention: {
        hasOverdueTasks,
        hasBlockedPhase,
        hasPendingCycleReport: false,
        inactiveForDays,
      },
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any[]
}

export async function getProject(id: string) {
  const supabase = await createClient()

  // Try full query; fall back without optional join tables
  let data: Record<string, unknown>

  const { data: fullData, error: fullError } = await supabase
    .from("projects")
    .select(`
      *,
      customer:customers(id, name, company, email, phone),
      project_type:project_types(id, name, description, default_phase_set_id),
      tasks(*, assignee:profiles(id, full_name, avatar_url, position)),
      members:project_members(profile:profiles(id, full_name, avatar_url, position, role)),
      phases:project_phases(*)
    `)
    .eq("id", id)
    .single()

  if (!fullError) {
    data = fullData as Record<string, unknown>
  } else {
    // Fallback without project_type and project_phases joins
    const { data: minData, error: minError } = await supabase
      .from("projects")
      .select(`
        *,
        customer:customers(id, name, company, email, phone),
        tasks(*, assignee:profiles(id, full_name, avatar_url, position)),
        members:project_members(profile:profiles(id, full_name, avatar_url, position, role))
      `)
      .eq("id", id)
      .single()
    if (minError) throw minError
    data = { ...minData, project_type: null, phases: [] } as Record<string, unknown>
  }

  // Optional hub tables — fetch separately so a missing table doesn't crash the page
  let paidMediaContext = null
  let webProjectContext = null

  try {
    const { data: pmc } = await supabase
      .from("paid_media_context")
      .select("*")
      .eq("project_id", id)
      .maybeSingle()
    paidMediaContext = pmc
  } catch { /* table may not exist */ }

  try {
    const { data: wpc } = await supabase
      .from("web_project_context")
      .select("*")
      .eq("project_id", id)
      .maybeSingle()
    webProjectContext = wpc
  } catch { /* table may not exist */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    ...data,
    paid_media_context: paidMediaContext ? [paidMediaContext] : [],
    web_project_context: webProjectContext ? [webProjectContext] : [],
    phases: ((data.phases ?? []) as Array<{ phase_order: number }>)
      .sort((a, b) => a.phase_order - b.phase_order),
    tasks: ((data.tasks ?? []) as Array<{ due_date: string | null }>)
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

// ============================================================
// PROJECT CRUD
// ============================================================

export async function createProject(
  formData: FormData,
  selectedPhaseSetPhaseIds?: string[]
) {
  const supabase = await createClient()
  const projectTypeId = formData.get("project_type_id") as string

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name: formData.get("name") as string,
      customer_id: (formData.get("customer_id") as string) || null,
      project_type_id: projectTypeId && projectTypeId !== "none" ? projectTypeId : null,
      status: (formData.get("status") as ProjectStatus) ?? "Planning",
      project_value: formData.get("project_value") ? Number(formData.get("project_value")) : null,
      monthly_fee: formData.get("monthly_fee") ? Number(formData.get("monthly_fee")) : null,
      start_date: (formData.get("start_date") as string) || null,
      end_date: (formData.get("end_date") as string) || null,
      description: (formData.get("description") as string) || null,
    })
    .select()
    .single()

  if (error) throw error

  // Copy selected phase set phases to project_phases
  if (selectedPhaseSetPhaseIds && selectedPhaseSetPhaseIds.length > 0) {
    const { data: templatePhases } = await supabase
      .from("phase_set_phases")
      .select("*")
      .in("id", selectedPhaseSetPhaseIds)
      .order("phase_order")

    if (templatePhases && templatePhases.length > 0) {
      const projectPhases = templatePhases.map((tp, i) => ({
        project_id: project.id,
        name: tp.name,
        description: tp.description,
        phase_order: i,
      }))
      await supabase.from("project_phases").insert(projectPhases)
    }
  }

  revalidatePath("/projects")
  return project
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = await createClient()
  const projectTypeId = formData.get("project_type_id") as string

  const { error } = await supabase
    .from("projects")
    .update({
      name: formData.get("name") as string,
      customer_id: (formData.get("customer_id") as string) || null,
      project_type_id: projectTypeId && projectTypeId !== "none" ? projectTypeId : null,
      status: formData.get("status") as ProjectStatus,
      project_value: formData.get("project_value") ? Number(formData.get("project_value")) : null,
      monthly_fee: formData.get("monthly_fee") ? Number(formData.get("monthly_fee")) : null,
      start_date: (formData.get("start_date") as string) || null,
      end_date: (formData.get("end_date") as string) || null,
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

// ============================================================
// TEAM
// ============================================================

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
// PROJECT PHASES
// ============================================================

export async function updateProjectPhaseStatus(
  phaseId: string,
  status: PhaseStatus,
  projectId: string
) {
  const supabase = await createClient()
  const updates: Record<string, unknown> = { status }
  if (status === "in_progress") updates.started_at = new Date().toISOString()
  if (status === "completed") updates.completed_at = new Date().toISOString()

  const { error } = await supabase
    .from("project_phases")
    .update(updates)
    .eq("id", phaseId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function updateProjectPhaseNotes(phaseId: string, notes: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_phases")
    .update({ notes })
    .eq("id", phaseId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// PAID MEDIA CONTEXT
// ============================================================

export async function upsertPaidMediaContext(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const platforms = formData.getAll("platforms") as string[]
  const mainObjective = formData.get("main_objective") as string

  const { error } = await supabase.from("paid_media_context").upsert(
    {
      project_id: projectId,
      platforms,
      monthly_ad_budget: formData.get("monthly_ad_budget") ? Number(formData.get("monthly_ad_budget")) : null,
      main_objective: mainObjective && mainObjective !== "none" ? mainObjective : null,
      target_roas: formData.get("target_roas") ? Number(formData.get("target_roas")) : null,
      target_cpa: formData.get("target_cpa") ? Number(formData.get("target_cpa")) : null,
      target_cpl: formData.get("target_cpl") ? Number(formData.get("target_cpl")) : null,
      target_leads_per_month: formData.get("target_leads_per_month") ? Number(formData.get("target_leads_per_month")) : null,
      account_notes: (formData.get("account_notes") as string) || null,
    },
    { onConflict: "project_id" }
  )
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// PAID MEDIA CYCLES
// ============================================================

export async function getProjectCycles(projectId: string) {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from("paid_media_cycles")
      .select("*")
      .eq("project_id", projectId)
      .order("cycle_month", { ascending: false })
    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

export async function openNewCycle(projectId: string, cycleMonth: string) {
  const supabase = await createClient()

  // Close current active cycle
  await supabase
    .from("paid_media_cycles")
    .update({ is_active: false })
    .eq("project_id", projectId)
    .eq("is_active", true)

  // Open new cycle
  const { error } = await supabase.from("paid_media_cycles").insert({
    project_id: projectId,
    cycle_month: cycleMonth + "-01",
    is_active: true,
  })
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function updateCycle(cycleId: string, projectId: string, formData: FormData) {
  const supabase = await createClient()
  const campaignStatus = formData.get("campaign_status") as string

  const { error } = await supabase
    .from("paid_media_cycles")
    .update({
      campaign_status: campaignStatus && campaignStatus !== "none" ? (campaignStatus as CampaignStatus) : null,
      report_cutoff_date: (formData.get("report_cutoff_date") as string) || null,
      report_delivery_date: (formData.get("report_delivery_date") as string) || null,
      report_status: (formData.get("report_status") as CycleDeliverableStatus) ?? "pending",
      creative_status: (formData.get("creative_status") as CycleDeliverableStatus) ?? "pending",
      roas_real: formData.get("roas_real") ? Number(formData.get("roas_real")) : null,
      cpa_real: formData.get("cpa_real") ? Number(formData.get("cpa_real")) : null,
      cpl_real: formData.get("cpl_real") ? Number(formData.get("cpl_real")) : null,
      real_spend: formData.get("real_spend") ? Number(formData.get("real_spend")) : null,
      real_results: formData.get("real_results") ? Number(formData.get("real_results")) : null,
    })
    .eq("id", cycleId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function closeCycle(cycleId: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("paid_media_cycles")
    .update({ is_active: false })
    .eq("id", cycleId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// WEB PROJECT CONTEXT
// ============================================================

export async function upsertWebContext(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("web_project_context").upsert(
    {
      project_id: projectId,
      platform: (formData.get("platform") as string) || null,
      staging_url: (formData.get("staging_url") as string) || null,
      production_url: (formData.get("production_url") as string) || null,
      technical_notes: (formData.get("technical_notes") as string) || null,
      revisions_included: formData.get("revisions_included") ? Number(formData.get("revisions_included")) : 0,
      revisions_used: formData.get("revisions_used") ? Number(formData.get("revisions_used")) : 0,
    },
    { onConflict: "project_id" }
  )
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

export async function incrementRevision(projectId: string) {
  const supabase = await createClient()
  const { data: ctx } = await supabase
    .from("web_project_context")
    .select("revisions_used")
    .eq("project_id", projectId)
    .single()

  const { error } = await supabase
    .from("web_project_context")
    .update({ revisions_used: (ctx?.revisions_used ?? 0) + 1 })
    .eq("project_id", projectId)

  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// PROJECT LOG
// ============================================================

export async function getProjectLog(projectId: string) {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from("project_log_entries")
      .select("*, author:profiles(id, full_name, avatar_url)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
    if (error) return []
    return data ?? []
  } catch {
    return []
  }
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

export async function deleteLogEntry(entryId: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_log_entries")
    .delete()
    .eq("id", entryId)
  if (error) throw error
  revalidatePath(`/projects/${projectId}`)
}
