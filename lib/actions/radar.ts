"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildRadar } from "@/lib/radar/engine"
import { notify } from "@/lib/notifications/notify"
import type { RadarSnapshot, StrategyLine } from "@/lib/radar/types"

// Radar Paid Media — ver lib/radar/engine.ts y docs/agent-guides/radar.md.
// Ver: admin/subadmin, o miembros del proyecto. Editar estrategia, aplicar
// y descartar: admin/subadmin.

const META_BASE = "https://graph.facebook.com/v21.0"

async function me() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")
  const { data } = await supabase.from("profiles").select("id, role, full_name").eq("id", user.id).single()
  return { id: user.id, role: (data?.role as string) ?? "employee", name: (data?.full_name as string) ?? "Alguien" }
}
const isEditor = (role: string) => role === "admin" || role === "subadmin"

async function assertCanView(projectId: string, u: { id: string; role: string }) {
  if (isEditor(u.role)) return
  const { data } = await createAdminClient().from("project_members").select("profile_id").eq("project_id", projectId).eq("profile_id", u.id).maybeSingle()
  if (!data) throw new Error("Sin acceso a este proyecto")
}

export async function getProjectRadar(projectId: string): Promise<RadarSnapshot> {
  const u = await me()
  await assertCanView(projectId, u)
  return buildRadar(projectId, { canEdit: isEditor(u.role) })
}

// Vista de agencia: proyectos de paid media activos con ciclo activo,
// ordenados por urgencia. Empleados: solo los suyos.
export async function getAgencyRadar(): Promise<RadarSnapshot[]> {
  const u = await me()
  const db = createAdminClient()
  const { data: cycles } = await db.from("paid_media_cycles").select("project_id, project:projects(status)").eq("is_active", true)
  let ids = [...new Set((cycles ?? []).filter((c) => (c.project as unknown as { status: string } | null)?.status === "Active").map((c) => c.project_id as string))]
  if (!isEditor(u.role)) {
    const { data: mine } = await db.from("project_members").select("project_id").eq("profile_id", u.id)
    const set = new Set((mine ?? []).map((m) => m.project_id))
    ids = ids.filter((id) => set.has(id))
  }
  const snaps = await Promise.all(ids.map((id) => buildRadar(id, { canEdit: isEditor(u.role) }).catch(() => null)))
  return (snaps.filter(Boolean) as RadarSnapshot[]).sort((a, b) =>
    (b.counts.crit - a.counts.crit) || (Number(!a.strategy) - Number(!b.strategy)) * -1 || (b.counts.warn - a.counts.warn) || a.projectName.localeCompare(b.projectName))
}

// ── Estrategia ──────────────────────────────────────────────────────────

export interface StrategyDraft {
  cycle: { id: string; start: string; end: string } | null
  currency: string
  budget: number | null
  budgetHint: string | null
  lines: StrategyLine[]
  brandLines: { id: string; name: string; color: string | null }[]
  concepts: { id: string; name: string; brand_line_id: string | null; thumb: string | null }[]
  testing_concept_ids: string[]
  bet: string
  budget_guard: "warn" | "auto_pause"
  previousBet: string | null
  suggestedCpr: number | null
}

