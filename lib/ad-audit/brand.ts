// Marca inferida de una cuenta auditada: Brand Brain + Brand Lines.
// SIN "use server": no verifica sesión; lo llaman las actions de
// lib/actions/ad-audits.ts (con permiso) y el MCP (solo lectura).
// Ver docs/agent-guides/auditorias.md.
//
// Fuentes (todas de la propia auditoría, nada inventado):
//   1. El sitio web principal = el dominio de destino con más gasto, leído
//      con el mismo importador de Brand Brains (draftFromWebsite).
//   2. El copy de los anuncios y a qué página mandan (cada página/colección
//      suele ser una línea).
//   3. Lo que el análisis de concepto ya dedujo de cada creativo (qué vende,
//      audiencia, oferta, dolor, persona).
// Viven en audit_brand_brains / audit_brand_lines (migración 126) y solo
// llegan a /brand-brains si alguien los "lleva" (promoteAuditBrand).

import Anthropic from "@anthropic-ai/sdk"
import { createAdminClient } from "@/lib/supabase/admin"
import { draftFromWebsite } from "@/lib/brand-brains/import-core"
import { insertBrandLine } from "@/lib/brand-brains/lines-core"
import { parseAiJson } from "@/lib/utils/ai-json"
import { getAccountCampaignViews } from "@/lib/ad-audit/queries"
import type { BrandBrain, BrandBrainColor } from "@/lib/types"

export interface AuditBrandBrain {
  account_id: string
  name: string
  industry: string | null
  language: string | null
  description: string | null
  usps: string[]
  key_benefits: string[]
  pain_points: string[]
  target_audience: string | null
  key_features: string[]
  ctas: string[]
  tone_of_voice: string | null
  brand_colors: BrandBrainColor[]
  additional_context: string | null
  sources: { website?: string | null; websiteError?: string | null; ads: number; analyses: number; landings: number }
  promoted_brand_brain_id: string | null
  promoted_at: string | null
  updated_at: string
}

export interface AuditBrandLine {
  id: string
  name: string
  description: string | null
  usps: string[]
  pain_points: string[]
  keywords: string[]
  color: string
  position: number
  landing_urls: string[]
  promoted_brand_line_id: string | null
  ads: { id: string; name: string; campaignId: string; spend: number; purchases: number }[]
}

const LINE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#14b8a6", "#f97316"]
const arr = (v: unknown, max = 6) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim().slice(0, 200)).slice(0, max) : [])
const str = (v: unknown, max = 600) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

function normalizeLanding(url: string | null): { host: string; path: string } | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return { host: u.hostname.replace(/^www\./, ""), path: `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "") || "/"}` }
  } catch {
    return null
  }
}

// ── Lectura ───────────────────────────────────────────────────────

export async function getAuditBrand(accountId: string): Promise<{ brain: AuditBrandBrain | null; lines: AuditBrandLine[]; error: string | null }> {
  const admin = createAdminClient()
  const { data: brain, error } = await admin.from("audit_brand_brains").select("*").eq("account_id", accountId).maybeSingle()
  if (error) return { brain: null, lines: [], error: /audit_brand/.test(error.message) ? "Falta correr la migración 126 en Supabase" : error.message }
  const { data: lines } = await admin.from("audit_brand_lines").select("*").eq("account_id", accountId).order("position")
  const lineIds = (lines ?? []).map((l) => l.id as string)
  const { data: ads } = lineIds.length
    ? await admin.from("audit_ads").select("id, name, campaign_id, audit_brand_line_id").in("audit_brand_line_id", lineIds)
    : { data: [] }
  // Gasto y compras por anuncio (para ordenar los anuncios de cada línea).
  const adIds = (ads ?? []).map((a) => a.id as string)
  const totals = new Map<string, { spend: number; purchases: number }>()
  for (let i = 0; i < adIds.length; i += 200) {
    // Supabase devuelve máx. 1000 filas por consulta: paginar.
    for (let from = 0; ; from += 1000) {
      const { data: rows } = await admin.from("audit_ad_daily").select("ad_id, spend, purchases")
        .in("ad_id", adIds.slice(i, i + 200)).order("ad_id").order("date").range(from, from + 999)
      for (const r of rows ?? []) {
        const t = totals.get(r.ad_id as string) ?? { spend: 0, purchases: 0 }
        t.spend += Number(r.spend) || 0
        t.purchases += Number(r.purchases) || 0
        totals.set(r.ad_id as string, t)
      }
      if (!rows || rows.length < 1000) break
    }
  }
  return {
    brain: (brain as AuditBrandBrain | null) ?? null,
    lines: (lines ?? []).map((l) => ({
      ...(l as Omit<AuditBrandLine, "ads">),
      ads: (ads ?? []).filter((a) => a.audit_brand_line_id === l.id)
        .map((a) => ({ id: a.id as string, name: a.name as string, campaignId: a.campaign_id as string, ...(totals.get(a.id as string) ?? { spend: 0, purchases: 0 }) }))
        .sort((x, y) => y.spend - x.spend),
    })),
    error: null,
  }
}

