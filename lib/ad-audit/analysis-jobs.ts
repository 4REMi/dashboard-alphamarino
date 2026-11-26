// Cola de «Analizar partes» de auditorías (migración 127). SIN "use server":
// no verifica sesión; lo llaman las actions (con permiso) y el trabajador
// /api/audit-worker (con CRON_SECRET). Ver docs/agent-guides/auditorias.md.
//
// Flujo: el botón encola (enqueueAuditAnalyses) y despierta al trabajador
// (kickAuditWorker). El trabajador toma 2 trabajos, los analiza en paralelo
// y, si quedan más, se vuelve a despertar a sí mismo. Si la cadena se corta
// (deploy, error de red), la siguiente consulta de estado la retoma.

import { createAdminClient } from "@/lib/supabase/admin"
import { runTrusted, setTrustedProfile } from "@/lib/trusted-context"
import { analyzeLibraryAd } from "@/lib/actions/ad-analysis"
import { auditAnalysisKey } from "@/lib/ad-audit/parts"

const BATCH = 2
const STALE_MS = 6 * 60_000       // un análisis no pasa de ~5 min (límite de Vercel)
const MAX_ATTEMPTS = 3

// ── Analizar un creativo (lo usan el trabajador y la action directa) ─

export async function runAuditCreativeAnalysis(adId: string, force = false): Promise<{ key: string; ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: ad } = await admin.from("audit_ads")
    .select("id, meta_ad_id, name, format, meta_video_id, image_url, cached_image_url, landing_url, body, campaign_id")
    .eq("id", adId).maybeSingle()
  if (!ad) return { key: "", ok: false, error: "Anuncio no encontrado" }
  const key = auditAnalysisKey(ad)

  if (!force) {
    const { data: existing } = await admin.from("ad_analyses").select("analysis").eq("ad_archive_id", key).maybeSingle()
    if ((existing?.analysis as { partes?: unknown } | undefined)?.partes) return { key, ok: true }
  }

  let videoUrl: string | null = null
  if (ad.meta_video_id) {
    const { data: v } = await admin.from("audit_videos").select("storage_url").eq("meta_video_id", ad.meta_video_id).maybeSingle()
    videoUrl = (v?.storage_url as string | null) ?? null
  }
  const imageUrl = (ad.cached_image_url as string | null) ?? (ad.image_url as string | null)
  if (!videoUrl && !imageUrl) return { key, ok: false, error: "No hay video ni imagen copiados de este anuncio" }

  const { data: camp } = await admin.from("audit_campaigns").select("account_id").eq("id", ad.campaign_id).single()
  const { data: acc } = await admin.from("audit_accounts").select("name, meta_account_id").eq("id", camp?.account_id).single()
  try {
    await analyzeLibraryAd({
      adArchiveId: key,
      pageId: acc?.meta_account_id ?? null,
      pageName: acc?.name ?? "Cuenta auditada",
      body: ad.body, title: null, caption: null, cta: null,
      linkUrl: ad.landing_url,
      videoUrl: ad.format === "video" ? videoUrl : null,
      imageUrl: ad.format === "video" ? null : imageUrl,
      isActive: true, startDate: null,
    })
    return { key, ok: true }
  } catch (e) {
    return { key, ok: false, error: e instanceof Error ? e.message : "Falló el análisis" }
  }
}

// ── Encolar ───────────────────────────────────────────────────────

// adIds: solo esos anuncios (selección individual); sin lista, todos los
// pendientes de la campaña.
export async function enqueueAuditAnalyses(campaignId: string, profileId: string, adIds?: string[]): Promise<{ queued: number }> {
  const admin = createAdminClient()
  const { data: camp } = await admin.from("audit_campaigns").select("id, account_id").eq("id", campaignId).maybeSingle()
  if (!camp) throw new Error("Campaña no encontrada")
  const { data: ads } = await admin.from("audit_ads")
    .select("id, meta_ad_id, format, meta_video_id, cached_image_url, image_url")
    .eq("campaign_id", campaignId).neq("format", "other").limit(1000)
  const wanted = adIds ? new Set(adIds) : null

  // Una vez por clave (video): los anuncios que comparten video cuentan una vez.
  const byKey = new Map<string, string>()
  for (const a of ads ?? []) {
    if (wanted && !wanted.has(a.id as string)) continue
    if (a.format === "video" && !a.meta_video_id) continue
    if (a.format === "image" && !a.cached_image_url && !a.image_url) continue
    const k = auditAnalysisKey(a)
    if (!byKey.has(k)) byKey.set(k, a.id as string)
  }
  const keys = [...byKey.keys()]
  if (keys.length === 0) return { queued: 0 }

  const done = new Set<string>()
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await admin.from("ad_analyses").select("ad_archive_id, analysis").in("ad_archive_id", keys.slice(i, i + 200))
    for (const r of data ?? []) if ((r.analysis as { partes?: unknown })?.partes) done.add(r.ad_archive_id as string)
  }
  const { data: pending } = await admin.from("audit_analysis_jobs").select("analysis_key").in("status", ["queued", "running"]).in("analysis_key", keys)
  for (const p of pending ?? []) done.add(p.analysis_key as string)

  const rows = keys.filter((k) => !done.has(k)).map((k) => ({
    account_id: camp.account_id, campaign_id: campaignId, ad_id: byKey.get(k), analysis_key: k, created_by: profileId,
  }))
  if (rows.length === 0) return { queued: 0 }
  const { error } = await admin.from("audit_analysis_jobs").insert(rows)
  if (error) throw new Error(/audit_analysis_jobs/.test(error.message) ? "Falta correr la migración 127 en Supabase" : error.message)
  return { queued: rows.length }
}

