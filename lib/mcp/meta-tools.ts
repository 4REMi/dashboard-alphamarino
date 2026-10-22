import { resolveProject } from "@/lib/mcp/resolve-project"
import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Herramientas MCP para operar Meta Ads de un cliente desde Claude:
// leer el estado (en vivo de la Meta API) y pausar/activar, cambiar
// presupuesto, renombrar y duplicar.
//
// Reglas (ver docs/agent-guides/mcp-server.md):
// - Solo admin/subadmin.
// - Toda escritura es en DOS pasos: sin `confirmar: true` solo describe lo
//   que haría (con valores actuales → nuevos). Con `confirmar: true` ejecuta.
// - Cada objeto se verifica contra la cuenta de Meta del proyecto: nunca se
//   toca nada de otra cuenta aunque el id venga mal.
// - Presupuesto: tope de ±50% por instrucción salvo `permitir_cambio_grande`.
// - Todo cambio ejecutado queda como nota en la bitácora del proyecto.

const META = "https://graph.facebook.com/v21.0"
export interface ToolCtx { http?: { authInfo?: AuthInfo } }
export const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()

export function token() {
  const t = process.env.META_SYSTEM_USER_TOKEN
  if (!t) throw new Error("META_SYSTEM_USER_TOKEN no está configurado en el servidor")
  return t
}

