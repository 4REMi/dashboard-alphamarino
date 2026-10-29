import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { listLeads, updateLead, createLead, generateProposal, type QuotePatch } from "@/lib/quotes/server"
import { QUOTE_STATUS, PROPOSAL_TYPES, STAGES, hasTemplate, needsFollowUp, missingInfo, daysSince, contextForMake, quoteKpis, type QuoteLead, type QuoteStatus } from "@/lib/quotes/core"

// Hub de cotizaciones desde Claude (solo admin). Misma lógica que /cotizaciones.
// Para ofertas sin plantilla de Slides, Claude puede armar la presentación en
// la conversación y guardar su link con editar_cotizacion.

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()

async function requireAdmin(ctx: ToolCtx) {
  const id = ctx.http?.authInfo?.extra?.profileId
  if (typeof id !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("role").eq("id", id).single()
  if (data?.role !== "admin") throw new Error("Solo admin puede usar el hub de cotizaciones.")
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
async function findLead(q: string): Promise<QuoteLead> {
  const all = await listLeads(db())
  const s = norm(q)
  const exact = all.filter((l) => norm(l.company ?? "") === s || norm(l.name) === s)
  const hits = exact.length ? exact : all.filter((l) => norm(`${l.company ?? ""} ${l.name}`).includes(s))
  const open = hits.filter((l) => l.status !== "ganada" && l.status !== "perdida")
  const pick = open.length === 1 ? open : hits
  if (!pick.length) throw new Error(`No encontré la cotización "${q}".`)
  if (pick.length > 1) throw new Error(`"${q}" coincide con varias: ${pick.map((l) => `${l.company || l.name} (${l.status})`).join(", ")}. Sé más específico.`)
  return pick[0]
}

const money = (n: number | null) => (n == null ? "sin precio" : `$${n.toLocaleString("es-MX")} MXN`)
const typeLabel = (t: string | null) => !t ? "sin tipo" : PROPOSAL_TYPES.find((p) => p.key === t)?.label ?? `${t.replace(/^otra:/, "")} (sin plantilla)`
const statusLabel = (s: QuoteStatus) => QUOTE_STATUS.find((x) => x.key === s)?.label ?? s
const line = (l: QuoteLead) => `${l.company || l.name}${l.company ? ` · ${l.name}` : ""} · ${typeLabel(l.proposal_type)} · ${money(l.price)} · ${statusLabel(l.status)}${needsFollowUp(l) ? ` · ⚠ enviada hace ${daysSince(l.sent_at ?? l.updated_at)} d sin respuesta` : ""}${(l.status === "nuevo" || l.status === "lista") && missingInfo(l) ? " · falta tipo o precio" : ""}`

const TYPE_ENUM = ["web_informativo", "web_ecommerce", "otra"] as const
const STATUS_ENUM = ["por_cotizar", "generada", "enviada", "ganada", "perdida"] as const
const STATUS_MAP: Record<(typeof STATUS_ENUM)[number], QuoteStatus> = { por_cotizar: "lista", generada: "generada", enviada: "enviada", ganada: "ganada", perdida: "perdida" }
const Fields = {
  negocio: z.string().optional(), contacto: z.string().optional(), telefono: z.string().optional(), correo: z.string().optional(),
  giro: z.string().optional(), sitio_web: z.string().optional(), redes: z.string().optional(), problema: z.string().optional(),
  inversion: z.string().optional(), notas: z.string().optional(),
  tipo: z.enum(TYPE_ENUM).optional().describe("web_informativo / web_ecommerce (con plantilla de Slides) u otra"),
  oferta: z.string().optional().describe("Con tipo 'otra': qué oferta (ej. Paid Media)"),
  precio: z.number().nonnegative().optional().describe("MXN"),
}
type FieldArgs = { [K in keyof typeof Fields]?: z.infer<(typeof Fields)[K]> }
function toPatch(a: FieldArgs): QuotePatch {
  const p: QuotePatch = {}
  if (a.negocio != null) p.company = a.negocio
  if (a.contacto != null) p.name = a.contacto
  if (a.telefono != null) p.phone = a.telefono
  if (a.correo != null) p.email = a.correo
  if (a.giro != null) p.giro = a.giro
  if (a.sitio_web != null) p.website = a.sitio_web
  if (a.redes != null) p.socials = a.redes
  if (a.problema != null) p.problem = a.problema
  if (a.inversion != null) p.investment = a.inversion
  if (a.notas != null) p.notes = a.notas
  if (a.oferta != null) p.offer = a.oferta
  if (a.tipo) {
    p.proposal_type = a.tipo === "otra" ? `otra:${a.oferta ?? ""}` : a.tipo
    const t = PROPOSAL_TYPES.find((x) => x.key === a.tipo)
    if (t && a.precio == null) p.price = t.defaultPrice
  }
  if (a.precio != null) p.price = a.precio
  return p
}

export function registerQuoteTools(server: McpServer) {
  server.registerTool("cotizaciones", {
    title: "Cotizaciones (hub)",
    description: "Lista los leads del hub de cotizaciones por etapa (por cotizar, generando, propuesta lista, enviada, cerradas), con tipo, precio y alertas (sin respuesta 7+ días, falta info), más los números del mes. Solo admin.",
    inputSchema: z.object({ etapa: z.enum(["abiertas", "por_cotizar", "generando", "generada", "enviada", "cerradas", "todas"]).default("abiertas"), busqueda: z.string().optional() }),
  }, async ({ etapa, busqueda }, ctx: ToolCtx) => {
    await requireAdmin(ctx)
    let leads = await listLeads(db())
    if (!leads.length) return text("El hub de cotizaciones está vacío (o falta la migración 119).")
    const k = quoteKpis(leads)
    if (busqueda?.trim()) leads = leads.filter((l) => norm(`${l.company ?? ""} ${l.name} ${l.giro ?? ""}`).includes(norm(busqueda)))
    const out = [`Abiertas ${k.abiertas} · por cotizar ${k.porCotizar} · cotizado este mes $${k.cotizadoMes.toLocaleString("es-MX")} · enviadas sin respuesta ${k.sinRespuesta} · cierre 30 d ${k.ganadas30}/${k.cerradas30}`]
    for (const st of STAGES) {
      if (etapa !== "todas" && etapa !== st.key && !(etapa === "abiertas" && st.key !== "cerradas")) continue
      const items = leads.filter((l) => (st.statuses as readonly QuoteStatus[]).includes(l.status))
      if (!items.length) continue
      out.push(`\n${st.label} (${items.length}):`, ...items.map((l) => `- ${line(l)}`))
    }
    return text(out.join("\n"))
  })

  server.registerTool("detalle_cotizacion", {
    title: "Detalle de una cotización",
    description: "Todo el contexto de un lead del hub (negocio, giro, problema, redes, inversión, resumen de la IA de GHL, notas), tipo y precio, links al PDF/Slides e historial. Úsalo antes de generar o de armar una propuesta.",
    inputSchema: z.object({ lead: z.string().min(1).describe("Negocio o nombre del contacto") }),
  }, async ({ lead }, ctx: ToolCtx) => {
    await requireAdmin(ctx)
    const l = await findLead(lead)
    return text([
      line(l),
      `Origen: ${l.source} · llegó ${l.created_at.slice(0, 10)}${l.sent_at ? ` · enviada ${l.sent_at.slice(0, 10)}` : ""}${l.closed_at ? ` · cerrada ${l.closed_at.slice(0, 10)}` : ""}`,
      [l.phone, l.email].filter(Boolean).join(" · "),
      "",
      contextForMake(l),
      l.offer ? `Oferta de interés: ${l.offer}` : "",
      l.proposal_pdf_url ? `PDF: ${l.proposal_pdf_url}` : "",
      l.proposal_slides_url ? `Slides: ${l.proposal_slides_url}` : "",
      l.last_error ? `Último error: ${l.last_error}` : "",
      !hasTemplate(l.proposal_type) && l.proposal_type ? "\nEsta oferta no tiene plantilla de Slides: arma la propuesta en la conversación y guarda el link con editar_cotizacion (slides_url)." : "",
    ].filter((x) => x !== "").join("\n"))
  })

  server.registerTool("nueva_cotizacion", {
    title: "Nueva cotización",
    description: "Crea un lead en el hub de cotizaciones desde la conversación (ej. 'me escribió Carlos de una ferretería, quiere tienda en línea'). Sin confirmar: true solo muestra lo que crearía.",
    inputSchema: z.object({ ...Fields, contacto: z.string().min(1), confirmar: z.boolean().default(false) }),
  }, async (a, ctx: ToolCtx) => {
    await requireAdmin(ctx)
    const patch = toPatch(a)
    const preview = `${a.negocio || a.contacto}${a.negocio ? ` · ${a.contacto}` : ""} · ${typeLabel(patch.proposal_type ?? null)} · ${money(patch.price ?? null)}`
    if (!a.confirmar) return text(`Crearía:\n- ${preview}\n\nNo se creó nada. Si es correcto, vuelve a llamar con confirmar: true.`)
    await createLead(db(), { ...patch, name: a.contacto, source: "manual" })
    revalidatePath("/cotizaciones")
    return text(`✅ Cotización creada: ${preview}`)
  })

  server.registerTool("editar_cotizacion", {
    title: "Editar cotización",
    description: "Completa o corrige el contexto de un lead, cambia tipo/precio, mueve de etapa (por_cotizar, generada, enviada, ganada, perdida) o guarda links de la propuesta (pdf_url / slides_url — p. ej. una presentación que armaste para una oferta sin plantilla). Solo cambia lo indicado; sin confirmar: true muestra el cambio.",
    inputSchema: z.object({
      lead: z.string().min(1), ...Fields,
      etapa: z.enum(STATUS_ENUM).optional(),
      pdf_url: z.string().url().optional(), slides_url: z.string().url().optional(),
      confirmar: z.boolean().default(false),
    }),
  }, async (a, ctx: ToolCtx) => {
    await requireAdmin(ctx)
    const l = await findLead(a.lead)
    const patch = toPatch(a)
    if (a.etapa) patch.status = STATUS_MAP[a.etapa]
    if (a.pdf_url) patch.proposal_pdf_url = a.pdf_url
    if (a.slides_url) patch.proposal_slides_url = a.slides_url
    if (!Object.keys(patch).length) throw new Error("No indicaste nada que cambiar.")
    const desc = Object.entries(patch).map(([k, v]) => `${k}: ${String((l as unknown as Record<string, unknown>)[k] ?? "—").slice(0, 60)} → ${String(v).slice(0, 80)}`).join("\n")
    if (!a.confirmar) return text(`${l.company || l.name}\n${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
    await updateLead(db(), l.id, patch)
    revalidatePath("/cotizaciones")
    return text(`✅ ${l.company || l.name} actualizada.\n${desc}`)
  })

  server.registerTool("generar_propuesta", {
    title: "Generar propuesta (Make)",
    description: "Dispara el escenario Cotizador de Make para un lead con tipo con plantilla (web_informativo / web_ecommerce): arma Slides + PDF y lo manda al correo (1–3 min); el lead pasa de inmediato a Propuesta lista. Cuesta operaciones de Make e IA. Sin confirmar: true muestra el contexto que se enviará.",
    inputSchema: z.object({ lead: z.string().min(1), confirmar: z.boolean().default(false) }),
  }, async ({ lead, confirmar }, ctx: ToolCtx) => {
    await requireAdmin(ctx)
    const l = await findLead(lead)
    if (!hasTemplate(l.proposal_type)) throw new Error(`${l.company || l.name}: ${l.proposal_type ? "esta oferta no tiene plantilla de Slides" : "falta elegir el tipo"}. Para ofertas sin plantilla, arma la propuesta en la conversación y guarda el link con editar_cotizacion.`)
    const price = l.price ?? PROPOSAL_TYPES.find((p) => p.key === l.proposal_type)!.defaultPrice
    if (!confirmar) return text(`Generaría la propuesta ${typeLabel(l.proposal_type)} de ${l.company || l.name} por ${money(price)} con este contexto:\n\n${contextForMake({ ...l, price })}\n\nNo se envió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
    await generateProposal(db(), l.id)
    revalidatePath("/cotizaciones")
    return text(`✅ Enviada a Make y marcada como "Propuesta lista". El PDF llega a tu correo en 1–3 min; su link se puede guardar con editar_cotizacion (pdf_url).`)
  })
}
