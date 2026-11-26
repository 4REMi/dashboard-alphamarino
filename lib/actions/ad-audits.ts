"use server"

// Acciones de Ad Lab → Auditorías. Ver docs/agent-guides/auditorias.md.

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireRole, requireSessionOrTrusted } from "@/lib/auth/guards"
import { requireAuditAccess } from "@/lib/ad-audit/access"
import { auditAnalysisKey } from "@/lib/ad-audit/parts"
import { analyzeLibraryAd } from "@/lib/actions/ad-analysis"
import { getCampaignAudit } from "@/lib/ad-audit/queries"
import { COUNTER_KEYS, METRICS, biggestDrop, curvePoints, formatMetric, formatSec, metricById, type MetricId } from "@/lib/ad-audit/metrics"
import { parseAiJson } from "@/lib/utils/ai-json"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Borra la auditoría de una cuenta completa: métricas, anuncios y los
// videos/imágenes copiados a Storage. Son datos de prospectos: borrar debe
// borrar de verdad.
export async function deleteAuditAccount(accountId: string): Promise<void> {
  await requireSessionOrTrusted()
  await requireAuditAccess()
  if (!UUID_RE.test(accountId)) throw new Error("Cuenta inválida")

  const admin = createAdminClient()
  const { data: videos } = await admin.from("audit_videos").select("storage_path").eq("account_id", accountId).not("storage_path", "is", null)
  const { data: camps } = await admin.from("audit_campaigns").select("id").eq("account_id", accountId)
  const campIds = (camps ?? []).map((c) => c.id)
  const { data: ads } = campIds.length
    ? await admin.from("audit_ads").select("meta_ad_id, cached_image_url").in("campaign_id", campIds).not("cached_image_url", "is", null)
    : { data: [] }

  const paths = [
    ...(videos ?? []).map((v) => v.storage_path as string),
    ...(ads ?? []).map((a) => `audits/images/${a.meta_ad_id}.jpg`),
  ]
  for (let i = 0; i < paths.length; i += 100) {
    await admin.storage.from("ad-lab").remove(paths.slice(i, i + 100))
  }

  const { error } = await admin.from("audit_accounts").delete().eq("id", accountId)
  if (error) throw new Error(error.message)
  revalidatePath("/ad-lab/auditorias")
}

export async function setAuditAccountKind(accountId: string, kind: "prospect" | "client"): Promise<void> {
  await requireSessionOrTrusted()
  await requireAuditAccess()
  if (!UUID_RE.test(accountId) || (kind !== "prospect" && kind !== "client")) throw new Error("Datos inválidos")
  const { error } = await createAdminClient().from("audit_accounts").update({ kind }).eq("id", accountId)
  if (error) throw new Error(error.message)
  revalidatePath("/ad-lab/auditorias")
}

