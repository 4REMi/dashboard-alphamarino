"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import type { ServiceOffer, ProjectServiceOffer, ProjectDeliverablePeriod, ProjectCustomDeliverable, DeliverableCadence } from "@/lib/types"

// Tracks contracted scope per project — what the client is owed vs. what's
// actually shipped, per service offer attached to the project. Deliberately
// separate from the internal task/deliverable system (tasks.requires_deliverable,
// the `deliverables` table, task_set_tasks): this is about what the client
// tangibly receives (a finished video, a delivered report, a meeting held),
// not internal work artifacts. Purely internal tooling — nothing here is
// ever exposed to a client; there is no portal/share page involved.
//
// Permission model (see docs/agent-guides/entregables-de-servicio.md):
//  - Attach/detach an offer, edit a period's expected quantity: admin/subadmin only
//    — a scope/contract decision, not day-to-day operations.
//  - Mark units as fulfilled: admin/subadmin, or an employee with manage_tasks
//    — the same people who already touch day-to-day task progress.
//  - View the card at all: gated by the view_service_deliverables permission
//    (defaults to true for everyone, but is a real per-person override an
//    admin can turn off — see lib/permissions.ts).

async function requireProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, permissions")
    .eq("id", user.id)
    .single()
  if (!profile) throw new Error("Profile not found")
  return profile
}

function isAdminOrSubadmin(role: string) {
  return role === "admin" || role === "subadmin"
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
}

// ============================================================
// OFFERS ATTACHED TO A PROJECT
// ============================================================

export async function getAvailableServiceOffers(): Promise<Pick<ServiceOffer, "id" | "category" | "name" | "deliverables">[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("service_offers")
    .select("id, category, name, deliverables")
    .eq("status", "active")
    .order("category")
    .order("name")
  if (error) throw error
  return data ?? []
}

export async function getProjectServiceOffers(projectId: string): Promise<ProjectServiceOffer[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("project_service_offers")
    .select("*, service_offer:service_offers(*)")
    .eq("project_id", projectId)
    .order("created_at")
  if (error) throw error
  return (data ?? []) as ProjectServiceOffer[]
}

export async function attachServiceOfferToProject(projectId: string, offerId: string): Promise<void> {
  const profile = await requireProfile()
  if (!isAdminOrSubadmin(profile.role)) throw new Error("Permission denied")

  const admin = createAdminClient()
  const { error } = await admin.from("project_service_offers").insert({
    project_id: projectId,
    service_offer_id: offerId,
    added_by: profile.id,
  })
  if (error) throw error
  revalidateProject(projectId)
}

export async function detachServiceOfferFromProject(projectId: string, offerId: string): Promise<void> {
  const profile = await requireProfile()
  if (!isAdminOrSubadmin(profile.role)) throw new Error("Permission denied")

  const admin = createAdminClient()
  // Existing project_deliverable_periods rows are left in place (historical
  // record of what was tracked while the offer was attached) — only the
  // attachment itself is removed, and no new periods get generated for it
  // going forward.
  const { error } = await admin
    .from("project_service_offers")
    .delete()
    .eq("project_id", projectId)
    .eq("service_offer_id", offerId)
  if (error) throw error
  revalidateProject(projectId)
}

// ============================================================
// CUSTOM DELIVERABLES — a one-off entregable for a project whose scope
// isn't common enough to formalize as a reusable Servicios offer. Not tied
// to any catalog offer; otherwise generates periods the exact same way.
// ============================================================

export async function getProjectCustomDeliverables(projectId: string): Promise<ProjectCustomDeliverable[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("project_custom_deliverables")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at")
  if (error) throw error
  return (data ?? []) as ProjectCustomDeliverable[]
}

export async function addCustomDeliverable(
  projectId: string,
  text: string,
  cadence: DeliverableCadence,
  quantity: number | null,
): Promise<ProjectCustomDeliverable> {
  const profile = await requireProfile()
  if (!isAdminOrSubadmin(profile.role)) throw new Error("Permission denied")
  const trimmed = text.trim()
  if (!trimmed) throw new Error("El entregable necesita un texto")

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_custom_deliverables")
    .insert({ project_id: projectId, text: trimmed, cadence, quantity, created_by: profile.id })
    .select()
    .single()
  if (error) throw error
  revalidateProject(projectId)
  return data as ProjectCustomDeliverable
}

export async function deleteCustomDeliverable(customDeliverableId: string, projectId: string): Promise<void> {
  const profile = await requireProfile()
  if (!isAdminOrSubadmin(profile.role)) throw new Error("Permission denied")

  const admin = createAdminClient()
  // Its already-generated periods are left in place as history, same as
  // detaching a catalog offer — only the definition (and future
  // generation) stops.
  const { error } = await admin
    .from("project_custom_deliverables")
    .delete()
    .eq("id", customDeliverableId)
    .eq("project_id", projectId)
  if (error) throw error
  revalidateProject(projectId)
}

// ============================================================
// PERIODS — lazy generation + read
// ============================================================

