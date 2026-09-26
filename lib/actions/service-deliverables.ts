"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import { computePeriods, todayIso, CADENCE_EVERY, type ScopePeriod, type ScopePeriodRule } from "@/lib/utils/scope-periods"
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

// actingProfileId is set only by the MCP server (no cookies/session there)
// — same pattern as tasks.ts/projects.ts/services.ts.
async function requireProfile(actingProfileId?: string) {
  if (actingProfileId) {
    const admin = createAdminClient()
    const { data: profile } = await admin.from("profiles").select("id, role, permissions").eq("id", actingProfileId).single()
    if (!profile) throw new Error("Profile not found")
    return profile
  }
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

export async function attachServiceOfferToProject(projectId: string, offerId: string, actingProfileId?: string): Promise<void> {
  const profile = await requireProfile(actingProfileId)
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
// PERIODS — por proyecto (no calendario), con historial
// ============================================================

export interface ScopeLine {
  key: string
  offerId: string | null
  offerName: string | null
  customId: string | null
  // Texto de control (corto) y el de venta completo (solo para hover).
  text: string
  fullText: string
  cadence: DeliverableCadence
  quantity: number | null
}

export interface ScopeOverview {
  rule: ScopePeriodRule
  ruleIsDefault: boolean
  hasCycles: boolean
  // Periodos desde que hay alcance, del más viejo al actual (máx. 12).
  periods: (ScopePeriod & { isCurrent: boolean })[]
  lines: ScopeLine[]
  // Filas de todos los periodos listados + hitos únicos.
  rows: ProjectDeliverablePeriod[]
}

const MAX_PERIODS = 12

// Regla efectiva: la guardada, o automática (ciclos si el proyecto los
// tiene; si no, mensual desde su fecha de inicio).
function resolveRule(
  project: { scope_period_mode: string | null; scope_period_anchor: string | null; scope_period_weeks: number | null; start_date: string | null; created_at: string },
  hasCycles: boolean,
): { rule: ScopePeriodRule; isDefault: boolean } {
  const fallbackAnchor = project.start_date ?? project.created_at.slice(0, 10)
  if (project.scope_period_mode) {
    return {
      isDefault: false,
      rule: {
        mode: project.scope_period_mode as ScopePeriodRule["mode"],
        anchor: project.scope_period_anchor ?? fallbackAnchor,
        weeks: project.scope_period_weeks,
      },
    }
  }
  return { isDefault: true, rule: hasCycles ? { mode: "cycles", anchor: null, weeks: null } : { mode: "monthly", anchor: fallbackAnchor, weeks: null } }
}

// Genera (perezosamente) las filas de cada periodo desde que cada línea
// entró al proyecto hasta el periodo actual, y regresa todo para el
// historial. Filas en 0 que ya no caen en la cuadrícula de periodos (ej.
// se cambió la regla) se borran; las que tienen algo marcado se conservan.
export async function getScopeOverview(projectId: string): Promise<ScopeOverview> {
  const profile = await requireProfile()
  if (!can(profile, "view_service_deliverables")) throw new Error("Permission denied")

  const supabase = await createClient()
  const { data: projectRow } = await supabase.from("projects").select("*").eq("id", projectId).single()
  if (!projectRow) throw new Error("Project not found")
  const project = projectRow as { scope_period_mode: string | null; scope_period_anchor: string | null; scope_period_weeks: number | null; start_date: string | null; created_at: string }

  const [attached, customDeliverables, { data: cycles }, { data: attachRows }] = await Promise.all([
    getProjectServiceOffers(projectId),
    getProjectCustomDeliverables(projectId),
    supabase.from("paid_media_cycles").select("start_date, end_date").eq("project_id", projectId),
    supabase.from("project_service_offers").select("service_offer_id, created_at").eq("project_id", projectId),
  ])
  const hasCycles = (cycles ?? []).length > 0
  const { rule, isDefault } = resolveRule(project, hasCycles)

  const lines: ScopeLine[] = []
  const since = new Map<string, string>() // desde cuándo cuenta cada línea
  const attachedAt = new Map((attachRows ?? []).map((r) => [r.service_offer_id as string, (r.created_at as string).slice(0, 10)]))
  for (const row of attached) {
    const offer = row.service_offer
    if (!offer) continue
    for (const d of offer.deliverables) {
      lines.push({
        key: d.id, offerId: offer.id, offerName: offer.name, customId: null,
        text: d.control_text?.trim() || d.text, fullText: d.text, cadence: d.cadence, quantity: d.quantity,
      })
      since.set(d.id, attachedAt.get(offer.id) ?? todayIso())
    }
  }
  for (const d of customDeliverables) {
    lines.push({ key: d.id, offerId: null, offerName: null, customId: d.id, text: d.text, fullText: d.text, cadence: d.cadence, quantity: d.quantity })
    since.set(d.id, d.created_at.slice(0, 10))
  }
  if (lines.length === 0) return { rule, ruleIsDefault: isDefault, hasCycles, periods: [], lines, rows: [] }

  const today = todayIso()
  const earliest = [...since.values()].reduce((a, b) => (a < b ? a : b))
  const allPeriods = computePeriods(rule, cycles ?? [], earliest, today, 6)
  const currentIdx = Math.max(0, allPeriods.findIndex((p) => p.start <= today && today <= p.end))
  const lastIdx = allPeriods.findIndex((p) => p.start <= today && today <= p.end) >= 0 ? currentIdx : allPeriods.length - 1
  const visible = allPeriods.slice(Math.max(0, lastIdx - MAX_PERIODS + 1), lastIdx + 1)

  const toUpsert: Record<string, unknown>[] = []
  const validStarts = new Map<string, Set<string>>()
  for (const line of lines) {
    if (line.cadence === "continuous") continue
    const base = {
      project_id: projectId,
      service_offer_id: line.offerId,
      deliverable_key: line.key,
      deliverable_text: line.text,
      expected_quantity: line.quantity ?? 1,
    }
    if (line.cadence === "once") {
      toUpsert.push({ ...base, period_start: project.created_at.slice(0, 10), period_label: "Único" })
      continue
    }
    // Cada N periodos: bloques contados desde el periodo en que entró la línea.
    const every = CADENCE_EVERY[line.cadence] ?? 1
    const firstIdx = allPeriods.findIndex((p) => p.end >= since.get(line.key)!)
    if (firstIdx < 0) continue
    const starts = new Set<string>()
    for (let i = firstIdx; i <= lastIdx; i += every) {
      const block = allPeriods.slice(i, i + every)
      const start = block[0].start
      const end = block.length === every ? block[block.length - 1].end : null
      starts.add(start)
      if (!visible.some((p) => p.start === start)) continue
      toUpsert.push({
        ...base, period_start: start, period_end: end,
        period_label: every === 1 ? block[0].label : `${block[0].label.split(" – ")[0]} · ${every} periodos`,
      })
    }
    validStarts.set(line.key, starts)
  }

  const admin = createAdminClient()
  if (toUpsert.length) {
    const upsert = (rows: Record<string, unknown>[]) => admin.from("project_deliverable_periods")
      .upsert(rows, { onConflict: "project_id,deliverable_key,period_start", ignoreDuplicates: true })
    let { error } = await upsert(toUpsert)
    // Sin la migración 102 todavía: sin period_end.
    if (error && /period_end/.test(error.message)) {
      ;({ error } = await upsert(toUpsert.map(({ period_end: _omit, ...r }) => { void _omit; return r })))
    }
    if (error) throw error
  }

  const keys = lines.filter((l) => l.cadence !== "continuous").map((l) => l.key)
  const { data } = keys.length
    ? await supabase.from("project_deliverable_periods").select("*").eq("project_id", projectId).in("deliverable_key", keys)
    : { data: [] }
  const rows: ProjectDeliverablePeriod[] = []
  const stale: string[] = []
  for (const r of (data ?? []) as ProjectDeliverablePeriod[]) {
    const line = lines.find((l) => l.key === r.deliverable_key)!
    if (line.cadence === "once") { rows.push(r); continue }
    if (validStarts.get(r.deliverable_key)?.has(r.period_start)) rows.push(r)
    else if (r.fulfilled_quantity === 0) stale.push(r.id)
  }
  if (stale.length) await admin.from("project_deliverable_periods").delete().in("id", stale)

  return {
    rule,
    ruleIsDefault: isDefault,
    hasCycles,
    periods: visible.map((p) => ({ ...p, isCurrent: p.start <= today && today <= p.end })),
    lines,
    rows,
  }
}

export async function setScopePeriodRule(projectId: string, rule: { mode: ScopePeriodRule["mode"] | null; anchor: string | null; weeks: number | null }): Promise<void> {
  const profile = await requireProfile()
  if (!isAdminOrSubadmin(profile.role)) throw new Error("Permission denied")
  if (rule.mode === "weeks" && !(rule.weeks && rule.weeks > 0)) throw new Error("Indica cada cuántas semanas")
  const admin = createAdminClient()
  const { error } = await admin.from("projects").update({
    scope_period_mode: rule.mode,
    scope_period_anchor: rule.mode === "monthly" || rule.mode === "weeks" ? rule.anchor : null,
    scope_period_weeks: rule.mode === "weeks" ? rule.weeks : null,
  }).eq("id", projectId)
  if (error) throw new Error(error.message)
  revalidateProject(projectId)
}

// Sin tope: si tocaban 3 y se entregaron 4, se registra 4 (sobre-entrega
// visible). Marcar un periodo ya terminado queda como "marcado después".
export async function updateDeliverableFulfilled(periodId: string, fulfilledQuantity: number, projectId: string): Promise<void> {
  const profile = await requireProfile()
  if (!isAdminOrSubadmin(profile.role) && !can(profile, "manage_tasks")) throw new Error("Permission denied")

  const admin = createAdminClient()
  const { data: period } = await admin
    .from("project_deliverable_periods")
    .select("period_end")
    .eq("id", periodId)
    .maybeSingle()

  const late = !!period?.period_end && period.period_end < todayIso()
  const base = { fulfilled_quantity: Math.max(0, Math.floor(fulfilledQuantity)), updated_at: new Date().toISOString() }
  let { error } = await admin
    .from("project_deliverable_periods")
    .update({ ...base, fulfilled_at: new Date().toISOString(), ...(late ? { marked_late: true } : {}) })
    .eq("id", periodId)
  // Sin la migración 102 todavía.
  if (error && /fulfilled_at|marked_late/.test(error.message)) {
    ;({ error } = await admin.from("project_deliverable_periods").update(base).eq("id", periodId))
  }
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