export async function requireEditor(ctx: ToolCtx): Promise<string> {
  const profileId = ctx.http?.authInfo?.extra?.profileId
  if (typeof profileId !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("role").eq("id", profileId).single()
  if (data?.role !== "admin" && data?.role !== "subadmin") throw new Error("Solo admin o subadmin pueden operar Meta")
  return profileId
}

interface Client { projectId: string; name: string; account: string; currency: string; since: string; until: string }

type Periodo = { periodo?: "ciclo_activo" | "ciclo_anterior"; desde?: string; hasta?: string }

export async function client(name: string, range: Periodo = {}): Promise<Client & { label: string }> {
  const p = await resolveProject(name, { onlyActive: true })
  const [{ data: integ }, { data: cycle }] = await Promise.all([
    db().from("project_integrations").select("account_id, currency").eq("project_id", p.id).eq("platform", "meta").maybeSingle(),
    db().from("paid_media_cycles").select("start_date, end_date").eq("project_id", p.id).eq("is_active", true).maybeSingle(),
  ])
  if (!integ?.account_id) throw new Error(`${p.name} no tiene cuenta de Meta conectada.`)
  const today = new Date().toISOString().slice(0, 10)
  let since = cycle?.start_date ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
  let until = cycle?.end_date && cycle.end_date < today ? cycle.end_date : today
  let label = cycle ? "ciclo activo" : "últimos 30 días"
  if (range.desde || range.hasta) {
    since = range.desde ?? since; until = range.hasta && range.hasta < today ? range.hasta : today; label = "rango pedido"
  } else if (range.periodo === "ciclo_anterior") {
    const { data: prev } = await db().from("paid_media_cycles").select("start_date, end_date").eq("project_id", p.id).eq("is_active", false)
      .lt("start_date", cycle?.start_date ?? today).order("start_date", { ascending: false }).limit(1).maybeSingle()
    if (!prev) throw new Error(`${p.name} no tiene un ciclo anterior registrado; usa desde/hasta.`)
    since = prev.start_date; until = prev.end_date < today ? prev.end_date : today; label = "ciclo anterior"
  }
  return { projectId: p.id, name: p.name, account: String(integ.account_id).replace(/^act_/, ""), currency: (integ.currency as string) || "USD", since, until, label }
}

export async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const u = new URL(`${META}/${path}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  u.searchParams.set("access_token", token())
  const json = await (await fetch(u, { cache: "no-store" })).json()
  if (json.error) throw new Error(`Meta: ${json.error.message}`)
  return json as T
}
async function all<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = []
  let page = await get<{ data: T[]; paging?: { next?: string } }>(path, { limit: "200", ...params })
  out.push(...page.data)
  while (page.paging?.next && out.length < 2000) {
    page = await (await fetch(page.paging.next, { cache: "no-store" })).json()
    if (!page.data) break
    out.push(...page.data)
  }
  return out
}
export async function post(id: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${META}/${id}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...body, access_token: token() }) })
  const json = await res.json()
  if (json.error) throw new Error(`Meta: ${json.error.error_user_msg || json.error.message}`)
  return json
}

type Obj = { id: string; name: string; status: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string; account_id: string; kind: "campaña" | "conjunto" | "anuncio" }

// Lee el objeto y verifica que sea de la cuenta del cliente.
export async function own(c: Client, id: string): Promise<Obj> {
  // El tipo se detecta probando un campo que SOLO tiene cada tipo (Meta no
  // regresa metadata.type cuando se piden campos explícitos, y pedir un campo
  // que el objeto no tiene hace fallar la llamada).
  const base = "id,name,status,effective_status,account_id"
  const probes: [Obj["kind"], string][] = [["campaña", "objective,daily_budget,lifetime_budget"], ["conjunto", "optimization_goal,daily_budget,lifetime_budget"], ["anuncio", "creative"]]
  let lastErr: unknown = null
  for (const [kind, extra] of probes) {
    try {
      const o = await get<Record<string, string>>(id, { fields: `${base},${extra}` })
      if (String(o.account_id) !== c.account) throw new Error(`${id} no pertenece a la cuenta de Meta de ${c.name}.`)
      return { ...(o as unknown as Obj), kind }
    } catch (e) {
      if (e instanceof Error && e.message.includes("no pertenece")) throw e
      lastErr = e
    }
  }
  throw new Error(`No pude leer ${id} en Meta: ${lastErr instanceof Error ? lastErr.message : lastErr}`)
}

const money = (minor: string | number | undefined, cur: string) => minor == null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: cur }).format(Number(minor) / 100)

export async function log(c: Client, profileId: string, body: string) {
  // Va a Actividad de IA (solo admin), no a la bitácora del proyecto.
  await db().from("ai_activity").insert({ project_id: c.projectId, actor: "claude_mcp", requested_by: profileId, platform: "meta", summary: body })
}

export const confirmHint = "\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true."

export function registerMetaTools(server: McpServer) {
  server.registerTool(
    "meta_estado_cliente",
    {
      title: "Meta: estado del cliente",
      description: "Lee EN VIVO la cuenta de Meta de un proyecto: campañas → conjuntos → anuncios con id, estado, presupuesto (y dónde vive: campaña=CBO o conjunto=ABO), gasto, resultados, costo por resultado, CPM, CTR y clics al sitio, más el embudo (vistas de página → ver contenido → carrito → pago → compras) por campaña y conjunto; con detalle: true también por anuncio, con frecuencia. Periodo: ciclo activo (por defecto), ciclo_anterior, o desde/hasta; en periodos pasados lista solo lo que gastó en ese rango aunque hoy esté pausado. Úsalo antes de cualquier cambio para obtener los ids. Solo admin/subadmin.",
      inputSchema: z.object({
        proyecto: z.string(),
        incluir_inactivos: z.boolean().default(false).describe("Incluir lo pausado/archivado"),
        periodo: z.enum(["ciclo_activo", "ciclo_anterior"]).optional().describe("Por defecto el ciclo activo"),
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Rango libre YYYY-MM-DD (tiene prioridad sobre periodo)"),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        detalle: z.boolean().default(false).describe("Embudo, CPM y frecuencia también por anuncio"),
      }),
    },
    async ({ proyecto, incluir_inactivos: inc, periodo, desde, hasta, detalle }, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const c = await client(proyecto, { periodo, desde, hasta })
      // Periodo pasado: lo que corrió entonces suele estar pausado hoy → se
      // listan todos los objetos y se dejan solo los que gastaron en el rango.
      const past = c.label !== "ciclo activo" && c.label !== "últimos 30 días"
      const incluir_inactivos = inc || past
      const act = `act_${c.account}`
      const filter: Record<string, string> = incluir_inactivos ? {} : { effective_status: JSON.stringify(["ACTIVE", "IN_PROCESS", "WITH_ISSUES", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]) }
      const [campaigns, adsets, ads, insights] = await Promise.all([
        all<Obj & { objective?: string }>(`${act}/campaigns`, { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget", ...(incluir_inactivos ? {} : { effective_status: JSON.stringify(["ACTIVE", "IN_PROCESS", "WITH_ISSUES"]) }) }),
        all<Obj & { campaign_id: string; optimization_goal?: string }>(`${act}/adsets`, { fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal", ...filter }),
        all<Obj & { adset_id: string }>(`${act}/ads`, { fields: "id,name,status,effective_status,adset_id", ...filter }),
        all<{ ad_id: string; spend: string; impressions: string; clicks: string; reach?: string; inline_link_clicks?: string; outbound_clicks?: { action_type: string; value: string }[]; actions?: { action_type: string; value: string }[] }>(`${act}/insights`, { level: "ad", fields: "ad_id,spend,impressions,reach,clicks,inline_link_clicks,outbound_clicks,actions", time_range: JSON.stringify({ since: c.since, until: c.until }), use_unified_attribution_setting: "true" }),
      ])
      const RESULT = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_conversation_started_7d", "omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "complete_registration", "schedule"]
      // Embudo: primer tipo de acción que Meta reporte para cada paso (omni_ incluye web + app).
      const FUNNEL: [string, string[]][] = [
        ["lpv", ["landing_page_view", "omni_landing_page_view"]],
        ["vc", ["omni_view_content", "offsite_conversion.fb_pixel_view_content", "view_content"]],
        ["atc", ["omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "add_to_cart"]],
        ["ic", ["omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "initiate_checkout"]],
        ["pur", ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"]],
      ]
      const act1 = (r: { actions?: { action_type: string; value: string }[] }, types: string[]) => types.map((t) => Number(r.actions?.find((a) => a.action_type === t)?.value ?? 0)).find((v) => v > 0) ?? 0
      type Row = { spend: number; results: number; impressions: number; reach: number; clicks: number; link: number; outbound: number; lpv: number; vc: number; atc: number; ic: number; pur: number }
      const ins = new Map<string, Row>(insights.map((r) => {
        const row: Row = {
          spend: Number(r.spend ?? 0), results: act1(r, RESULT), impressions: Number(r.impressions ?? 0), reach: Number(r.reach ?? 0),
          clicks: Number(r.clicks ?? 0), link: Number(r.inline_link_clicks ?? 0),
          outbound: (r.outbound_clicks ?? []).reduce((s, a) => s + Number(a.value ?? 0), 0),
          lpv: 0, vc: 0, atc: 0, ic: 0, pur: 0,
        }
        for (const [k, types] of FUNNEL) row[k as "lpv"] = act1(r, types)
        return [r.ad_id, row]
      }))
      const zero = (): Row => ({ spend: 0, results: 0, impressions: 0, reach: 0, clicks: 0, link: 0, outbound: 0, lpv: 0, vc: 0, atc: 0, ic: 0, pur: 0 })
      const total = (ids: string[]) => ids.reduce((s, id) => { const x = ins.get(id); if (x) for (const k of Object.keys(s) as (keyof Row)[]) s[k] += x[k]; return s }, zero())
      const n = (v: number) => v.toLocaleString("es-MX", { maximumFractionDigits: 0 })
      // Métricas derivadas + embudo en una línea; solo pasos con datos.
      const funnel = (x: Row, freq: boolean) => {
        const parts = [
          x.impressions ? `CPM ${m((x.spend / x.impressions) * 1000)}` : null,
          x.impressions ? `CTR enlace ${((x.link / x.impressions) * 100).toFixed(2)}%` : null,
          x.outbound ? `${n(x.outbound)} clics salientes` : x.link ? `${n(x.link)} clics al enlace` : null,
          freq && x.reach ? `frecuencia ${(x.impressions / x.reach).toFixed(2)}` : null,
        ].filter(Boolean)
        const steps = ([["vistas pág.", x.lpv], ["ver contenido", x.vc], ["carrito", x.atc], ["pago", x.ic], ["compras", x.pur]] as [string, number][]).filter(([, v]) => v > 0)
        return [parts.join(" · "), steps.length ? `embudo: ${steps.map(([l, v]) => `${n(v)} ${l}`).join(" → ")}` : ""].filter(Boolean).join(" | ")
      }
      const m = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: c.currency }).format(n)
      const sum = (ids: string[]) => total(ids)
      const perf = (s: { spend: number; results: number }) => `gasto ${m(s.spend)} · ${s.results} res.${s.results ? ` · ${m(s.spend / s.results)} c/u` : ""}`
      const budget = (o: Obj) => o.daily_budget ? `${money(o.daily_budget, c.currency)}/día` : o.lifetime_budget ? `${money(o.lifetime_budget, c.currency)} total` : null

      const lines: string[] = [`${c.name} · cuenta act_${c.account} · ${c.currency} · ${c.label}: ${c.since} → ${c.until}`]
      const campIds = new Set(campaigns.map((x) => x.id))
      const spent = (id: string) => (ins.get(id)?.spend ?? 0) > 0
      for (const camp of campaigns) {
        const sets = adsets.filter((s) => s.campaign_id === camp.id && (!past || ads.some((a) => a.adset_id === s.id && spent(a.id))))
        const campAds = ads.filter((a) => sets.some((s) => s.id === a.adset_id) && (!past || spent(a.id)))
        if (past && !campAds.length) continue
        const ct = sum(campAds.map((a) => a.id))
        lines.push(`\n■ CAMPAÑA ${camp.name} [${camp.id}] · ${camp.effective_status}${budget(camp) ? ` · presupuesto ${budget(camp)} (CBO)` : ""} · ${camp.objective ?? ""}\n  ${perf(ct)}${ct.impressions ? `\n  ${funnel(ct, false)}` : ""}`)
        for (const set of sets) {
          const setAds = ads.filter((a) => a.adset_id === set.id && (!past || spent(a.id)))
          const st = sum(setAds.map((a) => a.id))
          lines.push(`  ▸ CONJUNTO ${set.name} [${set.id}] · ${set.effective_status}${budget(set) ? ` · presupuesto ${budget(set)} (ABO)` : ""} · ${perf(st)}${st.impressions ? `\n    ${funnel(st, false)}` : ""}`)
          for (const ad of setAds) {
            const x = ins.get(ad.id)
            lines.push(`     · ANUNCIO ${ad.name} [${ad.id}] · ${ad.effective_status}${x ? ` · ${m(x.spend)} · ${x.results} res.${x.results ? ` · ${m(x.spend / x.results)} c/u` : ""} · CTR ${x.impressions ? ((x.clicks / x.impressions) * 100).toFixed(2) : "0.00"}%${detalle && x.impressions ? `\n       ${funnel(x, true)}` : ""}` : " · sin gasto"}`)
          }
        }
      }
      const orphanSets = adsets.filter((s) => !campIds.has(s.campaign_id))
      if (orphanSets.length) lines.push(`\n(${orphanSets.length} conjunto(s) activos en campañas pausadas; usa incluir_inactivos: true para verlos completos)`)
      if (!campaigns.length) lines.push("\nNo hay campañas activas." + (incluir_inactivos ? "" : " Usa incluir_inactivos: true para ver las pausadas."))
      // Otros canales (campañas manuales) + total combinado del periodo.
      const { manualSummary, manualBlock, fmtMoney } = await import("@/lib/mcp/manual-tools")
      const manual = manualBlock(await manualSummary(c.projectId, c.since, c.until), c.currency)
      if (manual.lines.length) {
        const metaSpend = [...ins.values()].reduce((s, x) => s + x.spend, 0)
        lines.push(...manual.lines, `Total combinado (Meta + manuales): ${fmtMoney(metaSpend + manual.spend, c.currency)} — detalle con campanas_manuales.`)
      }
      return text(lines.join("\n"))
    },
  )

  server.registerTool(
    "meta_cambiar_estado",
    {
      title: "Meta: pausar o activar",
      description: "Pausa o activa campañas, conjuntos o anuncios (ids de meta_estado_cliente). Sin confirmar: true solo muestra qué cambiaría.",
      inputSchema: z.object({
        proyecto: z.string(),
        ids: z.array(z.string()).min(1).max(50),
        accion: z.enum(["pausar", "activar"]),
        motivo: z.string().optional().describe("Por qué; queda en la bitácora"),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ proyecto, ids, accion, motivo, confirmar }, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      const c = await client(proyecto)
      const objs = await Promise.all(ids.map((id) => own(c, id)))
      const target = accion === "pausar" ? "PAUSED" : "ACTIVE"
      const list = objs.map((o) => `- ${o.kind} "${o.name}" [${o.id}]: ${o.status} → ${target}`).join("\n")
      if (!confirmar) return text(`Se ${accion === "pausar" ? "pausaría" : "activaría"} en ${c.name}:\n${list}${confirmHint}`)
      const done: string[] = [], failed: string[] = []
      for (const o of objs) {
        try { await post(o.id, { status: target }); done.push(`${o.kind} "${o.name}"`) } catch (e) { failed.push(`${o.name}: ${e instanceof Error ? e.message : e}`) }
      }
      if (done.length) await log(c, profileId, `${accion === "pausar" ? "Pausado" : "Activado"}: ${done.join(", ")}.${motivo ? ` Motivo: ${motivo}` : ""}`)
      return text(`${done.length ? `✅ ${accion === "pausar" ? "Pausado" : "Activado"} en Meta: ${done.join(", ")}` : ""}${failed.length ? `\n❌ Fallaron: ${failed.join("; ")}` : ""}`)
    },
  )

  server.registerTool(
    "meta_presupuesto",
    {
      title: "Meta: cambiar presupuesto",
      description: "Cambia el presupuesto de una campaña (CBO) o conjunto (ABO) — usa el objeto donde vive el presupuesto según meta_estado_cliente. Monto en la moneda de la cuenta; diario o total según lo que ya tenga. Tope ±50% por instrucción salvo permitir_cambio_grande. Sin confirmar: true solo muestra el cambio.",
      inputSchema: z.object({
        proyecto: z.string(),
        id: z.string(),
        nuevo_monto: z.number().positive().optional().describe("Monto absoluto nuevo"),
        cambio_porcentaje: z.number().optional().describe("Ej. 20 = +20%, -30 = −30%. Alternativa a nuevo_monto"),
        motivo: z.string().optional(),
        permitir_cambio_grande: z.boolean().default(false),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ proyecto, id, nuevo_monto, cambio_porcentaje, motivo, permitir_cambio_grande, confirmar }, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      const c = await client(proyecto)
      const o = await own(c, id)
      if (o.kind === "anuncio") throw new Error("Los anuncios no tienen presupuesto; cámbialo en su conjunto (ABO) o campaña (CBO).")
      const field = o.daily_budget ? "daily_budget" : o.lifetime_budget ? "lifetime_budget" : null
      if (!field) throw new Error(`${o.kind} "${o.name}" no tiene presupuesto propio (vive en ${o.kind === "conjunto" ? "la campaña (CBO)" : "sus conjuntos (ABO)"}).`)
      const current = Number(o[field]) / 100
      if (nuevo_monto == null && cambio_porcentaje == null) throw new Error("Indica nuevo_monto o cambio_porcentaje.")
      const next = Math.round((nuevo_monto ?? current * (1 + cambio_porcentaje! / 100)) * 100) / 100
      const pct = ((next - current) / current) * 100
      if (Math.abs(pct) > 50 && !permitir_cambio_grande) throw new Error(`El cambio es de ${pct.toFixed(0)}% (de ${current} a ${next} ${c.currency}). El tope es ±50%; si es intencional, usa permitir_cambio_grande: true.`)
      const kindLabel = field === "daily_budget" ? "diario" : "total"
      const desc = `${o.kind} "${o.name}" [${o.id}]: presupuesto ${kindLabel} ${money(current * 100, c.currency)} → ${money(next * 100, c.currency)} (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`
      if (!confirmar) return text(`Cambiaría en ${c.name}:\n- ${desc}${confirmHint}`)
      await post(o.id, { [field]: String(Math.round(next * 100)) })
      await log(c, profileId, `Presupuesto: ${desc}.${motivo ? ` Motivo: ${motivo}` : ""}`)
      return text(`✅ Hecho en Meta: ${desc}`)
    },
  )

  server.registerTool(
    "meta_renombrar",
    {
      title: "Meta: renombrar",
      description: "Renombra campañas, conjuntos o anuncios (p. ej. para aplicar la nomenclatura CLIENTE | LÍNEA | PRUEBA | Concepto | v2). Sin confirmar: true solo muestra el cambio.",
      inputSchema: z.object({
        proyecto: z.string(),
        cambios: z.array(z.object({ id: z.string(), nombre: z.string().min(1) })).min(1).max(50),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ proyecto, cambios, confirmar }, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      const c = await client(proyecto)
      const objs = await Promise.all(cambios.map(async (x) => ({ o: await own(c, x.id), nombre: x.nombre })))
      const list = objs.map(({ o, nombre }) => `- ${o.kind} "${o.name}" → "${nombre}"`).join("\n")
      if (!confirmar) return text(`Renombraría en ${c.name}:\n${list}${confirmHint}`)
      const failed: string[] = []
      for (const { o, nombre } of objs) { try { await post(o.id, { name: nombre }) } catch (e) { failed.push(`${o.name}: ${e instanceof Error ? e.message : e}`) } }
      await log(c, profileId, `Renombrado:\n${list}`)
      return text(`✅ Renombrado en Meta (${objs.length - failed.length}/${objs.length}).${failed.length ? `\n❌ ${failed.join("; ")}` : ""}`)
    },
  )

  server.registerTool(
    "meta_duplicar",
    {
      title: "Meta: duplicar",
      description: "Duplica una campaña completa (con conjuntos y anuncios), un conjunto (con sus anuncios) o un anuncio (con su creativo). Sin destino_id se copia en el mismo lugar; con destino_id un anuncio va a otro conjunto y un conjunto a otra campaña (p. ej. graduar de prueba a escala). La copia queda PAUSADA. Sin confirmar: true solo muestra qué haría.",
      inputSchema: z.object({
        proyecto: z.string(),
        id: z.string().describe("Campaña, conjunto o anuncio a copiar"),
        destino_id: z.string().optional().describe("Conjunto destino (anuncio) o campaña destino (conjunto). No aplica a campañas"),
        nuevo_nombre: z.string().optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ proyecto, id, destino_id, nuevo_nombre, confirmar }, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      const c = await client(proyecto)
      const o = await own(c, id)
      const dest = destino_id ? await own(c, destino_id) : null
      if (o.kind === "campaña" && dest) throw new Error("Una campaña se duplica en la misma cuenta; no lleva destino_id.")
      if (o.kind === "anuncio" && dest && dest.kind !== "conjunto") throw new Error("Un anuncio se copia a un CONJUNTO destino.")
      if (o.kind === "conjunto" && dest && dest.kind !== "campaña") throw new Error("Un conjunto se copia a una CAMPAÑA destino.")
      const desc = `${o.kind} "${o.name}"${dest ? ` → ${dest.kind} "${dest.name}"` : " (en el mismo lugar)"}${o.kind !== "anuncio" ? " con todo su contenido" : ""}${nuevo_nombre ? ` como "${nuevo_nombre}"` : ""} · la copia queda pausada`
      if (!confirmar) return text(`Duplicaría en ${c.name}:\n- ${desc}${confirmHint}`)
      const body: Record<string, string> = { status_option: "PAUSED" }
      if (o.kind !== "anuncio") body.deep_copy = "true"
      if (o.kind === "anuncio" && dest) body.adset_id = dest.id
      if (o.kind === "conjunto" && dest) body.campaign_id = dest.id
      if (!nuevo_nombre) body.rename_options = JSON.stringify({ rename_suffix: " - Copia" })
      const r = await post(`${o.id}/copies`, body)
      const newId = (r.copied_campaign_id ?? r.copied_adset_id ?? r.copied_ad_id ?? r.ad_object_ids?.toString() ?? "") as string
      if (nuevo_nombre && newId) await post(newId, { name: nuevo_nombre }).catch(() => null)
      await log(c, profileId, `Duplicado: ${desc}${newId ? ` · nuevo id ${newId}` : ""}.`)
      return text(`✅ Copia creada en Meta (pausada)${newId ? ` [${newId}]` : ""}. Revísala y actívala con meta_cambiar_estado.`)
    },
  )

  server.registerTool(
    "meta_contenido_anuncio",
    {
      title: "Meta: contenido de anuncios",
      description: "Qué dice un anuncio (activo o pasado): texto, título, CTA y destino (URL con sus parámetros, formulario o mensajes); si es VIDEO, la transcripción de lo que se habla; si es IMAGEN, regresa la imagen para leer su texto y describirla. Máx. 5 anuncios por llamada (ids de meta_estado_cliente).",
      inputSchema: z.object({ proyecto: z.string(), ad_ids: z.array(z.string()).min(1).max(5) }),
    },
    async ({ proyecto, ad_ids }, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const c = await client(proyecto)
      const out: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = []
      for (const id of ad_ids) {
        const o = await own(c, id)
        if (o.kind !== "anuncio") { out.push({ type: "text", text: `${id}: no es un anuncio.` }); continue }
        const ad = await get<{ creative?: Record<string, any> }>(id, { fields: "creative{body,title,call_to_action_type,image_url,thumbnail_url,video_id,object_story_spec,asset_feed_spec,object_url,link_url,url_tags}" })
        const cr = ad.creative ?? {}
        const story = cr.object_story_spec ?? {}, link = story.link_data ?? {}, vd = story.video_data ?? {}, feed = cr.asset_feed_spec ?? {}
        const body = cr.body ?? link.message ?? vd.message ?? feed.bodies?.[0]?.text ?? null
        const title = cr.title ?? link.name ?? vd.title ?? feed.titles?.[0]?.text ?? null
        const videoId = cr.video_id || vd.video_id || feed.videos?.[0]?.video_id || null
        const lines = [`■ ${o.name} [${id}] · ${o.effective_status ?? o.status}`, body ? `Texto: ${body}` : "Texto: —", title ? `Título: ${title}` : "", cr.call_to_action_type ? `CTA: ${cr.call_to_action_type}` : "",
          // Destino: puede vivir en varios lugares según cómo se armó el anuncio.
          (() => {
            const urls = [link.link, link.call_to_action?.value?.link, vd.call_to_action?.value?.link, cr.link_url, cr.object_url, ...(feed.link_urls ?? []).map((u: any) => u.website_url)].filter((u): u is string => typeof u === "string" && /^https?:/.test(u))
            const form = link.call_to_action?.value?.lead_gen_form_id ?? vd.call_to_action?.value?.lead_gen_form_id
            const app = link.call_to_action?.value?.app_destination ?? vd.call_to_action?.value?.app_destination
            const dest = [...new Set(urls)].join(" · ") || (form ? `formulario instantáneo ${form}` : app ? `mensajes (${app})` : "—")
            return `Destino: ${dest}${cr.url_tags ? ` · parámetros: ${cr.url_tags}` : ""}`
          })()].filter(Boolean)
        if (videoId) {
          // Fuente: la copia guardada por el dashboard (estable) o la de Meta.
          const { data: dim } = await createAdminClient().from("meta_ads").select("video_url").eq("project_id", c.projectId).eq("ad_id", id).maybeSingle()
          let src = (dim?.video_url as string | null) ?? null
          if (!src) src = (await get<{ source?: string }>(videoId, { fields: "source" }).catch(() => ({ source: undefined }))).source ?? null
          if (!src) lines.push("Video: Meta no comparte el archivo (cuenta de socio); no se pudo transcribir.")
          else {
            try {
              const { aaiPost, aaiGet } = await import("@/lib/actions/ad-clone")
              const t = await aaiPost("/transcript", { audio_url: src, language_detection: true })
              let r: { status: string; text?: string } = { status: "queued" }
              for (let i = 0; i < 30 && r.status !== "completed" && r.status !== "error"; i++) { await new Promise((x) => setTimeout(x, 3000)); r = await aaiGet(`/transcript/${t.id}`) }
              lines.push(r.status === "completed" ? `Transcripción: ${r.text?.trim() || "(sin voz)"}` : "Transcripción: tardó demasiado; vuelve a pedirla en un minuto.")
            } catch (e) { lines.push(`Transcripción falló: ${e instanceof Error ? e.message : e}`) }
          }
          out.push({ type: "text", text: lines.join("\n") })
        } else {
          const img = cr.image_url ?? link.picture ?? feed.images?.[0]?.url ?? cr.thumbnail_url ?? null
          out.push({ type: "text", text: lines.join("\n") + (img ? "\nImagen adjunta abajo (lee el texto que trae y descríbela)." : "\nSin imagen disponible.") })
          if (img) {
            try {
              const res = await fetch(img)
              const buf = Buffer.from(await res.arrayBuffer())
              if (buf.length < 4_500_000) out.push({ type: "image", data: buf.toString("base64"), mimeType: res.headers.get("content-type")?.split(";")[0] || "image/jpeg" })
            } catch { /* sin imagen */ }
          }
        }
      }
      return { content: out }
    },
  )
}

// ── Ubicaciones (placements) ────────────────────────────────────────────
// Nombres simples → publisher_platforms + *_positions de Meta. Sin lista =
// ubicaciones automáticas (Advantage+ placements).
export const PLACEMENTS = {
  facebook_feed: ["facebook", "facebook_positions", "feed"],
  facebook_stories: ["facebook", "facebook_positions", "story"],
  facebook_reels: ["facebook", "facebook_positions", "facebook_reels"],
  facebook_video: ["facebook", "facebook_positions", "video_feeds"],
  facebook_marketplace: ["facebook", "facebook_positions", "marketplace"],
  facebook_search: ["facebook", "facebook_positions", "search"],
  instagram_feed: ["instagram", "instagram_positions", "stream"],
  instagram_stories: ["instagram", "instagram_positions", "story"],
  instagram_reels: ["instagram", "instagram_positions", "reels"],
  instagram_explore: ["instagram", "instagram_positions", "explore"],
  instagram_profile: ["instagram", "instagram_positions", "profile_feed"],
  messenger: ["messenger", "messenger_positions", "messenger_home"],
  audience_network: ["audience_network", "audience_network_positions", "classic"],
} as const
export type Placement = keyof typeof PLACEMENTS
export const PLACEMENT_KEYS = Object.keys(PLACEMENTS) as [Placement, ...Placement[]]
const PLACEMENT_FIELDS = ["publisher_platforms", "facebook_positions", "instagram_positions", "messenger_positions", "audience_network_positions", "device_platforms"]

// Aplica ubicaciones a un targeting (muta y regresa). "automaticas" las quita.
export function applyPlacements(t: Record<string, unknown>, list: (Placement | "automaticas")[]): Record<string, unknown> {
  for (const f of PLACEMENT_FIELDS) delete t[f]
  if (list.includes("automaticas")) return t
  const platforms = new Set<string>()
  for (const p of list as Placement[]) {
    const [platform, field, pos] = PLACEMENTS[p]
    platforms.add(platform)
    t[field] = [...new Set([...((t[field] as string[]) ?? []), pos])]
  }
  t.publisher_platforms = [...platforms]
  return t
}

export function describePlacements(t: Record<string, any>): string {
  if (!t.publisher_platforms?.length) return "ubicaciones automáticas"
  const names: string[] = []
  for (const [k, [platform, field, pos]] of Object.entries(PLACEMENTS)) {
    if (t.publisher_platforms.includes(platform) && (!t[field] || t[field].includes(pos))) names.push(k.replace("_", " "))
  }
  return `ubicaciones: ${names.join(", ")}`
}

// Al copiar un creativo, Meta regresa la miniatura del video como image_url
// Y image_hash a la vez, pero al crear solo acepta UNA de las dos. Se deja el
// hash (es el asset ya subido a la cuenta) y se quita la URL.
export function cleanStoryForCopy(spec: Record<string, any>): Record<string, any> {
  for (const k of ["video_data", "link_data"]) {
    const d = spec[k]
    if (d && d.image_hash && d.image_url) delete d.image_url
  }
  return spec
}