// Valores para el formulario: lo guardado, o una PROPUESTA a partir del
// ciclo anterior (gasto y costo por resultado reales). Una persona la confirma.
export async function getStrategyDraft(projectId: string): Promise<StrategyDraft> {
  const u = await me()
  await assertCanView(projectId, u)
  const db = createAdminClient()
  const [{ data: project }, { data: cycles }, { data: integration }] = await Promise.all([
    db.from("projects").select("brand_brain_id").eq("id", projectId).single(),
    db.from("paid_media_cycles").select("id, start_date, end_date, is_active, real_spend, real_results").eq("project_id", projectId).order("start_date", { ascending: false }).limit(6),
    db.from("project_integrations").select("currency").eq("project_id", projectId).eq("platform", "meta").maybeSingle(),
  ])
  const active = (cycles ?? []).find((c) => c.is_active) ?? null
  const prev = (cycles ?? []).find((c) => !c.is_active && c.start_date < (active?.start_date ?? "9999")) ?? null
  const [{ data: saved }, { data: prevStrat }, { data: brandLines }, { data: concepts }] = await Promise.all([
    active ? db.from("radar_strategies").select("*").eq("project_id", projectId).eq("cycle_id", active.id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("radar_strategies").select("*").eq("project_id", projectId).order("confirmed_at", { ascending: false }).limit(1).maybeSingle(),
    project?.brand_brain_id ? db.from("brand_lines").select("id, name, color").eq("brand_brain_id", project.brand_brain_id).order("position") : Promise.resolve({ data: [] }),
    db.from("creative_concepts").select("id, name, brand_line_id, status, assets:creative_assets(thumbnail_path, file_path, asset_url)").eq("project_id", projectId).order("created_at", { ascending: false }).limit(80),
  ])

  // Gasto/costo reales del ciclo anterior (Meta) para proponer.
  let prevSpend: number | null = prev?.real_spend != null ? Number(prev.real_spend) : null
  let prevCpr: number | null = prev?.real_spend && prev?.real_results ? Number(prev.real_spend) / Number(prev.real_results) : null
  if (prev && prevSpend == null) {
    const { data: st } = await db.from("meta_ad_daily_stats").select("spend, results").eq("project_id", projectId).eq("cycle_id", prev.id)
    const sp = (st ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0), rs = (st ?? []).reduce((s, r) => s + Number(r.results ?? 0), 0)
    if (sp > 0) { prevSpend = sp; prevCpr = rs > 0 ? sp / rs : null }
  }
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/`
  const conceptList = ((concepts ?? []) as unknown as { id: string; name: string | null; brand_line_id: string | null; status: string | null; assets: { thumbnail_path: string | null; file_path: string | null; asset_url: string | null }[] }[])
    .filter((c) => c.status !== "archived")
    .map((c) => {
      const isVid = (u: string | null) => !!u && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)
      const a = c.assets?.find((x) => x.thumbnail_path || (x.file_path && !isVid(x.file_path)) || (x.asset_url && !isVid(x.asset_url)))
      return { id: c.id, name: c.name ?? "Concepto", brand_line_id: c.brand_line_id, thumb: a ? (a.thumbnail_path ? base + a.thumbnail_path : a.file_path && !isVid(a.file_path) ? base + a.file_path : isVid(a.asset_url) ? null : a.asset_url) : null }
    })

  const src = saved ?? null
  const carry = !src && prevStrat ? prevStrat : null
  const suggestedLines: StrategyLine[] = (brandLines ?? []).length
    ? (brandLines ?? []).map((l) => ({ key: l.id, name: l.name, brand_line_id: l.id, channel: "Meta Ads", conversion: "Leads", budget: null, target_cpr: null }))
    : [{ key: "general", name: "General", brand_line_id: null, channel: "Meta Ads", conversion: "Leads", budget: null, target_cpr: prevCpr ? Math.round(prevCpr * 100) / 100 : null }]

  return {
    cycle: active ? { id: active.id, start: active.start_date, end: active.end_date } : null,
    currency: (integration?.currency as string | null) || "USD",
    budget: src ? Number(src.budget) : carry ? Number(carry.budget) : prevSpend ? Math.round(prevSpend) : null,
    budgetHint: !src && prevSpend ? `Propuesta: lo invertido el ciclo anterior${prevCpr ? ` (costo por resultado ${prevCpr.toFixed(2)})` : ""}.` : null,
    // Sin pre-seleccionar todas las líneas: la persona elige qué se empuja.
    lines: (src?.lines as StrategyLine[] | undefined) ?? (carry?.lines as StrategyLine[] | undefined) ?? (suggestedLines.length === 1 ? suggestedLines : []),
    brandLines: (brandLines ?? []) as { id: string; name: string; color: string | null }[],
    concepts: conceptList,
    testing_concept_ids: (src?.testing_concept_ids as string[] | undefined) ?? [],
    bet: src?.bet ?? "",
    budget_guard: (src?.budget_guard ?? carry?.budget_guard ?? "warn") as "warn" | "auto_pause",
    previousBet: carry?.bet ?? null,
    suggestedCpr: prevCpr ? Math.round(prevCpr * 100) / 100 : null,
  }
}

export async function saveStrategy(projectId: string, input: { budget: number; budget_guard: "warn" | "auto_pause"; lines: StrategyLine[]; testing_concept_ids: string[]; bet: string }): Promise<void> {
  const u = await me()
  if (!isEditor(u.role)) throw new Error("Solo admin o subadmin definen la estrategia")
  if (!(input.budget > 0)) throw new Error("Pon el presupuesto del ciclo")
  if (input.bet.trim().length < 12) throw new Error("Escribe la apuesta del ciclo (una frase)")
  const lines = input.lines.filter((l) => l.name.trim())
  if (!lines.length) throw new Error("Agrega al menos una línea")
  const db = createAdminClient()
  const { data: cycle } = await db.from("paid_media_cycles").select("id, start_date, end_date").eq("project_id", projectId).eq("is_active", true).maybeSingle()
  if (!cycle) throw new Error("Este proyecto no tiene ciclo activo")
  const { data: integration } = await db.from("project_integrations").select("currency").eq("project_id", projectId).eq("platform", "meta").maybeSingle()
  const cur = (integration?.currency as string | null) || "USD"

  const { error } = await db.from("radar_strategies").upsert({
    project_id: projectId, cycle_id: cycle.id, budget: input.budget, budget_guard: input.budget_guard,
    lines, testing_concept_ids: input.testing_concept_ids, bet: input.bet.trim(), confirmed_by: u.id, confirmed_at: new Date().toISOString(),
  }, { onConflict: "project_id,cycle_id" })
  if (error) throw new Error(error.message.includes("radar_strategies") ? "Falta correr la migración 111 en Supabase" : error.message)

  // Queda fijada en la bitácora: la ve el equipo y la leen reportes/briefs/MCP.
  const { data: concepts } = input.testing_concept_ids.length ? await db.from("creative_concepts").select("name").in("id", input.testing_concept_ids) : { data: [] }
  const body = [
    `**Estrategia del ciclo** (${cycle.start_date} → ${cycle.end_date}) · [Radar]`,
    `**Apuesta:** ${input.bet.trim()}`,
    `**Presupuesto:** ${input.budget.toLocaleString("es-MX")} ${cur}${input.budget_guard === "auto_pause" ? " · pausa automática al llegar al límite" : ""}`,
    ...lines.map((l) => `- ${l.name} · ${l.channel} · ${l.conversion}${l.target_cpr ? ` · meta ${l.target_cpr} ${cur} por resultado` : ""}${l.budget ? ` · ${l.budget} ${cur}` : ""}`),
    (concepts ?? []).length ? `**A prueba:** ${(concepts ?? []).map((c) => c.name).join(", ")}` : "",
  ].filter(Boolean).join("\n")
  await db.from("project_log_entries").update({ pinned: false }).eq("project_id", projectId).eq("pinned", true).ilike("body", "%[Radar]%")
  await db.from("project_log_entries").insert({ project_id: projectId, author_id: u.id, body, category: "Decisión", pinned: true })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/radar")
}

// ── Descartar / aplicar ─────────────────────────────────────────────────

export async function dismissRec(projectId: string, recKey: string, reason: string): Promise<void> {
  const u = await me()
  if (!isEditor(u.role)) throw new Error("Sin permiso")
  const snap = await buildRadar(projectId, { canEdit: true })
  const rec = snap.recs.find((r) => r.key === recKey)
  if (!rec || !snap.cycle) throw new Error("Esa recomendación ya no está vigente")
  const { error } = await createAdminClient().from("radar_events").insert({ project_id: projectId, cycle_id: snap.cycle.id, rec_key: recKey, rule: rec.rule, outcome: "dismissed", reason, detail: rec.title, created_by: u.id })
  if (error) throw new Error(error.message)
  revalidatePath("/radar")
}

export async function undoRec(projectId: string, recKey: string): Promise<void> {
  const u = await me()
  if (!isEditor(u.role)) throw new Error("Sin permiso")
  await createAdminClient().from("radar_events").delete().eq("project_id", projectId).eq("rec_key", recKey).eq("outcome", "dismissed")
  revalidatePath("/radar")
}

async function metaPause(ids: string[]): Promise<string[]> {
  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN no está configurado")
  const failed: string[] = []
  for (const id of ids) {
    const res = await fetch(`${META_BASE}/${id}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ status: "PAUSED", access_token: token }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.error) failed.push(`${id}: ${json.error?.message ?? res.status}`)
  }
  return failed
}

