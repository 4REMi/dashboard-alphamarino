import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { client, get, post, own, log, text, requireEditor, confirmHint, type ToolCtx } from "@/lib/mcp/meta-tools"

// Crear desde cero en Meta: campaña → conjunto → anuncio (con un creativo
// del Creative Tracker). Mismas reglas que meta-tools.ts: solo admin/
// subadmin, dos pasos (sin `confirmar: true` solo describe), todo se crea
// PAUSADO, cada objeto se verifica contra la cuenta del proyecto y queda
// en la bitácora. El anuncio creado se vincula a su asset (y concepto).

const ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/`
const db = () => createAdminClient()

const OBJECTIVES = {
  leads: "OUTCOME_LEADS", mensajes: "OUTCOME_ENGAGEMENT", trafico: "OUTCOME_TRAFFIC",
  ventas: "OUTCOME_SALES", interaccion: "OUTCOME_ENGAGEMENT", reconocimiento: "OUTCOME_AWARENESS",
} as const
type Objetivo = keyof typeof OBJECTIVES

const CTAS = ["LEARN_MORE", "SIGN_UP", "BOOK_TRAVEL", "BOOK_NOW", "CONTACT_US", "GET_QUOTE", "APPLY_NOW", "SHOP_NOW", "SUBSCRIBE", "WHATSAPP_MESSAGE", "MESSAGE_PAGE", "CALL_NOW", "GET_OFFER"] as const

const toMinor = (n: number) => String(Math.round(n * 100))

// POST con un reintento si Meta pide is_adset_budget_sharing_enabled (campañas sin CBO en versiones nuevas).
async function postRetry(path: string, body: Record<string, string>) {
  try { return await post(path, body) }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/is_adset_budget_sharing_enabled/i.test(msg) && !body.is_adset_budget_sharing_enabled) return post(path, { ...body, is_adset_budget_sharing_enabled: "false" })
    throw e
  }
}

export function registerMetaCreateTools(server: McpServer) {
  server.registerTool(
    "meta_activos_cuenta",
    {
      title: "Meta: páginas, Instagram, pixeles y formularios",
      description: "Lista lo que se necesita para crear anuncios en la cuenta del proyecto: páginas de Facebook (con su cuenta de Instagram), pixeles y formularios instantáneos. Úsalo antes de meta_crear_conjunto / meta_crear_anuncio. Solo admin/subadmin.",
      inputSchema: z.object({ proyecto: z.string() }),
    },
    async ({ proyecto }, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const c = await client(proyecto)
      const [pages, pixels] = await Promise.all([
        get<{ data: { id: string; name: string; instagram_business_account?: { id: string; username?: string } }[] }>(`act_${c.account}/promote_pages`, { fields: "id,name,instagram_business_account{id,username}", limit: "50" }).catch(() => ({ data: [] })),
        get<{ data: { id: string; name: string }[] }>(`act_${c.account}/adspixels`, { fields: "id,name", limit: "50" }).catch(() => ({ data: [] })),
      ])
      const lines = [`${c.name} · act_${c.account}`, "\nPáginas:"]
      for (const p of pages.data) {
        lines.push(`- ${p.name} [page_id ${p.id}]${p.instagram_business_account ? ` · Instagram @${p.instagram_business_account.username ?? ""} [instagram_id ${p.instagram_business_account.id}]` : " · sin Instagram vinculado"}`)
        const forms = await get<{ data: { id: string; name: string; status: string }[] }>(`${p.id}/leadgen_forms`, { fields: "id,name,status", limit: "25" }).catch(() => null)
        for (const f of forms?.data ?? []) if (f.status === "ACTIVE") lines.push(`   · formulario "${f.name}" [form_id ${f.id}]`)
      }
      if (!pages.data.length) lines.push("- (ninguna — revisa que el usuario del sistema tenga acceso a la página)")
      lines.push("\nPixeles:", ...(pixels.data.length ? pixels.data.map((p) => `- ${p.name} [pixel_id ${p.id}]`) : ["- (ninguno)"]))
      return text(lines.join("\n"))
    },
  )

  server.registerTool(
    "creativos_listos",
    {
      title: "Creativos del Creative Tracker",
      description: "Creativos (versión vigente) de un proyecto con su asset_id, concepto, tipo, estado con el cliente y si ya están vinculados a un anuncio de Meta. Para elegir qué subir con meta_crear_anuncio.",
      inputSchema: z.object({ proyecto: z.string(), concepto: z.string().optional() }),
    },
    async ({ proyecto, concepto }, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const c = await client(proyecto)
      const { data } = await db().from("creative_assets")
        .select("id, file_type, format, client_status, revises_asset_id, created_at, concept:creative_concepts(name), links:creative_asset_meta_ads(meta_ad_id)")
        .eq("project_id", c.projectId).order("created_at", { ascending: false }).limit(200)
      const rows = (data ?? []) as unknown as { id: string; file_type: string | null; format: string | null; client_status: string | null; revises_asset_id: string | null; concept: { name: string | null } | null; links: { meta_ad_id: string }[] }[]
      const replaced = new Set(rows.map((r) => r.revises_asset_id).filter(Boolean))
      const current = rows.filter((r) => !replaced.has(r.id) && (!concepto || (r.concept?.name ?? "").toLowerCase().includes(concepto.toLowerCase())))
      if (!current.length) return text("No hay creativos que coincidan.")
      const st: Record<string, string> = { approved: "aprobado", changes_requested: "cambios pedidos", pending_review: "pendiente del cliente" }
      return text(current.map((r) => `- [asset_id ${r.id}] ${r.concept?.name ?? "Sin concepto"} · ${r.file_type ?? "?"}${r.format ? ` ${r.format}` : ""} · ${st[r.client_status ?? ""] ?? "borrador"}${r.links?.length ? ` · ya en Meta (${r.links.length})` : ""}`).join("\n"))
    },
  )

  server.registerTool(
    "meta_crear_campana",
    {
      title: "Meta: crear campaña",
      description: "Crea una campaña PAUSADA. Con presupuesto_diario = CBO (presupuesto en la campaña); sin él = ABO (presupuesto en cada conjunto). Inmobiliarias, empleo o crédito deben usar categoria_especial. Sin confirmar: true solo muestra el plan.",
      inputSchema: z.object({
        proyecto: z.string(),
        nombre: z.string().min(3).describe("Con la convención, ej. CLIENTE | LÍNEA | PRUEBA"),
        objetivo: z.enum(["leads", "mensajes", "trafico", "ventas", "interaccion", "reconocimiento"]),
        presupuesto_diario: z.number().positive().optional().describe("En la moneda de la cuenta; solo para CBO"),
        categoria_especial: z.enum(["ninguna", "vivienda", "empleo", "credito"]).default("ninguna"),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ proyecto, nombre, objetivo, presupuesto_diario, categoria_especial, confirmar }, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      const c = await client(proyecto)
      const cat = { ninguna: [], vivienda: ["HOUSING"], empleo: ["EMPLOYMENT"], credito: ["CREDIT"] }[categoria_especial]
      const desc = `Campaña "${nombre}" · objetivo ${objetivo} · ${presupuesto_diario ? `CBO ${presupuesto_diario} ${c.currency}/día` : "ABO (presupuesto en conjuntos)"}${cat.length ? ` · categoría especial ${categoria_especial}` : ""} · PAUSADA`
      if (!confirmar) return text(`Crearía en ${c.name}:\n- ${desc}${confirmHint}`)
      const body: Record<string, string> = { name: nombre, objective: OBJECTIVES[objetivo as Objetivo], status: "PAUSED", special_ad_categories: JSON.stringify(cat) }
      if (presupuesto_diario) { body.daily_budget = toMinor(presupuesto_diario); body.bid_strategy = "LOWEST_COST_WITHOUT_CAP" }
      const r = await postRetry(`act_${c.account}/campaigns`, body)
      await log(c, profileId, `Campaña creada (pausada): ${desc} · id ${r.id}`)
      return text(`✅ Campaña creada pausada [campaign_id ${r.id}]. Siguiente: meta_crear_conjunto.`)
    },
  )

  server.registerTool(
    "meta_crear_conjunto",
    {
      title: "Meta: crear conjunto",
      description: "Crea un conjunto PAUSADO en una campaña. La optimización sale del objetivo de la campaña: leads (formulario instantáneo con page_id, o sitio con pixel_id), mensajes (whatsapp/messenger/instagram con page_id), trafico (clics), ventas (pixel_id), interaccion, reconocimiento. Audiencia amplia por defecto (país + edad). Presupuesto solo si la campaña es ABO. Sin confirmar: true solo muestra el plan.",
      inputSchema: z.object({
        proyecto: z.string(),
        campana_id: z.string(),
        nombre: z.string().min(3),
        presupuesto_diario: z.number().positive().optional().describe("Solo si la campaña es ABO"),
        paises: z.array(z.string().length(2)).default(["MX"]).describe("Códigos ISO, ej. MX, US"),
        ciudades: z.array(z.object({ key: z.string(), radio_km: z.number().optional() })).optional().describe("Claves de ciudad de Meta (si las conoces); reemplaza a paises"),
        edad_min: z.number().min(18).max(65).default(18),
        edad_max: z.number().min(18).max(65).default(65),
        destino: z.enum(["formulario", "sitio", "whatsapp", "messenger", "instagram"]).optional().describe("Para leads: formulario|sitio. Para mensajes: whatsapp|messenger|instagram"),
        page_id: z.string().optional(),
        pixel_id: z.string().optional(),
        evento_pixel: z.enum(["LEAD", "PURCHASE", "COMPLETE_REGISTRATION", "SCHEDULE", "CONTACT"]).optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      const c = await client(a.proyecto)
      const camp = await own(c, a.campana_id)
      if (camp.kind !== "campaña") throw new Error("campana_id no es una campaña.")
      const { objective } = await get<{ objective: string }>(camp.id, { fields: "objective" })
      const cbo = !!(camp.daily_budget || camp.lifetime_budget)
      if (cbo && a.presupuesto_diario) throw new Error("La campaña es CBO: el presupuesto vive en la campaña; quita presupuesto_diario.")
      if (!cbo && !a.presupuesto_diario) throw new Error("La campaña es ABO: indica presupuesto_diario para el conjunto.")

      const body: Record<string, string> = { name: a.nombre, campaign_id: camp.id, status: "PAUSED", billing_event: "IMPRESSIONS", start_time: new Date().toISOString() }
      let opt = ""
      if (objective === "OUTCOME_LEADS") {
        if (a.destino === "sitio") {
          if (!a.pixel_id) throw new Error("Leads en sitio requiere pixel_id (meta_activos_cuenta).")
          opt = "OFFSITE_CONVERSIONS"; body.promoted_object = JSON.stringify({ pixel_id: a.pixel_id, custom_event_type: a.evento_pixel ?? "LEAD" })
        } else {
          if (!a.page_id) throw new Error("Leads con formulario requiere page_id (meta_activos_cuenta).")
          opt = "LEAD_GENERATION"; body.destination_type = "ON_AD"; body.promoted_object = JSON.stringify({ page_id: a.page_id })
        }
      } else if (objective === "OUTCOME_ENGAGEMENT" && a.destino && ["whatsapp", "messenger", "instagram"].includes(a.destino)) {
        if (!a.page_id) throw new Error("Mensajes requiere page_id.")
        opt = "CONVERSATIONS"; body.destination_type = { whatsapp: "WHATSAPP", messenger: "MESSENGER", instagram: "INSTAGRAM_DIRECT" }[a.destino as "whatsapp"]
        body.promoted_object = JSON.stringify({ page_id: a.page_id })
      } else if (objective === "OUTCOME_SALES") {
        if (!a.pixel_id) throw new Error("Ventas requiere pixel_id.")
        opt = "OFFSITE_CONVERSIONS"; body.promoted_object = JSON.stringify({ pixel_id: a.pixel_id, custom_event_type: a.evento_pixel ?? "PURCHASE" })
      } else if (objective === "OUTCOME_TRAFFIC") { opt = "LINK_CLICKS" }
      else if (objective === "OUTCOME_AWARENESS") { opt = "REACH" }
      else { opt = "POST_ENGAGEMENT" }
      body.optimization_goal = opt
      const geo = a.ciudades?.length
        ? { cities: a.ciudades.map((x) => ({ key: x.key, radius: x.radio_km ?? 25, distance_unit: "kilometer" })) }
        : { countries: a.paises }
      body.targeting = JSON.stringify({ geo_locations: geo, age_min: a.edad_min, age_max: a.edad_max, targeting_automation: { advantage_audience: 1 } })
      if (a.presupuesto_diario) { body.daily_budget = toMinor(a.presupuesto_diario); body.bid_strategy = "LOWEST_COST_WITHOUT_CAP" }

      const desc = `Conjunto "${a.nombre}" en "${camp.name}" · optimiza ${opt}${a.destino ? ` (${a.destino})` : ""} · ${a.ciudades?.length ? `${a.ciudades.length} ciudad(es)` : a.paises.join(", ")} · ${a.edad_min}-${a.edad_max} años · audiencia Advantage+ · ${a.presupuesto_diario ? `${a.presupuesto_diario} ${c.currency}/día` : "presupuesto de la campaña (CBO)"} · PAUSADO`
      if (!a.confirmar) return text(`Crearía en ${c.name}:\n- ${desc}${confirmHint}`)
      const r = await post(`act_${c.account}/adsets`, body)
      await log(c, profileId, `Conjunto creado (pausado): ${desc} · id ${r.id}`)
      return text(`✅ Conjunto creado pausado [adset_id ${r.id}]. Siguiente: meta_crear_anuncio.`)
    },
  )

  server.registerTool(
    "meta_crear_anuncio",
    {
      title: "Meta: crear anuncio",
      description: "Crea un anuncio PAUSADO en un conjunto usando un creativo del Creative Tracker (asset_id de creativos_listos): sube la imagen o el video a Meta, arma el creativo con texto, título, CTA y destino, y vincula el anuncio a su concepto en el dashboard. Para leads con formulario pasa form_id; para sitio, url. Sin confirmar: true solo muestra el plan.",
      inputSchema: z.object({
        proyecto: z.string(),
        conjunto_id: z.string(),
        asset_id: z.string(),
        nombre: z.string().min(3),
        page_id: z.string(),
        instagram_id: z.string().optional(),
        texto: z.string().min(1).describe("Texto principal"),
        titulo: z.string().optional(),
        cta: z.enum(CTAS).default("LEARN_MORE"),
        url: z.string().url().optional().describe("Destino (sitio). Requerido salvo formulario o mensajes"),
        form_id: z.string().optional().describe("Formulario instantáneo (leads)"),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const profileId = await requireEditor(ctx)
      const c = await client(a.proyecto)
      const set = await own(c, a.conjunto_id)
      if (set.kind !== "conjunto") throw new Error("conjunto_id no es un conjunto.")
      const { data: asset } = await db().from("creative_assets").select("id, project_id, file_type, file_path, thumbnail_path, asset_url, concept:creative_concepts(name)").eq("id", a.asset_id).single()
      if (!asset || asset.project_id !== c.projectId) throw new Error("Ese asset no es de este proyecto.")
      const fileUrl = asset.file_path ? ASSET_BASE + asset.file_path : asset.asset_url
      if (!fileUrl) throw new Error("El asset no tiene archivo.")
      const isVideo = asset.file_type === "video" || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(fileUrl)
      const thumbUrl = asset.thumbnail_path ? ASSET_BASE + asset.thumbnail_path : null
      const messaging = ["WHATSAPP_MESSAGE", "MESSAGE_PAGE"].includes(a.cta)
      if (!a.form_id && !messaging && !a.url) throw new Error("Falta url (o form_id para formulario instantáneo).")
      const concept = (asset.concept as unknown as { name: string | null } | null)?.name ?? "sin concepto"

      const desc = `Anuncio "${a.nombre}" en "${set.name}" · ${isVideo ? "video" : "imagen"} del concepto "${concept}" · CTA ${a.cta}${a.form_id ? " · formulario" : a.url ? ` · ${a.url}` : ""} · PAUSADO\n  Texto: ${a.texto.slice(0, 160)}${a.texto.length > 160 ? "…" : ""}${a.titulo ? `\n  Título: ${a.titulo}` : ""}`
      if (!a.confirmar) return text(`Crearía en ${c.name}:\n- ${desc}${confirmHint}`)

      const act = `act_${c.account}`
      // Imagen: se sube por bytes y se usa su hash. Video: Meta lo descarga de la URL.
      async function imageHash(url: string): Promise<string> {
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
        const r = await post(`${act}/adimages`, { bytes: buf.toString("base64") }) as { images?: Record<string, { hash: string }> }
        const h = Object.values(r.images ?? {})[0]?.hash
        if (!h) throw new Error("Meta no regresó el hash de la imagen")
        return h
      }
      const cta: Record<string, unknown> = { type: a.cta, value: a.form_id ? { lead_gen_form_id: a.form_id } : a.cta === "WHATSAPP_MESSAGE" ? { app_destination: "WHATSAPP" } : a.url ? { link: a.url } : {} }
      const spec: Record<string, unknown> = { page_id: a.page_id, ...(a.instagram_id ? { instagram_user_id: a.instagram_id } : {}) }
      if (isVideo) {
        const v = await post(`${act}/advideos`, { file_url: fileUrl, name: a.nombre }) as { id: string }
        // Esperar a que Meta procese el video (máx. ~90 s) para tener miniatura.
        let picture: string | null = null
        for (let i = 0; i < 18; i++) {
          const st = await get<{ status?: { video_status?: string }; picture?: string }>(v.id, { fields: "status,picture" }).catch(() => null)
          if (st?.status?.video_status === "ready") { picture = st.picture ?? null; break }
          if (st?.status?.video_status === "error") throw new Error("Meta no pudo procesar el video")
          await new Promise((r) => setTimeout(r, 5000))
        }
        const video_data: Record<string, unknown> = { video_id: v.id, message: a.texto, call_to_action: cta, ...(a.titulo ? { title: a.titulo } : {}) }
        if (thumbUrl) video_data.image_hash = await imageHash(thumbUrl)
        else if (picture) video_data.image_url = picture
        else throw new Error("El video sigue procesándose en Meta; intenta de nuevo en un minuto.")
        spec.video_data = video_data
      } else {
        spec.link_data = { image_hash: await imageHash(fileUrl), message: a.texto, ...(a.titulo ? { name: a.titulo } : {}), link: a.url ?? `https://facebook.com/${a.page_id}`, call_to_action: cta }
      }
      const creative = await post(`${act}/adcreatives`, { name: a.nombre, object_story_spec: JSON.stringify(spec) }) as { id: string }
      const ad = await post(`${act}/ads`, { name: a.nombre, adset_id: set.id, creative: JSON.stringify({ creative_id: creative.id }), status: "PAUSED" }) as { id: string }
      await db().from("creative_asset_meta_ads").insert({ creative_asset_id: asset.id, project_id: c.projectId, meta_ad_id: ad.id, linked_by: profileId })
      await log(c, profileId, `Anuncio creado (pausado): ${desc} · id ${ad.id}`)
      return text(`✅ Anuncio creado pausado [ad_id ${ad.id}] y vinculado al concepto "${concept}". Revísalo en Ads Manager y actívalo (campaña, conjunto y anuncio) con meta_cambiar_estado.`)
    },
  )
}