// Calendar-based period boundaries — deliberately the same logic for every
// project type (see migration comment for why this doesn't anchor to
// paid_media_cycles or any other project-type-specific cycle concept).
function currentPeriod(cadence: DeliverableCadence, projectCreatedAt: string): { start: string; label: string } {
  const now = new Date()

  if (cadence === "once") {
    const d = new Date(projectCreatedAt)
    return { start: isoDate(d), label: "Único" }
  }

  if (cadence === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const label = start.toLocaleDateString("es-MX", { month: "long", year: "numeric" })
    return { start: isoDate(start), label: capitalize(label) }
  }

  if (cadence === "quarterly") {
    const q = Math.floor(now.getMonth() / 3)
    const start = new Date(now.getFullYear(), q * 3, 1)
    return { start: isoDate(start), label: `Q${q + 1} ${now.getFullYear()}` }
  }

  // biannual
  const half = now.getMonth() < 6 ? 0 : 1
  const start = new Date(now.getFullYear(), half * 6, 1)
  return { start: isoDate(start), label: `${half === 0 ? "H1" : "H2"} ${now.getFullYear()}` }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Ensures the current period's row exists for every deliverable line of
// every offer attached to the project, AND every custom (non-catalog)
// deliverable defined directly on it (upsert — never overwrites an
// existing row, so a manual override is never lost), then returns all
// current-period rows for that project (offer-derived and custom alike;
// periods left behind by a detached offer or deleted custom deliverable
// are excluded from this "current" view, but not deleted from the DB).
export async function getCurrentPeriodDeliverables(projectId: string): Promise<ProjectDeliverablePeriod[]> {
  const profile = await requireProfile()
  if (!can(profile, "view_service_deliverables")) throw new Error("Permission denied")

  const supabase = await createClient()
  const { data: project } = await supabase.from("projects").select("created_at").eq("id", projectId).single()
  if (!project) throw new Error("Project not found")

  const [attached, customDeliverables] = await Promise.all([
    getProjectServiceOffers(projectId),
    getProjectCustomDeliverables(projectId),
  ])
  if (attached.length === 0 && customDeliverables.length === 0) return []

  const admin = createAdminClient()
  const toUpsert: Record<string, unknown>[] = []
  const activeKeys: string[] = []

  for (const row of attached) {
    const offer = row.service_offer
    if (!offer) continue
    for (const d of offer.deliverables) {
      const { start, label } = currentPeriod(d.cadence, project.created_at)
      activeKeys.push(d.id)
      toUpsert.push({
        project_id: projectId,
        service_offer_id: offer.id,
        deliverable_key: d.id,
        deliverable_text: d.text,
        period_start: start,
        period_label: label,
        expected_quantity: d.quantity ?? 1,
      })
    }
  }
  for (const d of customDeliverables) {
    const { start, label } = currentPeriod(d.cadence, project.created_at)
    activeKeys.push(d.id)
    toUpsert.push({
      project_id: projectId,
      service_offer_id: null,
      deliverable_key: d.id,
      deliverable_text: d.text,
      period_start: start,
      period_label: label,
      expected_quantity: d.quantity ?? 1,
    })
  }

  if (toUpsert.length > 0) {
    // ignoreDuplicates so an already-existing period (possibly with a
    // manually-overridden expected_quantity/text) is left untouched.
    const { error } = await admin
      .from("project_deliverable_periods")
      .upsert(toUpsert, {
        onConflict: "project_id,deliverable_key,period_start",
        ignoreDuplicates: true,
      })
    if (error) throw error
  }

  if (activeKeys.length === 0) return []

  const { data, error } = await supabase
    .from("project_deliverable_periods")
    .select("*")
    .eq("project_id", projectId)
    .in("deliverable_key", activeKeys)
    .order("deliverable_text")
  if (error) throw error
  return (data ?? []) as ProjectDeliverablePeriod[]
}

export async function updateDeliverableFulfilled(periodId: string, fulfilledQuantity: number, projectId: string): Promise<void> {
  const profile = await requireProfile()
  if (!isAdminOrSubadmin(profile.role) && !can(profile, "manage_tasks")) throw new Error("Permission denied")

  const admin = createAdminClient()
  const { data: period, error: fetchError } = await admin
    .from("project_deliverable_periods")
    .select("expected_quantity")
    .eq("id", periodId)
    .single()
  if (fetchError || !period) throw fetchError ?? new Error("Period not found")

  const clamped = Math.max(0, Math.min(fulfilledQuantity, period.expected_quantity))
  const { error } = await admin
    .from("project_deliverable_periods")
    .update({ fulfilled_quantity: clamped, updated_at: new Date().toISOString() })
    .eq("id", periodId)
  if (error) throw error
  revalidateProject(projectId)
}

// Option A from the design discussion: editing a period's text only affects
// THIS period, same as expected_quantity already did — it does NOT create a
// persistent override that future periods inherit. The next time this
// deliverable's period regenerates, it pulls the text fresh from its source
// (the offer's deliverable line, or the custom deliverable definition)
// again. Kept deliberately consistent with how expected_quantity already
// behaved, rather than introducing a second, different override model.
export async function updatePeriodText(periodId: string, text: string, projectId: string): Promise<void> {
  const profile = await requireProfile()
  if (!isAdminOrSubadmin(profile.role)) throw new Error("Permission denied")
  const trimmed = text.trim()
  if (!trimmed) throw new Error("El texto no puede quedar vacío")

  const admin = createAdminClient()
  const { error } = await admin
    .from("project_deliverable_periods")
    .update({ deliverable_text: trimmed, updated_at: new Date().toISOString() })
    .eq("id", periodId)
  if (error) throw error
  revalidateProject(projectId)
}

export async function updatePeriodExpectedQuantity(periodId: string, expectedQuantity: number, projectId: string): Promise<void> {
  const profile = await requireProfile()
  if (!isAdminOrSubadmin(profile.role)) throw new Error("Permission denied")
  if (expectedQuantity < 0) throw new Error("La cantidad no puede ser negativa")

  const admin = createAdminClient()
  const { error } = await admin
    .from("project_deliverable_periods")
    .update({ expected_quantity: expectedQuantity, updated_at: new Date().toISOString() })
    .eq("id", periodId)
  if (error) throw error
  revalidateProject(projectId)
}