// ── Procesar una tanda ────────────────────────────────────────────

export async function processAuditQueue(): Promise<{ processed: number; remaining: number }> {
  const admin = createAdminClient()

  // Trabajos colgados (el proceso murió a la mitad): reintentar o marcar error.
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString()
  const { data: stale } = await admin.from("audit_analysis_jobs").select("id, attempts").eq("status", "running").lt("started_at", staleBefore)
  for (const j of stale ?? []) {
    await admin.from("audit_analysis_jobs").update(
      j.attempts >= MAX_ATTEMPTS ? { status: "error", error: "Se interrumpió varias veces", finished_at: new Date().toISOString() } : { status: "queued" },
    ).eq("id", j.id).eq("status", "running")
  }

  // Tomar hasta BATCH trabajos. El update condicionado a status='queued'
  // evita que dos tandas simultáneas tomen el mismo.
  const { data: candidates } = await admin.from("audit_analysis_jobs").select("id, ad_id, created_by, attempts").eq("status", "queued").order("created_at").limit(BATCH * 3)
  const claimed: { id: string; ad_id: string; created_by: string | null }[] = []
  for (const c of candidates ?? []) {
    if (claimed.length >= BATCH) break
    const { data } = await admin.from("audit_analysis_jobs")
      .update({ status: "running", started_at: new Date().toISOString(), attempts: (c.attempts ?? 0) + 1 })
      .eq("id", c.id).eq("status", "queued").select("id, ad_id, created_by").maybeSingle()
    if (data) claimed.push(data as { id: string; ad_id: string; created_by: string | null })
  }

  await Promise.all(claimed.map((job) => runTrusted("cron", async () => {
    // El análisis queda a nombre de quien encoló.
    if (job.created_by) setTrustedProfile(job.created_by)
    const r = await runAuditCreativeAnalysis(job.ad_id).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : "Falló" }))
    await admin.from("audit_analysis_jobs").update({
      status: r.ok ? "done" : "error",
      error: r.ok ? null : (r as { error?: string }).error ?? "Falló",
      finished_at: new Date().toISOString(),
    }).eq("id", job.id)
  })))

  const { count } = await admin.from("audit_analysis_jobs").select("id", { count: "exact", head: true }).eq("status", "queued")
  return { processed: claimed.length, remaining: count ?? 0 }
}

// ── Despertar al trabajador ───────────────────────────────────────
// Llama a /api/audit-worker, que responde de inmediato y procesa después de
// responder (after). Si la llamada no se puede hacer (sin CRON_SECRET, URL
// protegida), procesa una tanda aquí mismo como respaldo.

export async function kickAuditWorker(origin: string): Promise<void> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    try {
      const res = await fetch(`${origin}/api/audit-worker`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) return
      console.error("[audit-worker] kick respondió", res.status)
    } catch (e) {
      console.error("[audit-worker] kick falló", e instanceof Error ? e.message : e)
    }
  }
  await processAuditQueue()
}

// ── Estado para la pantalla ───────────────────────────────────────

export interface AuditJobStatus { queued: number; running: number; done: number; error: number; lastError: string | null; needsKick: boolean; pendingAdIds: string[] }

export async function getAuditJobStatus(campaignId: string): Promise<AuditJobStatus> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await admin.from("audit_analysis_jobs").select("ad_id, status, error, started_at, finished_at").eq("campaign_id", campaignId).gte("created_at", since)
  if (error) return { queued: 0, running: 0, done: 0, error: 0, lastError: /audit_analysis_jobs/.test(error.message) ? "Falta correr la migración 127 en Supabase" : error.message, needsKick: false, pendingAdIds: [] }
  const rows = data ?? []
  const count = (s: string) => rows.filter((r) => r.status === s).length
  const freshRunning = rows.some((r) => r.status === "running" && r.started_at && Date.now() - new Date(r.started_at).getTime() < STALE_MS)
  const lastError = rows.filter((r) => r.status === "error").sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""))[0]?.error ?? null
  return {
    queued: count("queued"), running: count("running"), done: count("done"), error: count("error"), lastError,
    // Hay pendientes pero nadie trabajando: la cadena se cortó.
    needsKick: (count("queued") > 0 || count("running") > 0) && !freshRunning,
    pendingAdIds: rows.filter((r) => r.status === "queued" || r.status === "running").map((r) => r.ad_id as string),
  }
}
