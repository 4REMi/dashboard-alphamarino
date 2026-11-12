import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServiceOffer, updateServiceOffer, archiveServiceOffer, setOfferAddons } from "@/lib/actions/services"

// Catálogo de ofertas de Servicios desde el MCP. Mismas reglas que el
// dashboard: leer y escribir solo admin/subadmin (RLS de service_offers);
// las escrituras pasan por las server actions reales (createServiceOffer,
// updateServiceOffer, archiveServiceOffer, setOfferAddons) con
// actingProfileId. Todo lo que cambia algo va en dos pasos (confirmar).
//
// Efecto en proyectos (project_service_offers guarda solo el id de la oferta):
// - nombre, categoría, descripción: se ven actualizados en todos los
//   proyectos al instante; la asignación no se rompe.
// - precio, periodicidad, pauta, ciclos, orden, tipo de proyecto, add-ons:
//   informativos del catálogo; NO cambian el fee del proyecto
//   (projects.monthly_fee, se edita con editar_fee_proyecto).
// - entregables: líneas nuevas cuentan desde hoy; las quitadas conservan su
//   historial en periodos pasados (getScopeOverview).

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()
const NO_CHANGES = "\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true."
const todayMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })

type Offer = {
  id: string; category: string; name: string; description: string | null
  deliverables: Del[] | null; is_base: boolean; based_on_offer_id: string | null; default_project_type_id: string | null
  price: number | null; currency: "MXN" | "USD"; price_note: string | null; status: "active" | "archived"
  recommended_ad_budget?: number | null; recommended_ad_budget_note?: string | null
  cycle_count?: number | null; cycle_length_days?: number | null; sort_order?: number | null
}