// ── Inferir ───────────────────────────────────────────────────────

export async function inferAuditBrandCore(accountId: string, profileId: string): Promise<{ lines: number }> {
  const admin = createAdminClient()
  const { data: account } = await admin.from("audit_accounts").select("id, name").eq("id", accountId).maybeSingle()
  if (!account) throw new Error("Cuenta no encontrada")

  const views = await getAccountCampaignViews(accountId)
  const ads = views.flatMap((v) => v.adsets.flatMap((s) => s.ads))
  if (ads.length === 0) throw new Error("La cuenta no tiene anuncios capturados")
  const totalSpend = ads.reduce((t, a) => t + a.counters.spend, 0) || 1

  // Análisis de concepto ya hechos (marca/concepto inferidos por creativo).
  const keys = [...new Set(ads.map((a) => a.analysisKey))]
  const analyses = new Map<string, { marca?: Record<string, string>; concepto?: Record<string, string> }>()
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await admin.from("ad_analyses").select("ad_archive_id, analysis").in("ad_archive_id", keys.slice(i, i + 200))
    for (const r of data ?? []) analyses.set(r.ad_archive_id as string, r.analysis as { marca?: Record<string, string>; concepto?: Record<string, string> })
  }

  // Páginas de destino agrupadas, con su peso en gasto.
  const landings = new Map<string, { url: string; spend: number; ads: number }>()
  const hostSpend = new Map<string, number>()
  for (const a of ads) {
    const n = normalizeLanding(a.landingUrl)
    if (!n) continue
    const g = landings.get(n.path) ?? { url: n.path, spend: 0, ads: 0 }
    g.spend += a.counters.spend; g.ads += 1
    landings.set(n.path, g)
    hostSpend.set(n.host, (hostSpend.get(n.host) ?? 0) + a.counters.spend)
  }
  const mainHost = [...hostSpend.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null

  let website: Partial<BrandBrain> | null = null
  let websiteError: string | null = null
  if (mainHost) {
    try { website = await draftFromWebsite(`https://${mainHost}`) } catch (e) { websiteError = e instanceof Error ? e.message : "No se pudo leer el sitio" }
  }

  const labels = new Map<string, string>()
  const top = [...ads].sort((x, y) => y.counters.spend - x.counters.spend).slice(0, 50)
  const evidence = top.map((a, i) => {
    const label = `A${i + 1}`
    labels.set(label, a.id)
    const an = analyses.get(a.analysisKey)
    return {
      id: label,
      nombre: a.name,
      formato: a.format,
      gasto: `${((a.counters.spend / totalSpend) * 100).toFixed(1)} %`,
      compras: a.counters.purchases,
      destino: normalizeLanding(a.landingUrl)?.path ?? null,
      copy: a.body ? a.body.slice(0, 400) : null,
      inferido_del_creativo: an ? {
        que_vende: an.marca?.que_vende, audiencia: an.marca?.audiencia, oferta: an.marca?.oferta, posicionamiento: an.marca?.posicionamiento,
        persona: an.concepto?.target_persona, dolor: an.concepto?.pain_point,
      } : null,
    }
  })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3500,
    system: `Eres estratega de marca. Construyes el Brand Brain de una marca y sus Brand Lines (líneas de producto/servicio) a partir de SUS PROPIOS ANUNCIOS en Meta y su sitio web. Usa SOLO la evidencia: no inventes productos, precios ni datos que no aparezcan.
Brand Lines: cada producto, colección o servicio distinto que los anuncios venden (pistas: la página de destino y el copy). Si todos los anuncios venden lo mismo, UNA línea. Máximo 8. Asigna cada anuncio a UNA línea (o a ninguna si no se sabe). Nombres de línea cortos (2-5 palabras).
El gasto indica qué es lo más importante para la marca.
Escribe en el idioma de la marca. Listas: 3-5 elementos cortos.
Responde SOLO JSON:
{"brand_brain":{"name":"","industry":"","language":"es","description":"1-2 oraciones","usps":[],"key_benefits":[],"pain_points":[],"target_audience":"","key_features":[],"ctas":[],"tone_of_voice":"5-10 palabras","additional_context":"qué se aprendió de los anuncios que no está en el sitio, máx. 40 palabras"},
"brand_lines":[{"name":"","description":"1-2 oraciones","usps":[],"pain_points":[],"keywords":[],"urls":["dominio/ruta"],"anuncios":["A1"]}]}`,
    messages: [{
      role: "user",
      content: `CUENTA PUBLICITARIA: ${account.name}
SITIO PRINCIPAL: ${mainHost ?? "—"}
LO QUE DICE EL SITIO (importador de Brand Brains): ${website ? JSON.stringify(website) : websiteError ? `(no se pudo leer: ${websiteError})` : "(sin sitio)"}
PÁGINAS DE DESTINO (con % del gasto): ${JSON.stringify([...landings.values()].sort((x, y) => y.spend - x.spend).slice(0, 25).map((l) => ({ url: l.url, gasto: `${((l.spend / totalSpend) * 100).toFixed(1)} %`, anuncios: l.ads })))}
ANUNCIOS (los ${evidence.length} con más gasto): ${JSON.stringify(evidence)}`,
    }],
  }, { timeout: 150_000, maxRetries: 1 })

  const parsed = parseAiJson<{ brand_brain?: Record<string, unknown>; brand_lines?: Record<string, unknown>[] }>(msg, "inferAuditBrand")
  const b = parsed.brand_brain ?? {}
  const sources = { website: mainHost, websiteError, ads: ads.length, analyses: [...analyses.values()].length, landings: landings.size }

  const { error } = await admin.from("audit_brand_brains").upsert({
    account_id: accountId,
    name: str(b.name, 120) ?? website?.name ?? account.name,
    industry: str(b.industry, 120) ?? website?.industry ?? null,
    language: str(b.language, 8) ?? "es",
    description: str(b.description),
    usps: arr(b.usps), key_benefits: arr(b.key_benefits), pain_points: arr(b.pain_points),
    target_audience: str(b.target_audience),
    key_features: arr(b.key_features), ctas: arr(b.ctas),
    tone_of_voice: str(b.tone_of_voice, 200),
    brand_colors: (website?.brand_colors ?? []).slice(0, 4),
    additional_context: str(b.additional_context, 800),
    sources,
    created_by: profileId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "account_id" })
  if (error) throw new Error(/audit_brand/.test(error.message) ? "Falta correr la migración 126 en Supabase" : error.message)

  // Las líneas se rehacen completas (y la asignación de anuncios con ellas).
  const accountAdIds = ads.map((a) => a.id)
  for (let i = 0; i < accountAdIds.length; i += 200) {
    await admin.from("audit_ads").update({ audit_brand_line_id: null }).in("id", accountAdIds.slice(i, i + 200))
  }
  await admin.from("audit_brand_lines").delete().eq("account_id", accountId)
  const lines = (parsed.brand_lines ?? []).slice(0, 8).filter((l) => str(l.name, 120))
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const { data: row, error: lineErr } = await admin.from("audit_brand_lines").insert({
      account_id: accountId,
      name: str(l.name, 120),
      description: str(l.description),
      usps: arr(l.usps), pain_points: arr(l.pain_points), keywords: arr(l.keywords, 8),
      color: LINE_COLORS[i % LINE_COLORS.length],
      position: i,
      landing_urls: arr(l.urls, 10),
    }).select("id").single()
    if (lineErr) throw new Error(lineErr.message)
    const adIds = arr(l.anuncios, 50).map((x) => labels.get(x)).filter(Boolean) as string[]
    if (adIds.length) await admin.from("audit_ads").update({ audit_brand_line_id: row.id }).in("id", adIds)
  }
  return { lines: lines.length }
}