// ── Análisis por partes de un creativo de auditoría ───────────────
// Reutiliza el análisis de concepto de Ad Lab (analyzeLibraryAd), que ahora
// devuelve gancho/cuerpo/cierre con tiempos. Uno por VIDEO (no por anuncio):
// si el mismo video corre en varios anuncios, se analiza una vez. Se guarda
// en ad_analyses con la clave audit:v:<video> (o audit:i:<anuncio> en
// imágenes), así que también se abre desde Ad Lab → Análisis.
export async function analyzeAuditCreative(adId: string, force = false): Promise<{ key: string; ok: boolean; error?: string }> {
  await requireSessionOrTrusted()
  await requireAuditAccess()
  if (!UUID_RE.test(adId)) throw new Error("Anuncio inválido")

  const admin = createAdminClient()
  const { data: ad } = await admin.from("audit_ads")
    .select("id, meta_ad_id, name, format, meta_video_id, image_url, cached_image_url, landing_url, body, campaign_id")
    .eq("id", adId).maybeSingle()
  if (!ad) throw new Error("Anuncio no encontrado")
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

// ── Hipótesis por campaña (fase 2) y su seguimiento (fase 3) ──────
// Una sola llamada a Claude por campaña con una tabla compacta: métricas
// contra la mediana del conjunto, veredicto, dónde se rompe, partes
// (gancho/cuerpo/cierre) y la mayor caída de retención. Solo puede usar
// esos números. Al regenerar se reemplazan las abiertas que nadie tocó; las
// confirmadas/descartadas (o con nota) se conservan como historial.
export async function generateCampaignHypotheses(campaignId: string): Promise<{ created: number }> {
  await requireSessionOrTrusted()
  const user = await requireAuditAccess()
  if (!UUID_RE.test(campaignId)) throw new Error("Campaña inválida")
  const view = await getCampaignAudit(campaignId)
  if (!view) throw new Error("Campaña no encontrada")
  const currency = view.account.currency ?? "MXN"

  const labels = new Map<string, string>() // "A1" → ad uuid
  let n = 0
  const sets = view.adsets.filter((s) => s.ads.length >= 2).map((s) => ({
    conjunto_id: s.id,
    conjunto: s.name,
    anuncios: s.ads.map((ad) => {
      const label = `A${++n}`
      labels.set(label, ad.id)
      const m = Object.fromEntries(Object.entries(ad.evaluation.metrics)
        .filter(([, v]) => v.sampleOk)
        .map(([id, v]) => {
          const def = metricById(id as MetricId, view.metrics)
          return [def.label, `${formatMetric(def, v.value, currency)} (mediana ${formatMetric(def, v.median, currency)}; ${v.cmp === "better" ? "mejor" : v.cmp === "worse" ? "peor" : "en la media"}; ${Math.round(v.num)}/${Math.round(v.den)})`]
        }))
      const drop = biggestDrop(curvePoints(ad.curve, ad.durationSec))
      return {
        id: label,
        nombre: ad.name,
        formato: ad.format,
        veredicto: ad.evaluation.verdict,
        porcentaje_gasto: `${(ad.evaluation.spendShare * 100).toFixed(1)} %`,
        se_rompe_en: ad.evaluation.breakAt ? metricById(ad.evaluation.breakAt, view.metrics).label : null,
        metricas: m,
        partes: ad.parts ? { gancho: ad.parts.gancho.tipo, cuerpo: ad.parts.cuerpo.tipo, cierre: ad.parts.cierre.tipo } : "sin analizar",
        mayor_caida_retencion: drop ? `${formatSec(drop.from)}–${formatSec(drop.to)}: se va el ${Math.round(drop.lostShare * 100)} % de quienes seguían` : null,
      }
    }),
  }))
  if (sets.length === 0) throw new Error("Hace falta al menos un conjunto con 2 o más anuncios para comparar")

  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    system: `Eres estratega creativo senior de paid media auditando una cuenta de e-commerce en Meta. Formulas HIPÓTESIS sobre por qué unos creativos ganan y otros pierden, enfocadas en el creativo (gancho, cuerpo, cierre) y, si los datos lo muestran, en la tienda.
REGLAS:
- Compara SOLO anuncios del mismo conjunto (misma audiencia y fechas).
- Usa ÚNICAMENTE los números de la tabla, citados tal cual. No inventes datos, porcentajes ni causas que no se puedan sostener con ellos.
- Las métricas listadas ya tienen muestra suficiente; si una no aparece, no la uses.
- Confianza: "alta" solo si 3+ anuncios apuntan a lo mismo con diferencias claras; "media" con 2 anuncios o diferencias moderadas; "baja" si es una señal con poca muestra.
- Incluye perdedores: qué los rompe, no solo por qué ganan los ganadores.
- "como_probarla": un creativo o prueba concreta que la confirme o descarte.
- Máximo 2 hipótesis por conjunto y 8 en total. Español, corto: se lee en una interfaz.
Responde SOLO JSON:
{"hipotesis":[{"conjunto_id":"","parte":"gancho|cuerpo|cierre|tienda|general","afirmacion":"máx. 22 palabras","evidencia":"máx. 35 palabras, con los números","anuncios":["A1","A3"],"confianza":"alta|media|baja","como_probarla":"máx. 25 palabras"}]}`,
    messages: [{ role: "user", content: `CUENTA: ${view.account.name}\nCAMPAÑA: ${view.campaign.name} (${view.campaign.period_since} a ${view.campaign.period_until}, atribución 7 días después del clic)\n\n${JSON.stringify(sets)}` }],
  }, { timeout: 120_000, maxRetries: 1 })

  const parsed = parseAiJson<{ hipotesis?: { conjunto_id?: string; parte?: string; afirmacion?: string; evidencia?: string; anuncios?: string[]; confianza?: string; como_probarla?: string }[] }>(msg, "generateCampaignHypotheses")
  const validSets = new Set(view.adsets.map((s) => s.id))
  const PARTS = ["gancho", "cuerpo", "cierre", "tienda", "general"]
  const rows = (parsed.hipotesis ?? []).slice(0, 8)
    .filter((h) => h.afirmacion && h.evidencia)
    .map((h) => ({
      campaign_id: campaignId,
      adset_id: h.conjunto_id && validSets.has(h.conjunto_id) && h.conjunto_id !== "" ? h.conjunto_id : null,
      part: PARTS.includes(h.parte ?? "") ? h.parte : "general",
      claim: String(h.afirmacion).slice(0, 400),
      evidence: String(h.evidencia).slice(0, 600),
      test: h.como_probarla ? String(h.como_probarla).slice(0, 400) : null,
      confidence: ["alta", "media", "baja"].includes(h.confianza ?? "") ? h.confianza : "media",
      ad_ids: (h.anuncios ?? []).map((l) => labels.get(l)).filter(Boolean) as string[],
      period_since: view.campaign.period_since,
      period_until: view.campaign.period_until,
      created_by: user.id,
    }))

  const admin = createAdminClient()
  await admin.from("audit_hypotheses").delete().eq("campaign_id", campaignId).eq("status", "open").is("status_note", null)
  if (rows.length) {
    const { error } = await admin.from("audit_hypotheses").insert(rows)
    if (error) throw new Error(/audit_hypotheses/.test(error.message) ? "Falta correr la migración 125 en Supabase" : error.message)
  }
  revalidatePath("/ad-lab/auditorias")
  return { created: rows.length }
}