async function requireOfferManager(ctx: ToolCtx): Promise<string> {
  const id = ctx.http?.authInfo?.extra?.profileId
  if (typeof id !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("role").eq("id", id).single()
  if (data?.role !== "admin" && data?.role !== "subadmin") throw new Error("Solo admin o subadmin pueden ver y editar el catálogo de ofertas.")
  return id
}

// Exacta (sin importar mayúsculas) antes que parcial: "Core" no choca con "Core Plus".
async function findOffer(q: string): Promise<Offer> {
  const s = q.trim()
  const { data } = await db().from("service_offers").select("*").ilike("name", `%${s}%`).limit(20)
  const rows = (data ?? []) as Offer[]
  const exact = rows.filter((o) => o.name.trim().toLowerCase() === s.toLowerCase())
  const hits = exact.length ? exact : rows
  if (!hits.length) throw new Error(`No encontré ninguna oferta que coincida con "${q}" (activa ni archivada).`)
  if (hits.length > 1) throw new Error(`"${q}" coincide con varias ofertas: ${hits.map((o) => `${o.name} [${o.category}]${o.status === "archived" ? " (archivada)" : ""}`).join(", ")}. Usa el nombre exacto.`)
  return hits[0]
}

const NONE = /^(ninguna|ninguno|sin|none|null|-)$/i

async function findProjectType(q: string): Promise<{ id: string; name: string } | null> {
  if (NONE.test(q.trim())) return null
  const { data } = await db().from("project_types").select("id, name").ilike("name", `%${q.trim()}%`).limit(10)
  const rows = data ?? []
  const exact = rows.filter((r) => r.name.toLowerCase() === q.trim().toLowerCase())
  const hits = exact.length ? exact : rows
  if (hits.length !== 1) throw new Error(hits.length ? `"${q}" coincide con varios tipos de proyecto: ${hits.map((r) => r.name).join(", ")}.` : `No encontré el tipo de proyecto "${q}".`)
  return hits[0]
}

async function findAddons(names: string[]): Promise<{ id: string; name: string }[]> {
  const { data } = await db().from("service_addons").select("id, name, status")
  const all = data ?? []
  return names.map((n) => {
    const q = n.trim().toLowerCase()
    const exact = all.filter((a) => a.name.toLowerCase() === q)
    const hits = exact.length ? exact : all.filter((a) => a.name.toLowerCase().includes(q))
    if (hits.length !== 1) throw new Error(hits.length ? `"${n}" coincide con varios add-ons: ${hits.map((a) => a.name).join(", ")}.` : `No encontré el add-on "${n}". Usa listar_addons.`)
    return { id: hits[0].id, name: hits[0].name }
  })
}

// ── Entregables ──────────────────────────────────────────────────────

const CADENCIA = { una_vez: "once", por_periodo: "monthly", cada_3_periodos: "quarterly", cada_6_periodos: "biannual", continuo: "continuous" } as const
const CAD_LABEL: Record<string, string> = { once: "una vez", monthly: "por periodo", quarterly: "cada 3 periodos", biannual: "cada 6 periodos", continuous: "continuo" }
const Linea = z.object({
  texto: z.string().min(1).describe("Texto de venta (lo que ve el cliente en la oferta)"),
  control: z.string().optional().describe("Texto de control: corto y verificable, lo que se palomea (ej. '6 piezas visuales')"),
  cadencia: z.enum(["una_vez", "por_periodo", "cada_3_periodos", "cada_6_periodos", "continuo"]).optional()
    .describe("una_vez = hito único; por_periodo = cada periodo del proyecto (ciclo o mes); cada_3/cada_6 = cada 3 o 6 periodos; continuo = se da todo el tiempo, sin cantidad"),
  cantidad: z.number().int().positive().optional().describe("Unidades por periodo; no aplica a 'continuo'"),
})
type Del = { id: string; text: string; control_text: string | null; cadence: string; quantity: number | null; added_at: string | null }
const toDel = (l: z.infer<typeof Linea>): Del => {
  const cadence = l.cadencia ? CADENCIA[l.cadencia] : "once"
  return { id: crypto.randomUUID(), text: l.texto.trim(), control_text: l.control?.trim() || null, cadence, quantity: cadence === "continuous" ? null : l.cantidad ?? null, added_at: todayMx() }
}
const fmtDel = (d: Del, i: number) =>
  `${i + 1}. ${d.text}${d.control_text ? ` [control: ${d.control_text}]` : ""} · ${CAD_LABEL[d.cadence] ?? d.cadence}${d.quantity ? ` ×${d.quantity}` : ""}${d.added_at ? ` · desde ${d.added_at}` : ""}`
const normDels = (o: Offer): Del[] => (o.deliverables ?? []).map((d) => ({ ...d, id: d.id || crypto.randomUUID(), control_text: d.control_text ?? null, quantity: d.quantity ?? null, added_at: d.added_at ?? null }))

// ── Formato ──────────────────────────────────────────────────────────

const money = (n: number | null | undefined, cur: string) => (n == null ? null : `$${Number(n).toLocaleString("es-MX")} ${cur}`)
const cycles = (o: Partial<Offer>) =>
  o.cycle_count && o.cycle_length_days ? `${o.cycle_count} ciclos de ${o.cycle_length_days} días` : o.cycle_count ? `${o.cycle_count} ciclos` : o.cycle_length_days ? `ciclos de ${o.cycle_length_days} días` : null

// Campos editables, con su etiqueta, para antes → después.
const FIELDS: [keyof Offer, string][] = [
  ["name", "Nombre"], ["category", "Categoría"], ["description", "Descripción de venta"],
  ["price", "Precio"], ["currency", "Moneda"], ["price_note", "Periodicidad / nota de precio"],
  ["recommended_ad_budget", "Pauta recomendada"], ["recommended_ad_budget_note", "Nota de pauta"],
  ["cycle_count", "Número de ciclos"], ["cycle_length_days", "Días por ciclo"],
  ["is_base", "Oferta base de su categoría"], ["based_on_offer_id", "Deriva de"],
  ["default_project_type_id", "Tipo de proyecto (chip)"], ["sort_order", "Orden en la categoría"],
]

// FormData completo para updateServiceOffer/createServiceOffer (que
// reescriben todos los campos base). Los de la migración 123 solo van si se
// cambian, para no exigir la migración en cambios que no los tocan.
function offerFormData(o: Offer, patch: Partial<Offer>, deliverables?: Del[]) {
  const v = { ...o, ...patch }
  const fd = new FormData()
  fd.set("name", v.name); fd.set("category", v.category)
  if (v.description) fd.set("description", v.description)
  fd.set("is_base", String(!!v.is_base))
  if (v.based_on_offer_id) fd.set("based_on_offer_id", v.based_on_offer_id)
  if (v.default_project_type_id) fd.set("default_project_type_id", v.default_project_type_id)
  if (v.price != null) fd.set("price", String(v.price))
  fd.set("currency", v.currency ?? "MXN")
  if (v.price_note) fd.set("price_note", v.price_note)
  fd.set("deliverables_json", JSON.stringify(deliverables ?? normDels(o)))
  for (const k of ["recommended_ad_budget", "recommended_ad_budget_note", "cycle_count", "cycle_length_days", "sort_order"] as const) {
    if (k in patch) fd.set(k, patch[k] == null ? "" : String(patch[k]))
  }
  return fd
}

async function namesById(ids: (string | null | undefined)[], table: "service_offers" | "project_types") {
  const clean = [...new Set(ids.filter((x): x is string => !!x))]
  if (!clean.length) return new Map<string, string>()
  const { data } = await db().from(table).select("id, name").in("id", clean)
  return new Map((data ?? []).map((r) => [r.id as string, r.name as string]))
}

async function projectsUsing(offerId: string) {
  const { data } = await db().from("project_service_offers").select("project:projects(name, status)").eq("service_offer_id", offerId)
  return ((data ?? []) as unknown as { project: { name: string; status: string } | null }[]).map((r) => r.project).filter((p): p is { name: string; status: string } => !!p)
}

// Campos opcionales comunes de crear/editar.
const OfferFields = {
  categoria: z.string().min(1).optional(),
  descripcion: z.string().optional().describe("Descripción de venta; vacío la quita"),
  precio: z.number().nonnegative().nullable().optional().describe("null quita el precio (\"Cotización\")"),
  moneda: z.enum(["MXN", "USD"]).optional(),
  texto_periodicidad: z.string().optional().describe("Nota de precio / periodicidad, ej. \"Precio mensual (ciclo de 30 días)\"; vacío la quita"),
  presupuesto_pauta: z.number().nonnegative().nullable().optional().describe("Pauta recomendada al cliente, en la moneda de la oferta; null la quita"),
  nota_pauta: z.string().optional().describe("Ej. \"Desde $10,000/mes, pagado directo a Meta\"; vacío la quita"),
  ciclos: z.number().int().positive().nullable().optional().describe("Duración: número de ciclos; null lo quita"),
  dias_por_ciclo: z.number().int().positive().nullable().optional().describe("Duración de cada ciclo en días; null lo quita"),
  es_base: z.boolean().optional().describe("Oferta base de su categoría (las demás pueden derivar de ella)"),
  deriva_de: z.string().optional().describe("Nombre de la oferta padre, o \"ninguna\""),
  tipo_proyecto: z.string().optional().describe("Chip de la tarjeta: tipo de proyecto de Ops Lab (ej. \"Paid Media\"), o \"ninguno\""),
  orden: z.number().int().nullable().optional().describe("Orden manual dentro de la categoría (menor = primero; null = al final)"),
}
type FieldArgs = { [K in keyof typeof OfferFields]?: z.infer<(typeof OfferFields)[K]> }

async function buildPatch(a: FieldArgs, selfId?: string): Promise<Partial<Offer>> {
  const p: Partial<Offer> = {}
  if (a.categoria !== undefined) p.category = a.categoria.trim()
  if (a.descripcion !== undefined) p.description = a.descripcion.trim() || null
  if (a.precio !== undefined) p.price = a.precio
  if (a.moneda !== undefined) p.currency = a.moneda
  if (a.texto_periodicidad !== undefined) p.price_note = a.texto_periodicidad.trim() || null
  if (a.presupuesto_pauta !== undefined) p.recommended_ad_budget = a.presupuesto_pauta
  if (a.nota_pauta !== undefined) p.recommended_ad_budget_note = a.nota_pauta.trim() || null
  if (a.ciclos !== undefined) p.cycle_count = a.ciclos
  if (a.dias_por_ciclo !== undefined) p.cycle_length_days = a.dias_por_ciclo
  if (a.orden !== undefined) p.sort_order = a.orden
  if (a.es_base !== undefined) { p.is_base = a.es_base; if (a.es_base) p.based_on_offer_id = null }
  if (a.deriva_de !== undefined) {
    if (NONE.test(a.deriva_de.trim())) p.based_on_offer_id = null
    else {
      const parent = await findOffer(a.deriva_de)
      if (parent.id === selfId) throw new Error("Una oferta no puede derivar de sí misma.")
      p.based_on_offer_id = parent.id
      p.is_base = false
    }
  }
  if (a.tipo_proyecto !== undefined) p.default_project_type_id = (await findProjectType(a.tipo_proyecto))?.id ?? null
  return p
}

async function fieldValue(k: keyof Offer, v: Offer, names: { offers: Map<string, string>; types: Map<string, string> }): Promise<string> {
  const x = v[k]
  if (x == null || x === "") return "—"
  if (k === "price" || k === "recommended_ad_budget") return money(x as number, v.currency) ?? "—"
  if (k === "is_base") return x ? "sí" : "no"
  if (k === "based_on_offer_id") return names.offers.get(x as string) ?? String(x)
  if (k === "default_project_type_id") return names.types.get(x as string) ?? String(x)
  return String(x)
}

// ── Herramientas ─────────────────────────────────────────────────────

export function registerOfferTools(server: McpServer) {
  server.registerTool(
    "listar_ofertas",
    {
      title: "Listar ofertas de servicio",
      description: "Lista el catálogo de Servicios agrupado por categoría y en su orden manual: precio, si es base o de qué deriva, y estado. Por defecto solo activas; incluir_archivadas: true muestra también las archivadas (para confirmar que no exista ya una). Solo admin/subadmin.",
      inputSchema: z.object({
        query: z.string().optional().describe("Parte del nombre"),
        categoria: z.string().optional(),
        incluir_archivadas: z.boolean().default(false),
      }),
    },
    async ({ query, categoria, incluir_archivadas }, ctx: ToolCtx) => {
      await requireOfferManager(ctx)
      let q = db().from("service_offers").select("*").order("category").order("name")
      if (!incluir_archivadas) q = q.eq("status", "active")
      if (query?.trim()) q = q.ilike("name", `%${query.trim()}%`)
      if (categoria?.trim()) q = q.ilike("category", `%${categoria.trim()}%`)
      const { data, error } = await q.limit(300)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as Offer[]
      if (!rows.length) return text(`Ninguna oferta${incluir_archivadas ? "" : " activa"} coincide.${incluir_archivadas ? "" : " (Prueba con incluir_archivadas: true.)"}`)
      const parents = await namesById(rows.map((o) => o.based_on_offer_id), "service_offers")
      const byCat = new Map<string, Offer[]>()
      for (const o of rows) byCat.set(o.category, [...(byCat.get(o.category) ?? []), o])
      const out: string[] = []
      for (const [cat, list] of byCat) {
        list.sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || Number(b.is_base) - Number(a.is_base) || a.name.localeCompare(b.name, "es"))
        out.push(`\n## ${cat}`)
        for (const o of list) {
          out.push(`- ${o.sort_order != null ? `#${o.sort_order} ` : ""}${o.name}${o.is_base ? " (BASE)" : ""}${o.based_on_offer_id ? ` · deriva de ${parents.get(o.based_on_offer_id) ?? "?"}` : ""} · ${money(o.price, o.currency) ?? o.price_note ?? "sin precio"}${o.status === "archived" ? " · ARCHIVADA" : ""}`)
        }
      }
      return text(`Ofertas${incluir_archivadas ? " (activas y archivadas)" : " activas"}: ${rows.length}${out.join("\n")}`)
    },
  )

  server.registerTool(
    "detalle_oferta",
    {
      title: "Detalle de una oferta",
      description: "Todo sobre una oferta: id, estado (activa/archivada), categoría, descripción, precio y su periodicidad, pauta recomendada, duración en ciclos, si es base, de qué deriva y qué ofertas derivan de ella, tipo de proyecto (el chip de la tarjeta), add-ons con precio, orden manual, entregables numerados (texto de venta, control, cadencia, cantidad, desde cuándo) y en qué proyectos está asignada. Busca también en archivadas. Solo admin/subadmin.",
      inputSchema: z.object({ oferta: z.string().min(1).describe("Nombre exacto o parte") }),
    },
    async ({ oferta }, ctx: ToolCtx) => {
      await requireOfferManager(ctx)
      const o = await findOffer(oferta)
      const [parents, types, { data: children }, { data: addonRows }, projects] = await Promise.all([
        namesById([o.based_on_offer_id], "service_offers"),
        namesById([o.default_project_type_id], "project_types"),
        db().from("service_offers").select("name, status").eq("based_on_offer_id", o.id),
        db().from("service_offer_addons").select("addon:service_addons(name, price, currency, price_note, status)").eq("offer_id", o.id),
        projectsUsing(o.id),
      ])
      const addons = ((addonRows ?? []) as unknown as { addon: { name: string; price: number | null; currency: string; price_note: string | null; status: string } | null }[]).map((r) => r.addon).filter(Boolean) as { name: string; price: number | null; currency: string; price_note: string | null; status: string }[]
      const dels = normDels(o)
      const active = projects.filter((p) => p.status === "Active")
      return text([
        `# ${o.name}`,
        `id ${o.id} · ${o.status === "archived" ? "ARCHIVADA" : "activa"} · categoría ${o.category}${o.sort_order != null ? ` · orden #${o.sort_order}` : ""}`,
        `Base de su categoría: ${o.is_base ? "sí" : "no"}${o.based_on_offer_id ? ` · deriva de: ${parents.get(o.based_on_offer_id) ?? o.based_on_offer_id}` : ""}`,
        children?.length ? `Derivan de ella: ${children.map((c) => `${c.name}${c.status === "archived" ? " (archivada)" : ""}`).join(", ")}` : "",
        `Tipo de proyecto (chip): ${o.default_project_type_id ? types.get(o.default_project_type_id) ?? "—" : "ninguno"}`,
        `\nDescripción de venta: ${o.description ?? "—"}`,
        `Precio: ${money(o.price, o.currency) ?? "sin precio fijo"}${o.price_note ? ` · periodicidad/nota: ${o.price_note}` : ""}`,
        `Pauta recomendada: ${money(o.recommended_ad_budget, o.currency) ?? "—"}${o.recommended_ad_budget_note ? ` · ${o.recommended_ad_budget_note}` : ""}`,
        `Duración: ${cycles(o) ?? "—"}`,
        `Add-ons: ${addons.length ? addons.map((a) => `${a.name} (${money(a.price, a.currency) ?? a.price_note ?? "sin precio"})${a.status === "archived" ? " [archivado]" : ""}`).join(", ") : "ninguno"}`,
        `\nEntregables (${dels.length}) — cadencia por periodo del proyecto (su ciclo o mes):`,
        dels.length ? dels.map(fmtDel).join("\n") : "(sin entregables)",
        `\nProyectos con esta oferta: ${projects.length ? `${projects.length} (${active.length} activos): ${projects.map((p) => p.name).join(", ")}` : "ninguno"}`,
      ].filter(Boolean).join("\n"))
    },
  )

  server.registerTool(
    "crear_oferta",
    {
      title: "Crear oferta de servicio",
      description: "Crea una oferta nueva en el catálogo de Servicios con todos sus campos (precio y periodicidad, pauta recomendada, ciclos, base/deriva de, tipo de proyecto, orden, add-ons, entregables). Avisa si ya existe una con ese nombre (también archivada). Sin confirmar: true solo muestra lo que crearía. Solo admin/subadmin.",
      inputSchema: z.object({
        nombre: z.string().min(1),
        ...OfferFields,
        categoria: z.string().min(1),
        addons: z.array(z.string()).optional().describe("Nombres de add-ons existentes a vincular"),
        entregables: z.array(Linea).max(60).optional().describe("Líneas de entregables con su control, cadencia y cantidad"),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const actingProfileId = await requireOfferManager(ctx)
      const patch = await buildPatch(a)
      const draft: Offer = {
        id: "", name: a.nombre.trim(), category: a.categoria.trim(), description: null, deliverables: [], is_base: false,
        based_on_offer_id: null, default_project_type_id: null, price: null, currency: "MXN", price_note: null, status: "active", ...patch,
      }
      const dels = (a.entregables ?? []).map(toDel)
      const addons = a.addons?.length ? await findAddons(a.addons) : []
      const { data: dup } = await db().from("service_offers").select("name, status").ilike("name", draft.name)
      const names = { offers: await namesById([draft.based_on_offer_id], "service_offers"), types: await namesById([draft.default_project_type_id], "project_types") }
      const lines = await Promise.all(FIELDS.filter(([k]) => draft[k] != null && draft[k] !== "" && k !== "currency").map(async ([k, label]) => `${label}: ${await fieldValue(k, draft, names)}`))
      const desc = `${lines.join("\n")}${addons.length ? `\nAdd-ons: ${addons.map((x) => x.name).join(", ")}` : ""}\nEntregables (${dels.length}):\n${dels.map(fmtDel).join("\n") || "(ninguno)"}`
      if (!a.confirmar) return text(`Crearía:\n${desc}${dup?.length ? `\n⚠️ Ya existe "${dup[0].name}"${dup[0].status === "archived" ? " (archivada; podrías desarchivarla)" : ""}.` : ""}${NO_CHANGES}`)
      const fd = offerFormData(draft, patch, dels)
      const created = await createServiceOffer(fd, actingProfileId)
      if (addons.length) await setOfferAddons(created.id, addons.map((x) => x.id), actingProfileId)
      return text(`✅ Oferta creada (id ${created.id}).\n${desc}`)
    },
  )

  server.registerTool(
    "editar_oferta",
    {
      title: "Editar oferta de servicio",
      description:
        "Cambia campos de una oferta sin recrearla: nombre, categoría, descripción de venta, precio y moneda, texto de periodicidad del precio, pauta recomendada, duración (ciclos y días por ciclo), base/deriva de, tipo de proyecto (chip) y orden. Solo cambia lo indicado. Muestra antes → después y el efecto en los proyectos que ya la tienen: nombre/categoría/descripción se ven actualizados en ellos (la asignación no se rompe); precio, pauta y ciclos son del catálogo y NO cambian el fee de esos proyectos. Entregables: oferta_entregables; add-ons: oferta_addons. Sin confirmar: true no guarda. Solo admin/subadmin.",
      inputSchema: z.object({
        oferta: z.string().min(1).describe("Nombre actual (exacto o parte)"),
        nuevo_nombre: z.string().min(1).optional(),
        ...OfferFields,
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const actingProfileId = await requireOfferManager(ctx)
      const o = await findOffer(a.oferta)
      const patch = await buildPatch(a, o.id)
      if (a.nuevo_nombre !== undefined) patch.name = a.nuevo_nombre.trim()
      const after = { ...o, ...patch }
      const changed = FIELDS.filter(([k]) => (o[k] ?? null) !== (after[k] ?? null))
      if (!changed.length) throw new Error("No indicaste nada que cambiar (o ya tiene esos valores).")
      const names = {
        offers: await namesById([o.based_on_offer_id, after.based_on_offer_id], "service_offers"),
        types: await namesById([o.default_project_type_id, after.default_project_type_id], "project_types"),
      }
      const diff = await Promise.all(changed.map(async ([k, label]) => `- ${label}: ${await fieldValue(k, o, names)} → ${await fieldValue(k, after, names)}`))
      if (patch.name && patch.name !== o.name) {
        const { data: dup } = await db().from("service_offers").select("name").ilike("name", patch.name).neq("id", o.id).limit(1)
        if (dup?.length) diff.push(`⚠️ Ya existe otra oferta llamada "${dup[0].name}".`)
      }
      const projects = await projectsUsing(o.id)
      const visible = changed.some(([k]) => k === "name" || k === "category" || k === "description")
      const catalogOnly = changed.some(([k]) => ["price", "currency", "price_note", "recommended_ad_budget", "recommended_ad_budget_note", "cycle_count", "cycle_length_days"].includes(k))
      const impact = projects.length
        ? [
            `Efecto en ${projects.length} proyecto(s) con esta oferta (${projects.map((p) => p.name).join(", ")}):`,
            visible ? "- Nombre/categoría/descripción: se verán actualizados en ellos; siguen asignados (se ligan por id)." : "",
            catalogOnly ? "- Precio/pauta/ciclos: son del catálogo; el fee de esos proyectos NO cambia (si hace falta: editar_fee_proyecto)." : "",
            "- Entregables y periodos: sin cambios.",
          ].filter(Boolean).join("\n")
        : "Ningún proyecto tiene esta oferta asignada."
      const desc = `Oferta "${o.name}" [${o.category}]\n${diff.join("\n")}\n\n${impact}`
      if (!a.confirmar) return text(`${desc}${NO_CHANGES}`)
      await updateServiceOffer(o.id, offerFormData(o, patch), actingProfileId)
      return text(`✅ Oferta actualizada.\n${desc}`)
    },
  )

  server.registerTool(
    "duplicar_oferta",
    {
      title: "Duplicar oferta (crear variante)",
      description: "Crea una copia de una oferta como variante: mismos campos, entregables (con ids nuevos), add-ons y tipo de proyecto, con el nombre nuevo. Por defecto la copia \"deriva de\" la original (igual que crear variante en el dashboard) y no es base. Puedes cambiar campos en el mismo paso (precio, categoría, etc.). Sin confirmar: true solo muestra lo que crearía. Solo admin/subadmin.",
      inputSchema: z.object({
        oferta: z.string().min(1).describe("Oferta a copiar"),
        nuevo_nombre: z.string().min(1),
        derivar_de_original: z.boolean().default(true),
        ...OfferFields,
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const actingProfileId = await requireOfferManager(ctx)
      const src = await findOffer(a.oferta)
      const patch: Partial<Offer> = {
        name: a.nuevo_nombre.trim(),
        is_base: false,
        based_on_offer_id: a.derivar_de_original ? src.id : src.based_on_offer_id,
        sort_order: null,
        // Copiar los campos de la migración 123 que tenga la original.
        ...(src.recommended_ad_budget != null ? { recommended_ad_budget: src.recommended_ad_budget } : {}),
        ...(src.recommended_ad_budget_note ? { recommended_ad_budget_note: src.recommended_ad_budget_note } : {}),
        ...(src.cycle_count != null ? { cycle_count: src.cycle_count } : {}),
        ...(src.cycle_length_days != null ? { cycle_length_days: src.cycle_length_days } : {}),
        ...(await buildPatch(a)),
      }
      // La copia no hereda el orden manual (queda al final) salvo que se indique.
      if (a.orden === undefined) delete patch.sort_order
      const copy: Offer = { ...src, ...patch, sort_order: patch.sort_order ?? null, id: "", status: "active" }
      const dels = normDels(src).map((d) => ({ ...d, id: crypto.randomUUID(), added_at: null }))
      const { data: addonRows } = await db().from("service_offer_addons").select("addon_id, addon:service_addons(name)").eq("offer_id", src.id)
      const addonIds = (addonRows ?? []).map((r) => r.addon_id as string)
      const { data: dup } = await db().from("service_offers").select("name, status").ilike("name", copy.name).limit(1)
      const names = { offers: await namesById([copy.based_on_offer_id], "service_offers"), types: await namesById([copy.default_project_type_id], "project_types") }
      const lines = await Promise.all(FIELDS.filter(([k]) => copy[k] != null && copy[k] !== "" && k !== "currency").map(async ([k, label]) => `${label}: ${await fieldValue(k, copy, names)}`))
      const desc = `Copia de "${src.name}":\n${lines.join("\n")}\nEntregables: ${dels.length} · Add-ons: ${addonIds.length}`
      if (!a.confirmar) return text(`Crearía:\n${desc}${dup?.length ? `\n⚠️ Ya existe "${dup[0].name}"${dup[0].status === "archived" ? " (archivada)" : ""}.` : ""}${NO_CHANGES}`)
      const created = await createServiceOffer(offerFormData(copy, patch, dels), actingProfileId)
      if (addonIds.length) await setOfferAddons(created.id, addonIds, actingProfileId)
      return text(`✅ Variante creada (id ${created.id}).\n${desc}`)
    },
  )

  server.registerTool(
    "oferta_entregables",
    {
      title: "Editar entregables de una oferta",
      description: "Agrega, edita, quita o mueve líneas de entregables de una oferta del catálogo (texto de venta, texto de control, cadencia, cantidad). Cadencias: una_vez (hito único), por_periodo (cada periodo del proyecto: su ciclo o mes), cada_3_periodos, cada_6_periodos, continuo (sin cantidad). Las líneas se indican por número (de detalle_oferta) o por parte de su texto. En los proyectos que ya tienen la oferta, las líneas nuevas cuentan desde hoy y las quitadas conservan su historial en periodos pasados. Sin confirmar: true solo muestra antes → después. Solo admin/subadmin.",
      inputSchema: z.object({
        oferta: z.string().min(1),
        cambios: z.array(z.object({
          accion: z.enum(["agregar", "editar", "quitar", "mover"]),
          linea: z.string().optional().describe("Número de línea o parte de su texto (editar/quitar/mover)"),
          texto: z.string().optional(), control: z.string().optional(),
          cadencia: Linea.shape.cadencia, cantidad: z.number().int().nonnegative().optional().describe("0 para quitar la cantidad"),
          posicion: z.number().int().positive().optional().describe("agregar/mover: posición destino (1 = primera)"),
        })).min(1).max(40),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ oferta, cambios, confirmar }, ctx: ToolCtx) => {
      const actingProfileId = await requireOfferManager(ctx)
      const o = await findOffer(oferta)
      const before = normDels(o)
      const list = before.map((d) => ({ ...d }))
      const find = (ref?: string) => {
        if (!ref?.trim()) throw new Error("Falta indicar la línea.")
        if (/^\d+$/.test(ref.trim())) { const d = list[Number(ref) - 1]; if (!d) throw new Error(`No hay línea ${ref}.`); return d }
        const q = ref.trim().toLowerCase()
        const hits = list.filter((d) => d.text.toLowerCase().includes(q) || (d.control_text ?? "").toLowerCase().includes(q))
        if (hits.length !== 1) throw new Error(hits.length ? `"${ref}" coincide con varias líneas; usa el número.` : `No encontré la línea "${ref}".`)
        return hits[0]
      }
      for (const c of cambios) {
        if (c.accion === "agregar") {
          if (!c.texto?.trim()) throw new Error("Para agregar hace falta el texto de venta.")
          const d = toDel({ texto: c.texto, control: c.control, cadencia: c.cadencia, cantidad: c.cantidad || undefined })
          list.splice(c.posicion ? Math.min(c.posicion - 1, list.length) : list.length, 0, d)
        } else if (c.accion === "editar") {
          const d = find(c.linea)
          if (c.texto != null) d.text = c.texto.trim()
          if (c.control != null) d.control_text = c.control.trim() || null
          if (c.cadencia) d.cadence = CADENCIA[c.cadencia]
          if (c.cantidad != null) d.quantity = c.cantidad || null
          if (d.cadence === "continuous") d.quantity = null
        } else if (c.accion === "quitar") {
          const d = find(c.linea); list.splice(list.indexOf(d), 1)
        } else {
          const d = find(c.linea); if (!c.posicion) throw new Error("Para mover indica la posición.")
          list.splice(list.indexOf(d), 1); list.splice(Math.min(c.posicion - 1, list.length), 0, d)
        }
      }
      const projects = await projectsUsing(o.id)
      const desc = `Oferta "${o.name}"\nAntes (${before.length}):\n${before.map(fmtDel).join("\n") || "(sin entregables)"}\n\nDespués (${list.length}):\n${list.map(fmtDel).join("\n") || "(sin entregables)"}` +
        (projects.length ? `\n\nEn ${projects.length} proyecto(s) con esta oferta: las líneas nuevas cuentan desde hoy; las quitadas conservan su historial.` : "")
      if (!confirmar) return text(`${desc}${NO_CHANGES}`)
      await updateServiceOffer(o.id, offerFormData(o, {}, list), actingProfileId)
      return text(`✅ Entregables actualizados.\n${desc}`)
    },
  )

  const archiveTool = (archivar: boolean) => async ({ oferta }: { oferta: string }, ctx: ToolCtx) => {
    const actingProfileId = await requireOfferManager(ctx)
    const o = await findOffer(oferta)
    if (archivar && o.status === "archived") return text(`"${o.name}" ya estaba archivada.`)
    if (!archivar && o.status === "active") return text(`"${o.name}" ya estaba activa.`)
    await archiveServiceOffer(o.id, archivar, actingProfileId)
    const projects = await projectsUsing(o.id)
    return text(`✅ Oferta "${o.name}" ${archivar ? "archivada" : "desarchivada (activa de nuevo)"}.${archivar && projects.length ? `\nLos ${projects.length} proyecto(s) que la tienen la conservan con sus entregables; solo deja de ofrecerse en el catálogo.` : ""}`)
  }
  server.registerTool(
    "archivar_oferta",
    {
      title: "Archivar oferta",
      description: "Archiva una oferta del catálogo (deja de mostrarse como activa). Los proyectos que ya la tienen la conservan. Para revertir: desarchivar_oferta. Solo admin/subadmin.",
      inputSchema: z.object({ oferta: z.string().min(1) }),
    },
    archiveTool(true),
  )
  server.registerTool(
    "desarchivar_oferta",
    {
      title: "Desarchivar oferta",
      description: "Reactiva una oferta archivada del catálogo. Solo admin/subadmin.",
      inputSchema: z.object({ oferta: z.string().min(1) }),
    },
    archiveTool(false),
  )

  server.registerTool(
    "ordenar_ofertas",
    {
      title: "Ordenar ofertas de una categoría",
      description: "Define el orden manual de las ofertas dentro de una categoría (el que se ve en Servicios y en listar_ofertas): pasa los nombres en el orden deseado. Las no mencionadas quedan después, en su orden actual. Sin confirmar: true solo muestra el orden resultante. Solo admin/subadmin.",
      inputSchema: z.object({
        categoria: z.string().min(1),
        orden: z.array(z.string().min(1)).min(1).describe("Nombres (exactos o parte) en el orden deseado"),
        incluir_archivadas: z.boolean().default(false),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const actingProfileId = await requireOfferManager(ctx)
      let q = db().from("service_offers").select("*").ilike("category", a.categoria.trim())
      if (!a.incluir_archivadas) q = q.eq("status", "active")
      const { data } = await q
      const rows = ((data ?? []) as Offer[]).sort((x, y) => (x.sort_order ?? Infinity) - (y.sort_order ?? Infinity) || Number(y.is_base) - Number(x.is_base) || x.name.localeCompare(y.name, "es"))
      if (!rows.length) throw new Error(`No hay ofertas${a.incluir_archivadas ? "" : " activas"} en la categoría "${a.categoria}".`)
      const picked: Offer[] = []
      for (const n of a.orden) {
        const s = n.trim().toLowerCase()
        const exact = rows.filter((o) => o.name.toLowerCase() === s)
        const hits = exact.length ? exact : rows.filter((o) => o.name.toLowerCase().includes(s))
        if (hits.length !== 1) throw new Error(hits.length ? `"${n}" coincide con varias ofertas de la categoría: ${hits.map((o) => o.name).join(", ")}.` : `No encontré "${n}" en ${rows[0].category}.`)
        if (picked.includes(hits[0])) throw new Error(`"${hits[0].name}" está repetida en el orden.`)
        picked.push(hits[0])
      }
      const final = [...picked, ...rows.filter((o) => !picked.includes(o))]
      const desc = `${rows[0].category} — orden:\n${final.map((o, i) => `${i + 1}. ${o.name}${o.status === "archived" ? " (archivada)" : ""}`).join("\n")}`
      if (!a.confirmar) return text(`${desc}${NO_CHANGES}`)
      for (const [i, o] of final.entries()) {
        if (o.sort_order === i + 1) continue
        await updateServiceOffer(o.id, offerFormData(o, { sort_order: i + 1 }), actingProfileId)
      }
      return text(`✅ Orden guardado.\n${desc}`)
    },
  )

  server.registerTool(
    "listar_addons",
    {
      title: "Listar add-ons",
      description: "Add-ons (upsells) del catálogo con su precio y a qué ofertas están ligados. Solo admin/subadmin.",
      inputSchema: z.object({ incluir_archivados: z.boolean().default(false) }),
    },
    async ({ incluir_archivados }, ctx: ToolCtx) => {
      await requireOfferManager(ctx)
      let q = db().from("service_addons").select("id, name, description, price, currency, price_note, status, offers:service_offer_addons(offer:service_offers(name))").order("name")
      if (!incluir_archivados) q = q.eq("status", "active")
      const { data, error } = await q
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as { name: string; description: string | null; price: number | null; currency: string; price_note: string | null; status: string; offers: { offer: { name: string } | null }[] }[]
      if (!rows.length) return text("No hay add-ons.")
      return text(rows.map((r) => `- ${r.name} · ${money(r.price, r.currency) ?? r.price_note ?? "sin precio"}${r.status === "archived" ? " · ARCHIVADO" : ""}${r.description ? `\n  ${r.description}` : ""}\n  En ofertas: ${r.offers.map((x) => x.offer?.name).filter(Boolean).join(", ") || "ninguna"}`).join("\n"))
    },
  )

  server.registerTool(
    "oferta_addons",
    {
      title: "Add-ons de una oferta",
      description: "Vincula o desvincula add-ons existentes de una oferta (el \"+ Addons\" de la tarjeta). agregar/quitar por nombre; reemplazar fija la lista completa. Sin confirmar: true solo muestra antes → después. Solo admin/subadmin.",
      inputSchema: z.object({
        oferta: z.string().min(1),
        agregar: z.array(z.string()).optional(),
        quitar: z.array(z.string()).optional(),
        reemplazar: z.array(z.string()).optional().describe("Lista final completa (ignora agregar/quitar)"),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const actingProfileId = await requireOfferManager(ctx)
      const o = await findOffer(a.oferta)
      const { data: cur } = await db().from("service_offer_addons").select("addon_id, addon:service_addons(name)").eq("offer_id", o.id)
      const current = ((cur ?? []) as unknown as { addon_id: string; addon: { name: string } | null }[]).map((r) => ({ id: r.addon_id, name: r.addon?.name ?? r.addon_id }))
      let next = current
      if (a.reemplazar) next = await findAddons(a.reemplazar)
      else {
        const add = a.agregar?.length ? await findAddons(a.agregar) : []
        const rem = new Set((a.quitar?.length ? await findAddons(a.quitar) : []).map((x) => x.id))
        next = [...current.filter((x) => !rem.has(x.id)), ...add.filter((x) => !current.some((c) => c.id === x.id))]
      }
      const desc = `Oferta "${o.name}" — add-ons:\nAntes: ${current.map((x) => x.name).join(", ") || "ninguno"}\nDespués: ${next.map((x) => x.name).join(", ") || "ninguno"}`
      if (!a.confirmar) return text(`${desc}${NO_CHANGES}`)
      await setOfferAddons(o.id, next.map((x) => x.id), actingProfileId)
      return text(`✅ Add-ons actualizados.\n${desc}`)
    },
  )
}
