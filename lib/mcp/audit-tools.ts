import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import {
  getAccountCampaignViews, getAuditAccount, getCampaignAudit, getCampaignHypotheses, loadMetricDefs,
  type AuditAdView, type CampaignAuditView,
} from "@/lib/ad-audit/queries"
import {
  FUNNEL_ORDER, biggestDrop, computeMetric, curvePoints, formatMetric, formatMoney, formatSec, metricById,
  type MetricId,
} from "@/lib/ad-audit/metrics"
import { buildFindings, type Format } from "@/lib/ad-audit/findings"
import { PART_LABEL, type PartKey } from "@/lib/ad-audit/parts"

// Auditorías de Ad Lab desde el MCP — SOLO LECTURA (consultar, no auditar:
// la captura la hace la extensión). Permiso: access_ad_lab, el mismo que
// deja entrar a /ad-lab/auditorias. Reutiliza exactamente las lecturas y
// cálculos de las pantallas (lib/ad-audit/*), así que da los mismos números.
// Ver docs/agent-guides/mcp-server.md y docs/agent-guides/auditorias.md.
//
// - auditorias(busqueda?): cuentas auditadas con sus campañas.
// - auditoria_campana(cuenta, campana?): resumen + anuncios por conjunto.
// - auditoria_anuncio(cuenta, anuncio, campana?): embudo, retención, partes.
// - auditoria_que_funciona(cuenta, formato?): ganchos/cuerpos/cierres.
// - auditoria_hipotesis(cuenta, campana?, estado?): hipótesis y seguimiento.
// - metricas_auditoria(): fórmulas vigentes.

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()

