import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getExchangeRate } from "@/lib/actions/finances"
import { can } from "@/lib/permissions"
import { renewDomainCore, addOneYear } from "@/lib/finance/domains"

// Dominios y renovaciones desde el MCP. Dominios: permiso view_domains (como
// /finances/domains). Suscripciones anuales (recurring_expenses): permiso
// view_global_finances. Todo lo que escribe va en dos pasos (confirmar).

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
const mxn = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MXN`)
const MAINT: Record<string, string> = { client: "mantenimiento al cliente", own_project: "proyecto propio", n_a: "sin mantenimiento" }
const daysUntil = (d: string) => Math.round((Date.parse(d + "T00:00:00") - Date.parse(today() + "T00:00:00")) / 86_400_000)
const when = (d: string | null) => {
  if (!d) return "sin fecha de renovación"
  const n = daysUntil(d)
  return n < 0 ? `VENCIÓ hace ${-n} d (${d})` : n === 0 ? `vence HOY (${d})` : `vence en ${n} d (${d})`
}

async function me(ctx: ToolCtx) {
  const id = ctx.http?.authInfo?.extra?.profileId
  if (typeof id !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("id, role, permissions").eq("id", id).single()
  if (!data) throw new Error("Perfil no encontrado")
  return data
}
async function requireDomains(ctx: ToolCtx) {
  const p = await me(ctx)
  if (!can(p as never, "view_domains")) throw new Error("No tienes acceso a Dominios")
  return p
}

type Domain = { id: string; domain: string; registrar: string | null; hosted_at: string | null; renewal_date: string | null; renewal_cost: number | null; maintenance_type: string; maintenance_cost: number | null; last_maintenance_date: string | null; last_maintenance_notes: string | null; notes: string | null; customer: { name: string } | null }

async function allDomains(): Promise<Domain[]> {
  const { data } = await db().from("domains").select("*, customer:customers(name)").order("renewal_date", { ascending: true })
  return (data ?? []) as unknown as Domain[]
}
async function findDomain(q: string): Promise<Domain> {
  const s = q.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
  const all = await allDomains()
  const exact = all.filter((d) => d.domain.toLowerCase() === s)
  const hits = exact.length ? exact : all.filter((d) => d.domain.toLowerCase().includes(s) || (d.customer?.name ?? "").toLowerCase().includes(s))
  if (!hits.length) throw new Error(`No encontré el dominio "${q}".`)
  if (hits.length > 1) throw new Error(`"${q}" coincide con varios: ${hits.map((d) => d.domain).join(", ")}. Sé más específico.`)
  return hits[0]
}
const line = (d: Domain) => `${d.domain}${d.customer ? ` · ${d.customer.name}` : ""} · ${when(d.renewal_date)} · dominio ${mxn(d.renewal_cost)}${d.maintenance_type === "client" ? ` · mantenimiento ${mxn(d.maintenance_cost)}` : ` · ${MAINT[d.maintenance_type] ?? d.maintenance_type}`}${d.registrar ? ` · ${d.registrar}` : ""}${d.hosted_at ? ` · hosting ${d.hosted_at}` : ""}`

export function registerDomainTools(server: McpServer) {
  server.registerTool("dominios", {
    title: "Dominios",
    description: "Lista los dominios (de clientes y propios) con fecha y costo de renovación, mantenimiento, registrador, hosting y última mantención. Filtros: búsqueda (dominio o cliente) y vencen_en_dias (incluye los ya vencidos). Permiso de Dominios.",
    inputSchema: z.object({ busqueda: z.string().optional(), vencen_en_dias: z.number().int().positive().optional() }),
  }, async ({ busqueda, vencen_en_dias }, ctx: ToolCtx) => {
    await requireDomains(ctx)
    let list = await allDomains()
    if (busqueda?.trim()) { const q = busqueda.trim().toLowerCase(); list = list.filter((d) => d.domain.toLowerCase().includes(q) || (d.customer?.name ?? "").toLowerCase().includes(q)) }
    if (vencen_en_dias) list = list.filter((d) => d.renewal_date && daysUntil(d.renewal_date) <= vencen_en_dias)
    if (!list.length) return text("No hay dominios que coincidan.")
    return text(list.map((d) => `- ${line(d)}${d.last_maintenance_date ? `\n  última mantención ${d.last_maintenance_date}${d.last_maintenance_notes ? `: ${d.last_maintenance_notes}` : ""}` : ""}`).join("\n"))
  })

  server.registerTool("renovar_dominio", {
    title: "Renovar dominio",
    description: "Registra la renovación/mantención de un dominio, igual que el botón Renovar del dashboard: fecha, notas, si se cobró la renovación del dominio y/o el mantenimiento (cada cobro crea un ingreso, convertido de MXN a USD) y si se extiende un año la fecha de renovación (desde la fecha actual de renovación, no desde hoy). Sin confirmar: true solo muestra el plan. Permiso de Dominios.",
    inputSchema: z.object({
      dominio: z.string().min(1),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Fecha del pago/mantención; default hoy"),
      cobrar_dominio: z.boolean().default(false).describe("Registrar como ingreso el costo de renovación del dominio"),
      cobrar_mantenimiento: z.boolean().default(false).describe("Registrar como ingreso el costo de mantenimiento"),
      extender_un_anio: z.boolean().default(true),
      notas: z.string().optional(),
      confirmar: z.boolean().default(false),
    }),
  }, async (a, ctx: ToolCtx) => {
    await requireDomains(ctx)
    const d = await findDomain(a.dominio)
    const date = a.fecha ?? today()
    const charges = [
      a.cobrar_dominio && (d.renewal_cost ? `ingreso renovación ${mxn(d.renewal_cost)}` : "⚠️ cobrar dominio: no tiene costo de renovación registrado"),
      a.cobrar_mantenimiento && (d.maintenance_cost ? `ingreso mantenimiento ${mxn(d.maintenance_cost)}` : "⚠️ cobrar mantenimiento: no tiene costo de mantenimiento registrado"),
    ].filter(Boolean)
    const plan = [
      `${d.domain}${d.customer ? ` · ${d.customer.name}` : ""}`,
      `Fecha: ${date}${a.notas ? ` · notas: ${a.notas}` : ""}`,
      charges.length ? `Cobros: ${charges.join(" · ")}` : "Sin cobros (solo marca la mantención).",
      a.extender_un_anio && d.renewal_date ? `Renovación: ${d.renewal_date} → ${addOneYear(d.renewal_date)}` : a.extender_un_anio ? "No tiene fecha de renovación: no se extiende." : "La fecha de renovación no cambia.",
    ].join("\n")
    if (!a.confirmar) return text(`Registraría:\n${plan}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
    await renewDomainCore(db(), d.id, { date, notes: a.notas ?? null, chargeDomain: a.cobrar_dominio, chargeMaintenance: a.cobrar_mantenimiento, extendYear: a.extender_un_anio }, getExchangeRate)
    revalidatePath("/finances/domains"); revalidatePath("/finances")
    return text(`✅ Renovación registrada.\n${plan}`)
  })

  const Fields = {
    cliente: z.string().optional().describe("Nombre del cliente (vacío = propio)"),
    registrador: z.string().optional(),
    hosting: z.string().optional(),
    fecha_renovacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    costo_renovacion: z.number().nonnegative().optional().describe("MXN"),
    mantenimiento: z.enum(["cliente", "proyecto_propio", "no_aplica"]).optional(),
    costo_mantenimiento: z.number().nonnegative().optional().describe("MXN, solo si el mantenimiento es al cliente"),
    notas: z.string().optional(),
  }
  type FieldArgs = { [K in keyof typeof Fields]?: z.infer<(typeof Fields)[K]> }
  async function patchFrom(a: FieldArgs) {
    const p: Record<string, unknown> = {}
    if (a.cliente != null) {
      if (!a.cliente.trim()) p.customer_id = null
      else {
        const { data } = await db().from("customers").select("id, name").ilike("name", `%${a.cliente.trim()}%`).limit(5)
        if (!data?.length) throw new Error(`No encontré el cliente "${a.cliente}".`)
        if (data.length > 1 && !data.some((c) => c.name.toLowerCase() === a.cliente!.trim().toLowerCase())) throw new Error(`"${a.cliente}" coincide con varios clientes: ${data.map((c) => c.name).join(", ")}.`)
        p.customer_id = (data.find((c) => c.name.toLowerCase() === a.cliente!.trim().toLowerCase()) ?? data[0]).id
      }
    }
    if (a.registrador != null) p.registrar = a.registrador || null
    if (a.hosting != null) p.hosted_at = a.hosting || null
    if (a.fecha_renovacion) p.renewal_date = a.fecha_renovacion
    if (a.costo_renovacion != null) p.renewal_cost = a.costo_renovacion
    if (a.mantenimiento) p.maintenance_type = { cliente: "client", proyecto_propio: "own_project", no_aplica: "n_a" }[a.mantenimiento]
    if (a.costo_mantenimiento != null) p.maintenance_cost = a.costo_mantenimiento
    if (p.maintenance_type && p.maintenance_type !== "client") p.maintenance_cost = null
    if (a.notas != null) p.notes = a.notas || null
    return p
  }
  const describe = (p: Record<string, unknown>) => Object.entries(p).map(([k, v]) => `${k}: ${v ?? "—"}`).join(" · ")

  server.registerTool("crear_dominio", {
    title: "Crear dominio",
    description: "Da de alta un dominio con su cliente, registrador, hosting, fecha y costo de renovación y mantenimiento. Sin confirmar: true solo muestra lo que crearía. Permiso de Dominios.",
    inputSchema: z.object({ dominio: z.string().min(3), ...Fields, confirmar: z.boolean().default(false) }),
  }, async (a, ctx: ToolCtx) => {
    await requireDomains(ctx)
    const domain = a.dominio.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
    const { data: dup } = await db().from("domains").select("id").eq("domain", domain).limit(1)
    if (dup?.length) throw new Error(`${domain} ya está registrado; usa editar_dominio.`)
    const p = { domain, maintenance_type: "client", ...(await patchFrom(a)) }
    if (!a.confirmar) return text(`Crearía: ${describe(p)}\n\nNo se creó nada. Si es correcto, vuelve a llamar con confirmar: true.`)
    const { error } = await db().from("domains").insert(p)
    if (error) throw new Error(error.message)
    revalidatePath("/finances/domains")
    return text(`✅ Dominio creado: ${describe(p)}`)
  })

  server.registerTool("editar_dominio", {
    title: "Editar dominio",
    description: "Cambia cliente, registrador, hosting, fecha o costo de renovación, tipo/costo de mantenimiento o notas de un dominio; solo lo indicado. Sin confirmar: true muestra el cambio. Permiso de Dominios.",
    inputSchema: z.object({ dominio: z.string().min(1), ...Fields, confirmar: z.boolean().default(false) }),
  }, async (a, ctx: ToolCtx) => {
    await requireDomains(ctx)
    const d = await findDomain(a.dominio)
    const p = await patchFrom(a)
    if (!Object.keys(p).length) throw new Error("No indicaste nada que cambiar.")
    const desc = `${d.domain}\n${Object.entries(p).map(([k, v]) => `${k}: ${String((d as unknown as Record<string, unknown>)[k] ?? "—")} → ${v ?? "—"}`).join("\n")}`
    if (!a.confirmar) return text(`${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
    const { error } = await db().from("domains").update(p).eq("id", d.id)
    if (error) throw new Error(error.message)
    revalidatePath("/finances/domains")
    return text(`✅ Actualizado.\n${desc}`)
  })

  server.registerTool("renovaciones", {
    title: "Próximas renovaciones",
    description: "Todo lo que se renueva en los próximos N días (default 30), más lo ya vencido: dominios (con lo que se cobra al cliente) y, si tienes permiso de Finanzas, suscripciones/gastos anuales (su aniversario según la fecha de inicio).",
    inputSchema: z.object({ dias: z.number().int().positive().max(366).default(30) }),
  }, async ({ dias }, ctx: ToolCtx) => {
    const p = await me(ctx)
    const out: string[] = []
    if (can(p as never, "view_domains")) {
      const ds = (await allDomains()).filter((d) => d.renewal_date && daysUntil(d.renewal_date) <= dias)
      out.push(`DOMINIOS (${ds.length}):`, ...(ds.length ? ds.map((d) => `- ${line(d)}`) : ["- ninguno"]))
    }
    if (can(p as never, "view_global_finances")) {
      const { data } = await db().from("recurring_expenses").select("name, amount, frequency, category, start_date, is_active").eq("is_active", true).eq("frequency", "Annual")
      const t = today()
      const next = (start: string) => { let d = start; while (d < t) d = addOneYear(d); return d }
      const subs = (data ?? []).map((e) => ({ ...e, nextDate: next(String(e.start_date)) })).filter((e) => daysUntil(e.nextDate) <= dias).sort((x, y) => x.nextDate.localeCompare(y.nextDate))
      out.push(`\nSUSCRIPCIONES / GASTOS ANUALES (${subs.length}):`, ...(subs.length ? subs.map((e) => `- ${e.name} · ${e.category} · USD ${Number(e.amount).toLocaleString("en-US")} · se renueva en ${daysUntil(e.nextDate)} d (${e.nextDate})`) : ["- ninguna"]))
    }
    if (!out.length) throw new Error("No tienes acceso a Dominios ni a Finanzas.")
    return text(`Renovaciones en los próximos ${dias} días (y vencidas):\n${out.join("\n")}`)
  })
}