// ── Llevar al dashboard (/brand-brains) ───────────────────────────

export async function promoteAuditBrandCore(accountId: string, profileId: string): Promise<{ brandBrainId: string; created: boolean }> {
  const admin = createAdminClient()
  const { brain, lines } = await getAuditBrand(accountId)
  if (!brain) throw new Error("Primero infiere la marca de esta cuenta")

  if (brain.promoted_brand_brain_id) {
    const { data: exists } = await admin.from("brand_brains").select("id").eq("id", brain.promoted_brand_brain_id).maybeSingle()
    if (exists) return { brandBrainId: exists.id as string, created: false }
  }

  const initials = brain.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || null
  const { data: created, error } = await admin.from("brand_brains").insert({
    name: brain.name,
    initials,
    industry: brain.industry,
    language: brain.language ?? "es",
    brand_colors: brain.brand_colors ?? [],
    description: brain.description,
    usps: brain.usps, key_benefits: brain.key_benefits, pain_points: brain.pain_points,
    target_audience: brain.target_audience,
    key_features: brain.key_features, ctas: brain.ctas,
    tone_of_voice: brain.tone_of_voice,
    additional_context: [brain.additional_context, "Inferido de una auditoría de su cuenta publicitaria en Ad Lab."].filter(Boolean).join("\n\n"),
    created_by: profileId,
  }).select("id").single()
  if (error) throw new Error(error.message)

  for (const l of lines) {
    const line = await insertBrandLine(admin, created.id as string, {
      name: l.name, description: l.description, usps: l.usps, pain_points: l.pain_points, keywords: l.keywords, color: l.color,
    })
    await admin.from("audit_brand_lines").update({ promoted_brand_line_id: line.id }).eq("id", l.id)
  }
  await admin.from("audit_brand_brains").update({ promoted_brand_brain_id: created.id, promoted_at: new Date().toISOString() }).eq("account_id", accountId)
  return { brandBrainId: created.id as string, created: true }
}
