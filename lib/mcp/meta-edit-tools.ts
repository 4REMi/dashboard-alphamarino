import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { client, get, post, own, log, text, requireEditor, confirmHint, cleanStoryForCopy, type ToolCtx } from "@/lib/mcp/meta-tools"

// Modificar lo que ya existe en Meta: contenido de un anuncio (texto,
// título, CTA, URL/UTMs o el video/imagen), intereses y públicos para la
// segmentación, y fechas/presupuesto total/puja. Mismas reglas: solo
// admin/subadmin, dos pasos, verificación de cuenta, bitácora.

const ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/`
const db = () => createAdminClient()
const CTAS = ["LEARN_MORE", "SIGN_UP", "BOOK_TRAVEL", "BOOK_NOW", "CONTACT_US", "GET_QUOTE", "APPLY_NOW", "SHOP_NOW", "SUBSCRIBE", "WHATSAPP_MESSAGE", "MESSAGE_PAGE", "CALL_NOW", "GET_OFFER"] as const

async function uploadImage(act: string, url: string): Promise<string> {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const r = await post(`${act}/adimages`, { bytes: buf.toString("base64") }) as { images?: Record<string, { hash: string }> }
  const h = Object.values(r.images ?? {})[0]?.hash
  if (!h) throw new Error("Meta no regresó el hash de la imagen")
  return h
}

// Sube un video y espera (máx. ~90 s) a que Meta lo procese.
async function uploadVideo(act: string, url: string, name: string): Promise<{ id: string; picture: string | null }> {
  const v = await post(`${act}/advideos`, { file_url: url, name }) as { id: string }
  for (let i = 0; i < 18; i++) {
    const st = await get<{ status?: { video_status?: string }; picture?: string }>(v.id, { fields: "status,picture" }).catch(() => null)
    if (st?.status?.video_status === "ready") return { id: v.id, picture: st.picture ?? null }
    if (st?.status?.video_status === "error") throw new Error("Meta no pudo procesar el video")
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error("El video sigue procesándose en Meta; intenta de nuevo en un minuto.")
}

const clip = (s: string | null | undefined, n = 140) => (s ? (s.length > n ? s.slice(0, n) + "…" : s) : "—")

export function registerMetaEditTools(server: McpServer) {
  server.registerTool(
    "meta_editar_anuncio",
    {
      title: "Meta: editar anuncio",
      description: "Cambia el contenido de un anuncio existente: texto principal, título, CTA, URL de destino, parámetros UTM y/o el video o imagen (asset_id del Creative Tracker). Solo cambia lo indicado. Meta no edita creativos: se crea uno igual con los cambios y se asigna al anuncio (vuelve a revisión; las estadísticas se conservan). Sin confirmar: true solo muestra antes → después.",
      inputSchema: z.object({
        proyecto: z.string(),
        ad_id: z.string(),
        texto: z.string().min(1).optional(),
        titulo: z.string().optional(),
        cta: z.enum(CTAS).optional(),
        url: z.string().url().optional(),
        url_tags: z.string().optional().describe("Parámetros sin '?', ej. utm_source=meta&utm_campaign={{campaign.name}}. Cadena vacía para quitarlos"),
        asset_id: z.string().optional().describe("Reemplaza el video/imagen por este creativo del Creative Tracker"),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      const c = await client(a.proyecto)
      const o = await own(c, a.ad_id)
      if (o.kind !== "anuncio") throw new Error("ad_id no es un anuncio.")
      if ([a.texto, a.titulo, a.cta, a.url, a.url_tags, a.asset_id].every((x) => x == null)) throw new Error("No indicaste nada que cambiar.")
      const ad = await get<{ creative?: { id: string } }>(a.ad_id, { fields: "creative{id}" })
      if (!ad.creative?.id) throw new Error("El anuncio no tiene creativo.")
      const cr = await get<{ name?: string; object_story_spec?: Record<string, any>; asset_feed_spec?: unknown; url_tags?: string }>(ad.creative.id, { fields: "name,object_story_spec,asset_feed_spec,url_tags" })
      const spec = JSON.parse(JSON.stringify(cr.object_story_spec ?? {})) as Record<string, any>
      const key = spec.video_data ? "video_data" : spec.link_data ? "link_data" : null
      if (!key) throw new Error(cr.asset_feed_spec ? "Es un anuncio dinámico (varias versiones): edítalo en Ads Manager." : "Este anuncio usa una publicación existente: su contenido se edita en la publicación.")
      const d = spec[key]
      const before = { texto: d.message ?? null, titulo: (key === "video_data" ? d.title : d.name) ?? null, cta: d.call_to_action?.type ?? null, url: (key === "link_data" ? d.link : null) ?? d.call_to_action?.value?.link ?? null, tags: cr.url_tags ?? null }

      // Media nueva (se sube solo al confirmar).
      let asset: { id: string; file_type: string | null; file_path: string | null; thumbnail_path: string | null; asset_url: string | null; project_id: string } | null = null
      let newIsVideo = false
      if (a.asset_id) {
        const { data } = await db().from("creative_assets").select("id, project_id, file_type, file_path, thumbnail_path, asset_url").eq("id", a.asset_id).single()
        if (!data || data.project_id !== c.projectId) throw new Error("Ese asset no es de este proyecto.")
        asset = data
        const f = asset.file_path ? ASSET_BASE + asset.file_path : asset.asset_url
        if (!f) throw new Error("El asset no tiene archivo.")
        newIsVideo = asset.file_type === "video" || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(f)
      }

      const after = {
        texto: a.texto ?? before.texto, titulo: a.titulo ?? before.titulo, cta: a.cta ?? before.cta,
        url: a.url ?? before.url, tags: a.url_tags != null ? a.url_tags || null : before.tags,
      }
      const row = (k: string, b: string | null, n: string | null) => `  ${k}: ${b === n ? clip(b) : `${clip(b)} → ${clip(n)}`}`
      const desc = [`"${o.name}" [${o.id}]`, row("Texto", before.texto, after.texto), row("Título", before.titulo, after.titulo), row("CTA", before.cta, after.cta), row("URL", before.url, after.url), row("UTMs", before.tags, after.tags),
        asset ? `  ${key === "video_data" ? "Video" : "Imagen"} → ${newIsVideo ? "video" : "imagen"} del Creative Tracker [${asset.id}]` : ""].filter(Boolean).join("\n")
      if (!a.confirmar) return text(`Cambiaría en ${c.name}:\n${desc}\n\nEl anuncio vuelve a revisión de Meta.${confirmHint}`)

      const act = `act_${c.account}`
      // Si cambia el tipo de media, se rearma el bloque correspondiente.
      let target = key
      let block: Record<string, any> = d
      if (asset) {
        const fileUrl = (asset.file_path ? ASSET_BASE + asset.file_path : asset.asset_url)!
        const thumb = asset.thumbnail_path ? ASSET_BASE + asset.thumbnail_path : null
        const common = { message: d.message, call_to_action: d.call_to_action, ...(d.page_welcome_message ? { page_welcome_message: d.page_welcome_message } : {}) }
        if (newIsVideo) {
          const v = await uploadVideo(act, fileUrl, o.name)
          block = { ...common, video_id: v.id, ...(before.titulo ? { title: before.titulo } : {}), ...(thumb ? { image_hash: await uploadImage(act, thumb) } : v.picture ? { image_url: v.picture } : {}) }
          target = "video_data"
        } else {
          block = { ...common, image_hash: await uploadImage(act, fileUrl), link: before.url ?? `https://facebook.com/${spec.page_id}`, ...(before.titulo ? { name: before.titulo } : {}) }
          target = "link_data"
        }
      }
      if (a.texto != null) block.message = a.texto
      if (a.titulo != null) { if (target === "video_data") block.title = a.titulo; else block.name = a.titulo }
      if (a.cta || a.url) {
        const v = { ...(block.call_to_action?.value ?? {}) }
        if (a.url) v.link = a.url
        block.call_to_action = { type: a.cta ?? block.call_to_action?.type ?? "LEARN_MORE", value: v }
        if (a.url && target === "link_data") block.link = a.url
      }
      const newSpec = { ...spec }
      delete newSpec.video_data; delete newSpec.link_data
      newSpec[target] = block
      cleanStoryForCopy(newSpec)
      const body: Record<string, string> = { name: `${cr.name ?? o.name} · editado ${new Date().toISOString().slice(0, 10)}`, object_story_spec: JSON.stringify(newSpec) }
      if (after.tags) body.url_tags = after.tags
      const creative = await post(`${act}/adcreatives`, body) as { id: string }
      await post(a.ad_id, { creative: JSON.stringify({ creative_id: creative.id }) })
      if (asset) await db().from("creative_asset_meta_ads").insert({ creative_asset_id: asset.id, project_id: c.projectId, meta_ad_id: a.ad_id, linked_by: profileId }).then(() => {}, () => {})
      await log(c, profileId, `Anuncio editado:\n${desc}`)
      return text(`✅ Anuncio actualizado (creativo nuevo ${creative.id}). Meta lo revisa de nuevo.\n${desc}`)
    },
  )

  server.registerTool(
    "meta_buscar_intereses",
    {
      title: "Meta: buscar intereses",
      description: "Busca intereses de segmentación por nombre (con tamaño de audiencia) para agregarlos con meta_editar_segmentacion.agregar_intereses.",
      inputSchema: z.object({ q: z.string().min(2), limite: z.number().min(1).max(25).default(10) }),
    },
    async ({ q, limite }, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const r = await get<{ data: { id: string; name: string; audience_size_lower_bound?: number; audience_size_upper_bound?: number; path?: string[]; topic?: string }[] }>("search", { type: "adinterest", q, limit: String(limite), locale: "es_LA" })
      if (!r.data.length) return text(`Sin intereses para "${q}".`)
      const n = (x?: number) => (x == null ? "?" : x >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : x >= 1e3 ? `${Math.round(x / 1e3)} mil` : String(x))
      return text(r.data.map((i) => `- ${i.name} [id ${i.id}] · ${n(i.audience_size_lower_bound)}–${n(i.audience_size_upper_bound)}${i.path?.length ? ` · ${i.path.join(" › ")}` : ""}`).join("\n"))
    },
  )

  server.registerTool(
    "meta_publicos",
    {
      title: "Meta: públicos de la cuenta",
      description: "Lista los públicos personalizados y similares (lookalike) de la cuenta del proyecto con su id, tipo y tamaño, para incluirlos o excluirlos con meta_editar_segmentacion.",
      inputSchema: z.object({ proyecto: z.string() }),
    },
    async ({ proyecto }, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const c = await client(proyecto)
      const r = await get<{ data: { id: string; name: string; subtype?: string; approximate_count_lower_bound?: number; approximate_count_upper_bound?: number; operation_status?: { description?: string } }[] }>(`act_${c.account}/customaudiences`, { fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,operation_status", limit: "100" })
      if (!r.data.length) return text(`${c.name} no tiene públicos personalizados.`)
      const label: Record<string, string> = { CUSTOM: "lista de clientes", WEBSITE: "visitantes del sitio", LOOKALIKE: "similar", ENGAGEMENT: "interacción", VIDEO: "vio videos", LEAD_GENERATION: "formularios", IG_BUSINESS: "Instagram", FB_EVENT: "evento", OFFLINE_CONVERSION: "offline" }
      return text(r.data.map((x) => `- ${x.name} [id ${x.id}] · ${label[x.subtype ?? ""] ?? x.subtype ?? "?"}${x.approximate_count_lower_bound != null ? ` · ${x.approximate_count_lower_bound.toLocaleString("es-MX")}+ personas` : ""}`).join("\n"))
    },
  )

  server.registerTool(
    "meta_programacion",
    {
      title: "Meta: fechas, presupuesto total y puja",
      description: "Cambia fecha de inicio/fin, presupuesto total (lifetime, requiere fecha de fin) y estrategia de puja de una campaña o conjunto. Puja: menor_costo (sin tope), costo_objetivo (cost cap, con monto) o tope_puja (bid cap, con monto); en CBO la estrategia va en la campaña y el monto en cada conjunto. Meta no permite pasar de presupuesto diario a total en un objeto ya creado. Sin confirmar: true solo muestra el cambio.",
      inputSchema: z.object({
        proyecto: z.string(),
        id: z.string().describe("Campaña o conjunto"),
        inicio: z.string().optional().describe("ISO, ej. 2026-10-20T09:00:00-06:00 (o YYYY-MM-DD)"),
        fin: z.string().optional().describe("ISO o YYYY-MM-DD; cadena vacía para quitar la fecha de fin"),
        presupuesto_total: z.number().positive().optional(),
        estrategia_puja: z.enum(["menor_costo", "costo_objetivo", "tope_puja"]).optional(),
        monto_puja: z.number().positive().optional().describe("En la moneda de la cuenta; para costo_objetivo/tope_puja en conjuntos"),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      const c = await client(a.proyecto)
      const o = await own(c, a.id)
      if (o.kind === "anuncio") throw new Error("La programación y la puja van en la campaña o el conjunto.")
      const cur = await get<Record<string, string>>(o.id, { fields: o.kind === "campaña" ? "start_time,stop_time,lifetime_budget,daily_budget,bid_strategy" : "start_time,end_time,lifetime_budget,daily_budget,bid_strategy,bid_amount" })
      const endField = o.kind === "campaña" ? "stop_time" : "end_time"
      const iso = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s)
      const body: Record<string, string> = {}
      const lines: string[] = []
      if (a.inicio) { body.start_time = iso(a.inicio); lines.push(`Inicio: ${cur.start_time ?? "—"} → ${body.start_time}`) }
      if (a.fin != null) { body[endField] = a.fin ? iso(a.fin) : ""; lines.push(`Fin: ${cur[endField] ?? "sin fin"} → ${a.fin ? body[endField] : "sin fin"}`) }
      if (a.presupuesto_total) {
        if (cur.daily_budget && !cur.lifetime_budget) throw new Error("Este objeto usa presupuesto diario; Meta no permite cambiarlo a total. Duplícalo o crea uno nuevo con presupuesto total.")
        if (!cur[endField] && !a.fin) throw new Error("El presupuesto total requiere fecha de fin (agrega `fin`).")
        body.lifetime_budget = String(Math.round(a.presupuesto_total * 100))
        lines.push(`Presupuesto total: ${cur.lifetime_budget ? Number(cur.lifetime_budget) / 100 : "—"} → ${a.presupuesto_total} ${c.currency}`)
      }
      if (a.estrategia_puja) {
        const map = { menor_costo: "LOWEST_COST_WITHOUT_CAP", costo_objetivo: "COST_CAP", tope_puja: "LOWEST_COST_WITH_BID_CAP" } as const
        body.bid_strategy = map[a.estrategia_puja]
        lines.push(`Puja: ${cur.bid_strategy ?? "—"} → ${body.bid_strategy}`)
        if (a.estrategia_puja !== "menor_costo" && o.kind === "conjunto" && !a.monto_puja && !cur.bid_amount) throw new Error("Costo objetivo / tope de puja necesitan monto_puja.")
      }
      if (a.monto_puja) {
        if (o.kind === "campaña") throw new Error("El monto de puja va en cada conjunto (bid_amount), no en la campaña.")
        body.bid_amount = String(Math.round(a.monto_puja * 100))
        lines.push(`Monto de puja: ${cur.bid_amount ? Number(cur.bid_amount) / 100 : "—"} → ${a.monto_puja} ${c.currency}`)
      }
      if (!lines.length) throw new Error("No indicaste nada que cambiar.")
      const desc = `${o.kind} "${o.name}" [${o.id}]\n  ${lines.join("\n  ")}`
      if (!a.confirmar) return text(`Cambiaría en ${c.name}:\n${desc}${confirmHint}`)
      await post(o.id, body)
      await log(c, profileId, `Programación/puja: ${desc}`)
      return text(`✅ Hecho en Meta.\n${desc}`)
    },
  )
}