// Ejecuta el botón principal. Vuelve a calcular el Radar en el servidor
// (nunca confía en lo que mande el navegador) y registra todo en la bitácora.
export async function applyRec(projectId: string, recKey: string): Promise<{ message: string }> {
  const u = await me()
  if (!isEditor(u.role)) throw new Error("Sin permiso")
  const snap = await buildRadar(projectId, { canEdit: true })
  const rec = snap.recs.find((r) => r.key === recKey)
  if (!rec || !rec.action || !snap.cycle) throw new Error("Esa recomendación ya no está vigente")
  const db = createAdminClient()
  const a = rec.action
  let message = ""
  if (a.kind === "pause_ads" || a.kind === "pause_campaigns") {
    const ids = a.kind === "pause_ads" ? a.adIds : a.campaignIds
    const failed = await metaPause(ids)
    if (failed.length === ids.length) throw new Error(`Meta rechazó el cambio: ${failed[0]}`)
    if (a.kind === "pause_ads") await db.from("meta_ads").update({ status: "PAUSED" }).eq("project_id", projectId).in("ad_id", ids)
    message = `${a.kind === "pause_ads" ? "Anuncio pausado" : `${ids.length - failed.length} campaña(s) pausada(s)`} en Meta${failed.length ? ` (${failed.length} con error)` : ""}`
  } else if (a.kind === "task") {
    const { error } = await db.from("tasks").insert({ project_id: projectId, title: a.title, description: a.description, status: "Todo", assignee_id: u.id })
    if (error) throw new Error(error.message)
    message = "Tarea creada y asignada a ti"
  } else {
    throw new Error("Esta recomendación no tiene acción directa")
  }
  await db.from("radar_events").insert({ project_id: projectId, cycle_id: snap.cycle.id, rec_key: recKey, rule: rec.rule, outcome: "applied", detail: `${rec.title} → ${message}`, created_by: u.id })
  await db.from("project_log_entries").insert({ project_id: projectId, author_id: u.id, body: `**Radar:** ${rec.title}\n→ ${message}.`, category: "Decisión" })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/radar")
  return { message }
}