export async function setHypothesisStatus(id: string, status: "open" | "confirmed" | "discarded", note: string | null): Promise<void> {
  await requireSessionOrTrusted()
  const user = await requireAuditAccess()
  if (!UUID_RE.test(id) || !["open", "confirmed", "discarded"].includes(status)) throw new Error("Datos inválidos")
  const { error } = await createAdminClient().from("audit_hypotheses").update({
    status,
    status_note: note?.trim() ? note.trim().slice(0, 600) : null,
    status_changed_at: new Date().toISOString(),
    status_changed_by: user.id,
  }).eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/ad-lab/auditorias")
}

// ── Métricas de auditoría editables ───────────────────────────────
// Cambiar una fórmula recalcula TODAS las auditorías (se guardan conteos
// crudos). Solo admin/subadmin, igual que en la pantalla.
export async function saveMetricOverride(input: { metricId: string; num: string; den: string; minKey: string; minValue: number }): Promise<void> {
  const userId = await requireRole(["admin", "subadmin"])
  const def = METRICS.find((m) => m.id === input.metricId)
  const valid = (k: string) => (COUNTER_KEYS as string[]).includes(k)
  if (!def || !valid(input.num) || !valid(input.den) || !valid(input.minKey) || input.num === input.den) throw new Error("Fórmula inválida")
  const minValue = Math.max(0, Math.min(1_000_000, Number(input.minValue) || 0))
  const { error } = await createAdminClient().from("audit_metric_overrides").upsert({
    metric_id: def.id, num: input.num, den: input.den, min_key: input.minKey, min_value: minValue,
    updated_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: "metric_id" })
  if (error) throw new Error(/audit_metric_overrides/.test(error.message) ? "Falta correr la migración 125 en Supabase" : error.message)
  revalidatePath("/ad-lab/auditorias")
}

export async function resetMetricOverride(metricId: string): Promise<void> {
  await requireRole(["admin", "subadmin"])
  if (!METRICS.some((m) => m.id === metricId)) throw new Error("Métrica inválida")
  await createAdminClient().from("audit_metric_overrides").delete().eq("metric_id", metricId)
  revalidatePath("/ad-lab/auditorias")
}