async function requireAuditAccess(ctx: ToolCtx) {
  const id = ctx.http?.authInfo?.extra?.profileId
  if (typeof id !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("id, role, permissions").eq("id", id).single()
  if (!data) throw new Error("Perfil no encontrado")
  if (!can(data as never, "access_ad_lab")) throw new Error("No tienes acceso a Ad Lab (Auditorías).")
}

const VERDICT: Record<string, string> = { win: "Ganador", lose: "Perdedor", starved: "Sin oportunidad", nodata: "Sin datos", alone: "Sin con quién comparar" }
const CMP: Record<string, string> = { better: "mejor", worse: "peor", neutral: "en la media", none: "" }

async function findAccount(q: string) {
  const s = q.trim().replace(/^act_/, "")
  // Sin .or() con texto del usuario: por ID si es numérico, si no por nombre.
  const base = db().from("audit_accounts").select("id, name, meta_account_id, currency, kind, last_captured_at")
  const { data, error } = /^\d{5,25}$/.test(s)
    ? await base.eq("meta_account_id", s).limit(10)
    : await base.ilike("name", `%${s.replace(/[%_]/g, "")}%`).order("name").limit(10)
  if (error) throw new Error(/audit_accounts/.test(error.message) ? "Las auditorías no están instaladas (falta la migración 124)." : error.message)
  const rows = data ?? []
  const exact = rows.filter((r) => r.name.toLowerCase() === s.toLowerCase() || r.meta_account_id === s)
  const hits = exact.length ? exact : rows
  if (!hits.length) throw new Error(`No encontré una cuenta auditada que coincida con "${q}". Usa auditorias para ver la lista.`)
  if (hits.length > 1) throw new Error(`"${q}" coincide con varias cuentas: ${hits.map((r) => r.name).join(", ")}. Sé más específico.`)
  return hits[0]
}

async function findCampaign(accountId: string, q?: string) {
  const { data } = await db().from("audit_campaigns").select("id, name").eq("account_id", accountId).order("captured_at", { ascending: false })
  const rows = data ?? []
  if (!rows.length) throw new Error("Esa cuenta no tiene campañas auditadas.")
  if (!q?.trim()) {
    if (rows.length === 1) return rows[0]
    throw new Error(`La cuenta tiene ${rows.length} campañas auditadas: ${rows.map((r) => r.name).join(" | ")}. Indica cuál en "campana".`)
  }
  const s = q.trim().toLowerCase()
  const exact = rows.filter((r) => r.name.toLowerCase() === s)
  const hits = exact.length ? exact : rows.filter((r) => r.name.toLowerCase().includes(s))
  if (!hits.length) throw new Error(`No encontré la campaña "${q}". Campañas: ${rows.map((r) => r.name).join(" | ")}`)
  if (hits.length > 1) throw new Error(`"${q}" coincide con varias campañas: ${hits.map((r) => r.name).join(" | ")}. Sé más específico.`)
  return hits[0]
}

function metricLine(view: CampaignAuditView, ad: AuditAdView, id: MetricId, currency: string): string | null {
  const m = ad.evaluation.metrics[id]
  const def = metricById(id, view.metrics)
  if (m.status === "na") return null
  if (m.status === "not_measured") return `${def.label} no medido`
  if (m.value === null) return null
  if (!m.sampleOk) return `${def.label} ${formatMetric(def, m.value, currency)} (muestra chica)`
  return `${def.label} ${formatMetric(def, m.value, currency)} (mediana ${formatMetric(def, m.median, currency)}, ${CMP[m.cmp] || "—"})`
}

function partsLine(ad: AuditAdView): string {
  if (!ad.parts) return "partes: sin analizar"
  return (["gancho", "cuerpo", "cierre"] as PartKey[]).map((p) => {
    const x = ad.parts![p]
    const t = x.desde !== null && x.hasta !== null ? ` ${formatSec(x.desde)}–${formatSec(x.hasta)}` : ""
    return `${PART_LABEL[p]}: ${x.tipo}${t}`
  }).join(" · ")
}

function campaignHeader(view: CampaignAuditView): string {
  const currency = view.account.currency ?? "MXN"
  const t = view.totals
  const kpi = (id: MetricId) => formatMetric(metricById(id, view.metrics), computeMetric(metricById(id, view.metrics), t, { isVideo: true, missing: view.campaign.missing_events }).value, currency)
  return [
    `CUENTA: ${view.account.name} (act_${view.account.meta_account_id})`,
    `CAMPAÑA: ${view.campaign.name} · ${view.campaign.period_since} a ${view.campaign.period_until} · atribución 7 días después del clic`,
    `Gasto ${formatMoney(t.spend, currency)} · Compras ${t.purchases} · CPA ${kpi("cpa")} · ROAS ${kpi("roas")} · AOV ${kpi("aov")} · Conv. sesión ${kpi("session_cvr")}`,
    view.campaign.missing_events.length ? `Eventos que la cuenta NO manda (métricas "no medido"): ${view.campaign.missing_events.join(", ")}` : "",
  ].filter(Boolean).join("\n")
}

export function registerAuditTools(server: McpServer) {
  server.registerTool(
    "auditorias",
    {
      title: "Auditorías de cuentas publicitarias",
      description:
        "Lista las cuentas publicitarias auditadas en Ad Lab → Auditorías (enviadas desde la extensión del Ads Manager) con sus campañas, períodos y fecha de última captura. Solo lectura. Usa los nombres que devuelve para las demás herramientas de auditoría.",
      inputSchema: z.object({ busqueda: z.string().optional().describe("Parte del nombre de la cuenta") }),
    },
    async ({ busqueda }, ctx: ToolCtx) => {
      await requireAuditAccess(ctx)
      let q = db().from("audit_accounts").select("id, name, meta_account_id, kind, last_captured_at").order("last_captured_at", { ascending: false, nullsFirst: false }).limit(50)
      if (busqueda?.trim()) q = q.ilike("name", `%${busqueda.trim()}%`)
      const { data: accounts, error } = await q
      if (error) throw new Error(/audit_accounts/.test(error.message) ? "Las auditorías no están instaladas (falta la migración 124)." : error.message)
      if (!accounts?.length) return text(busqueda ? `No hay cuentas auditadas que coincidan con "${busqueda}".` : "Todavía no hay auditorías.")
      const { data: camps } = await db().from("audit_campaigns").select("account_id, name, period_since, period_until").in("account_id", accounts.map((a) => a.id))
      return text(accounts.map((a) => {
        const cs = (camps ?? []).filter((c) => c.account_id === a.id)
        return [
          `• ${a.name} (act_${a.meta_account_id}) · ${a.kind === "client" ? "cliente" : "prospecto"} · última captura ${a.last_captured_at?.slice(0, 10) ?? "—"}`,
          ...cs.map((c) => `   - ${c.name} (${c.period_since} a ${c.period_until})`),
        ].join("\n")
      }).join("\n"))
    },
  )

  server.registerTool(
    "auditoria_campana",
    {
      title: "Auditoría de una campaña",
      description:
        "Resumen de una campaña auditada: totales (gasto, compras, CPA, ROAS, AOV, conversión) y, por conjunto, cada anuncio con su veredicto (Ganador/Perdedor/Sin oportunidad/Sin datos), % del gasto, métricas de creativo y de tienda contra la mediana de SU conjunto, dónde se rompe el embudo y sus partes (gancho/cuerpo/cierre) si están analizadas. Solo lectura. Las comparaciones válidas son dentro del mismo conjunto.",
      inputSchema: z.object({
        cuenta: z.string().describe("Nombre (o ID act_) de la cuenta auditada"),
        campana: z.string().optional().describe("Nombre de la campaña; opcional si la cuenta tiene una sola"),
      }),
    },
    async ({ cuenta, campana }, ctx: ToolCtx) => {
      await requireAuditAccess(ctx)
      const acc = await findAccount(cuenta)
      const camp = await findCampaign(acc.id, campana)
      const view = await getCampaignAudit(camp.id)
      if (!view) throw new Error("No se pudo leer la campaña.")
      const currency = view.account.currency ?? "MXN"
      const out = [campaignHeader(view)]
      for (const s of view.adsets) {
        out.push(`\nCONJUNTO: ${s.name} (${s.ads.length} anuncios)`)
        for (const ad of s.ads) {
          const e = ad.evaluation
          const metrics = (["hook", "hold", "ctr", "cpa", "visit_cart", "cart_checkout", "checkout_purchase", "session_cvr", "aov", "roas"] as MetricId[])
            .map((id) => metricLine(view, ad, id, currency)).filter(Boolean).join(" · ")
          out.push([
            `- ${ad.name} [${ad.format === "video" ? "video" : ad.format === "image" ? "imagen" : "otro"}] · ${VERDICT[e.verdict]} · ${(e.spendShare * 100).toFixed(1)} % del gasto · ${formatMoney(ad.counters.spend, currency)} · ${ad.counters.purchases} compras`,
            `  ${metrics || "sin métricas con muestra suficiente"}`,
            `  Se rompe en: ${e.breakAt ? metricById(e.breakAt, view.metrics).label : "no se rompe"}${e.verdict === "starved" || e.verdict === "nodata" ? ` · ${e.verdictReason}` : ""}`,
            `  ${partsLine(ad)}`,
          ].join("\n"))
        }
      }
      return text(out.join("\n"))
    },
  )

  server.registerTool(
    "auditoria_anuncio",
    {
      title: "Auditoría de un anuncio",
      description:
        "Detalle de un anuncio auditado: embudo completo (impresiones → 3 s → 50 % → clics → visitas → carrito → checkout → compra) con cada tasa contra la mediana de su conjunto, la etapa donde se rompe, la mayor caída de la curva de retención, sus partes (gancho/cuerpo/cierre con segundos), el ganador del conjunto para comparar y la página de destino. Solo lectura.",
      inputSchema: z.object({
        cuenta: z.string().describe("Nombre (o ID act_) de la cuenta auditada"),
        anuncio: z.string().describe("Nombre (o parte del nombre) del anuncio"),
        campana: z.string().optional().describe("Campaña, si el nombre del anuncio se repite entre campañas"),
      }),
    },
    async ({ cuenta, anuncio, campana }, ctx: ToolCtx) => {
      await requireAuditAccess(ctx)
      const acc = await findAccount(cuenta)
      const views = campana?.trim() ? [await getCampaignAudit((await findCampaign(acc.id, campana)).id)] : await getAccountCampaignViews(acc.id)
      const s = anuncio.trim().toLowerCase()
      const all = views.flatMap((v) => (v ? v.adsets.flatMap((set) => set.ads.map((ad) => ({ v, set, ad }))) : []))
      const exact = all.filter((x) => x.ad.name.toLowerCase() === s || x.ad.meta_ad_id === anuncio.trim())
      const hits = exact.length ? exact : all.filter((x) => x.ad.name.toLowerCase().includes(s))
      if (!hits.length) throw new Error(`No encontré el anuncio "${anuncio}" en ${acc.name}.`)
      if (hits.length > 1) throw new Error(`"${anuncio}" coincide con varios anuncios: ${hits.slice(0, 10).map((x) => `${x.ad.name} (${x.v!.campaign.name})`).join(" | ")}. Sé más específico o indica la campaña.`)
      const { v, set, ad } = hits[0]
      const view = v!
      const currency = view.account.currency ?? "MXN"
      const e = ad.evaluation
      const steps: [string, keyof typeof ad.counters, MetricId | null][] = [
        ["Impresiones", "impressions", null], ["Reproducciones de 3 s", "video_3s", "hook"], ["Reproducciones al 50 %", "video_p50", "hold"],
        ["Clics de salida", "outbound_clicks", "ctr"], ["Visitas a la página", "landing_page_views", "click_visit"],
        ["Agregados al carrito", "add_to_cart", "visit_cart"], ["Pagos iniciados", "initiate_checkout", "cart_checkout"], ["Compras", "purchases", "checkout_purchase"],
      ]
      const funnel = steps
        .filter(([, , id]) => !(ad.format !== "video" && (id === "hook" || id === "hold")))
        .map(([label, key, id]) => `  ${label}: ${Math.round(ad.counters[key]).toLocaleString("es-MX")}${id ? ` → ${metricLine(view, ad, id, currency) ?? "—"}${e.breakAt === id ? "  ← SE ROMPE AQUÍ" : ""}` : ""}`)
      const drop = biggestDrop(curvePoints(ad.curve, ad.durationSec))
      const winner = set.ads.filter((a) => a.id !== ad.id && a.evaluation.verdict === "win" && a.evaluation.metrics.cpa.value !== null)
        .sort((a, b) => (a.evaluation.metrics.cpa.value ?? 0) - (b.evaluation.metrics.cpa.value ?? 0))[0]
      return text([
        `ANUNCIO: ${ad.name} · ${VERDICT[e.verdict]} (${e.verdictReason})`,
        `Cuenta ${view.account.name} · campaña ${view.campaign.name} · conjunto ${set.name} · ${view.campaign.period_since} a ${view.campaign.period_until}`,
        `${(e.spendShare * 100).toFixed(1)} % del gasto del conjunto · ${formatMoney(ad.counters.spend, currency)}`,
        `EMBUDO (contra la mediana del conjunto):`,
        ...funnel,
        ["aov", "cpa", "roas", "session_cvr"].map((id) => metricLine(view, ad, id as MetricId, currency)).filter(Boolean).join(" · "),
        ad.format === "video"
          ? `RETENCIÓN: ${drop ? `mayor caída ${formatSec(drop.from)}–${formatSec(drop.to)}: se va el ${Math.round(drop.lostShare * 100)} % de quienes seguían` : "Meta no dio la curva"}${ad.durationSec ? ` · duración ${formatSec(ad.durationSec)}` : ""}`
          : "",
        partsLine(ad) + (ad.conceptName ? ` · concepto: ${ad.conceptName}` : ""),
        winner ? `Ganador del conjunto para comparar: ${winner.name} (CPA ${formatMetric(metricById("cpa", view.metrics), winner.evaluation.metrics.cpa.value, currency)})` : "",
        ad.landingUrl ? `Destino: ${ad.landingUrl}` : "",
      ].filter(Boolean).join("\n"))
    },
  )

  server.registerTool(
    "auditoria_que_funciona",
    {
      title: "Qué funciona en una cuenta auditada",
      description:
        "Ganchos, cuerpos y cierres por tipo en toda la cuenta auditada: para cada tipo, su métrica (gancho → hook rate o CTR en imagen; cuerpo → hold rate o visita→carrito en imagen; cierre → conversión de sesión y AOV), el veredicto (Funciona / En la media / No funciona / Pocos datos) con su diferencia promedio contra la mediana de cada conjunto, el respaldo (conteos y anuncios) y ejemplos. Incluye la combinación gancho+cuerpo+cierre que más vende. Solo cuenta creativos ya analizados por partes. Solo lectura.",
      inputSchema: z.object({
        cuenta: z.string().describe("Nombre (o ID act_) de la cuenta auditada"),
        formato: z.enum(["video", "imagen"]).optional().describe("Por defecto, ambos"),
      }),
    },
    async ({ cuenta, formato }, ctx: ToolCtx) => {
      await requireAuditAccess(ctx)
      const acc = await findAccount(cuenta)
      const views = await getAccountCampaignViews(acc.id)
      const f = buildFindings(views, (v) => `/ad-lab/auditorias/${acc.id}/c/${v.campaign.id}`)
      const fmts: Format[] = formato === "video" ? ["video"] : formato === "imagen" ? ["image"] : ["video", "image"]
      const V = { ok: "Funciona", mid: "En la media", bad: "No funciona", few: "Pocos datos" }
      const out = [`CUENTA: ${acc.name} · ${f.coverage.analyzed} de ${f.coverage.total} creativos analizados por partes (solo esos cuentan).`]
      for (const fmt of fmts) {
        const rows = f.rows[fmt]
        if (!(["gancho", "cuerpo", "cierre"] as PartKey[]).some((p) => rows[p].length)) continue
        out.push(`\n=== ${fmt === "video" ? "VIDEO" : "IMAGEN"} ===`)
        const r = f.recipe[fmt]
        if (r) out.push(`Combinación que más vende: ${r.parts.gancho} → ${r.parts.cuerpo} → ${r.parts.cierre} · ROAS ${r.roas.toFixed(1)} (cuenta ${r.accountRoas.toFixed(1)}) · ${r.ads} anuncio(s) · ${Math.round(r.purchaseShare * 100)} % de las compras · ej. ${r.clips.gancho.name}`)
        for (const p of ["gancho", "cuerpo", "cierre"] as PartKey[]) {
          if (!rows[p].length) continue
          out.push(`${PART_LABEL[p].toUpperCase()}S:`)
          for (const row of rows[p]) {
            out.push(`- ${row.type}: ${row.mainLabel} ${row.main}${row.second ? ` · ${row.second}` : ""} · ${V[row.verdict]}${row.index !== null && row.verdict !== "few" ? ` (${row.index >= 0 ? "+" : ""}${Math.round(row.index * 100)} % vs mediana de su conjunto)` : ""} · ${row.support} · ej. ${row.clips.slice(0, 3).map((c) => `${c.name} ${c.value}`).join(", ")}`)
          }
        }
      }
      if (out.length === 1) out.push("Aún no hay creativos analizados por partes en esta cuenta (se analizan desde la campaña en el dashboard).")
      return text(out.join("\n"))
    },
  )

  server.registerTool(
    "auditoria_hipotesis",
    {
      title: "Hipótesis de una auditoría",
      description:
        "Hipótesis generadas para las campañas de una cuenta auditada, con parte (gancho/cuerpo/cierre/tienda), confianza, evidencia, cómo probarla, estado (abierta/confirmada/descartada) con su nota, y la evidencia HOY (veredicto actual de los anuncios citados). Solo lectura: no genera ni cambia hipótesis.",
      inputSchema: z.object({
        cuenta: z.string().describe("Nombre (o ID act_) de la cuenta auditada"),
        campana: z.string().optional().describe("Solo esta campaña"),
        estado: z.enum(["abierta", "confirmada", "descartada"]).optional(),
      }),
    },
    async ({ cuenta, campana, estado }, ctx: ToolCtx) => {
      await requireAuditAccess(ctx)
      const acc = await findAccount(cuenta)
      const camps = campana?.trim() ? [await findCampaign(acc.id, campana)] : ((await getAuditAccount(acc.id))?.campaigns ?? [])
      const statusMap = { abierta: "open", confirmada: "confirmed", descartada: "discarded" } as const
      const label = { open: "abierta", confirmed: "confirmada", discarded: "descartada" }
      const out: string[] = []
      for (const c of camps) {
        const { rows, error } = await getCampaignHypotheses(c.id)
        if (error) throw new Error(error)
        const filtered = estado ? rows.filter((h) => h.status === statusMap[estado]) : rows
        if (!filtered.length) continue
        const view = await getCampaignAudit(c.id)
        const ads = new Map((view?.adsets ?? []).flatMap((s) => s.ads.map((a) => [a.id, a] as const)))
        out.push(`\nCAMPAÑA: ${c.name}`)
        for (const h of filtered) {
          const today = h.ad_ids.map((id) => ads.get(id)).filter(Boolean).map((a) => `${a!.name}: ${VERDICT[a!.evaluation.verdict]}`).join(", ")
          out.push([
            `- [${label[h.status]} · ${h.part} · confianza ${h.confidence}] ${h.claim}`,
            `  Evidencia: ${h.evidence}`,
            h.test ? `  Para probarla: ${h.test}` : "",
            h.status_note ? `  Nota: ${h.status_note}` : "",
            today ? `  Evidencia hoy: ${today}${view && h.period_until !== view.campaign.period_until ? " (datos más nuevos que la hipótesis)" : ""}` : "",
            `  Datos del ${h.period_since} al ${h.period_until}`,
          ].filter(Boolean).join("\n"))
        }
      }
      return text(out.length ? `CUENTA: ${acc.name}${out.join("\n")}` : `No hay hipótesis${estado ? ` ${estado}s` : ""} para ${acc.name}.`)
    },
  )

  server.registerTool(
    "metricas_auditoria",
    {
      title: "Fórmulas de las métricas de auditoría",
      description: "Las fórmulas vigentes de las auditorías (numerador ÷ denominador y muestra mínima de cada métrica), con los cambios de la agencia aplicados, y en qué orden se busca dónde se rompe el embudo. Solo lectura.",
      inputSchema: z.object({}),
    },
    async (_args, ctx: ToolCtx) => {
      await requireAuditAccess(ctx)
      const defs = await loadMetricDefs()
      return text([
        "Atribución de conversiones: 7 días después del clic. Comparación: contra la mediana de los anuncios del mismo conjunto (±5 % = en la media).",
        ...defs.map((d) => `- ${d.label} = ${d.formula} · mínimo ${d.min.label} · vista ${d.view === "creative" ? "Creativo" : "Tienda"}${d.videoOnly ? " · solo video" : ""}`),
        `Dónde se rompe = primera etapa con ≥15 % peor que la mediana, en este orden: ${FUNNEL_ORDER.map((id) => metricById(id, defs).label).join(" → ")}.`,
      ].join("\n"))
    },
  )
}