export async function getRadarHistory(projectId: string): Promise<{ id: string; outcome: string; reason: string | null; detail: string | null; created_at: string; who: string | null }[]> {
  const u = await me()
  await assertCanView(projectId, u)
  const { data } = await createAdminClient().from("radar_events").select("id, outcome, reason, detail, created_at, who:profiles!radar_events_created_by_fkey(full_name)").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30)
  return ((data ?? []) as unknown as { id: string; outcome: string; reason: string | null; detail: string | null; created_at: string; who: { full_name: string } | null }[]).map((e) => ({ ...e, who: e.who?.full_name ?? null }))
}

// ── Freno de presupuesto (cron, después de sincronizar Meta) ────────────
// Avisa al 80% y 90%; al 100% pausa solo si la estrategia lo pidió.
export async function runRadarBudgetGuard(cronSecret: string): Promise<{ checked: number; paused: number }> {
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) throw new Error("unauthorized")
  const db = createAdminClient()
  const { data: strategies } = await db.from("radar_strategies").select("project_id, cycle_id, budget_guard, cycle:paid_media_cycles!inner(is_active)").eq("cycle.is_active", true)
  let checked = 0, paused = 0
  for (const s of strategies ?? []) {
    checked++
    const snap = await buildRadar(s.project_id, { canEdit: true }).catch(() => null)
    if (!snap?.pacing || !snap.cycle) continue
    const { data: done } = await db.from("radar_events").select("rec_key").eq("project_id", s.project_id).eq("cycle_id", snap.cycle.id).like("rec_key", "guard:%")
    const seen = new Set((done ?? []).map((d) => d.rec_key))
    const { data: members } = await db.from("project_members").select("profile_id").eq("project_id", s.project_id)
    const { data: admins } = await db.from("profiles").select("id").eq("role", "admin")
    const to = [...new Set([...(members ?? []).map((m) => m.profile_id as string), ...(admins ?? []).map((a) => a.id as string)])]
    const amount = `${Math.round(snap.pacing.spend).toLocaleString("es-MX")} de ${Math.round(snap.pacing.budget).toLocaleString("es-MX")} ${snap.currency}`
    for (const th of [80, 90]) {
      const key = `guard:${th}`
      if (snap.pacing.pct >= th && snap.pacing.pct < 100 && !seen.has(key)) {
        await db.from("radar_events").insert({ project_id: s.project_id, cycle_id: snap.cycle.id, rec_key: key, rule: "pacing", outcome: "auto", detail: `Aviso ${th}%: ${amount}` })
        await Promise.all(to.map((id) => notify(id, "radar_budget_threshold", { projectName: snap.projectName, pct: th, amount })))
      }
    }
    if (snap.pacing.pct >= 100 && s.budget_guard === "auto_pause" && !seen.has("guard:100")) {
      const rec = snap.recs.find((r) => r.rule === "pacing" && r.action?.kind === "pause_campaigns")
      const ids = rec?.action?.kind === "pause_campaigns" ? rec.action.campaignIds : []
      const failed = ids.length ? await metaPause(ids).catch((e) => [String(e)]) : []
      await db.from("radar_events").insert({ project_id: s.project_id, cycle_id: snap.cycle.id, rec_key: "guard:100", rule: "pacing", outcome: "auto", detail: `Pausa automática al 100% (${amount}): ${ids.length - failed.length} campaña(s)` })
      await db.from("project_log_entries").insert({ project_id: s.project_id, author_id: to[0] ?? null, body: `**Radar (automático):** se llegó al presupuesto pactado (${amount}). Se pausaron ${ids.length - failed.length} campaña(s) en Meta.`, category: "Decisión" })
      await Promise.all(to.map((id) => notify(id, "radar_budget_paused", { projectName: snap.projectName, amount, campaigns: ids.length - failed.length })))
      paused++
    }
  }
  return { checked, paused }
}
