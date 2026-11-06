import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import type { BrandBrain, BrandLine } from "@/lib/types"
import { draftFromInstagram, draftFromWebsite } from "@/lib/brand-brains/import-core"
import { mergeBrainDrafts } from "@/lib/brand-brains/merge-draft"
import { mirrorUrlToStorage } from "@/lib/brand-brains/storage"
import { insertBrandLine, autofillBrandLineCore } from "@/lib/brand-brains/lines-core"

// Brand Brains y sus brand lines desde el MCP. Permiso: access_brand_brains,
// el mismo que deja entrar a /brand-brains.
// - brand_brains / detalle_brand_brain: leer (con sus brand lines).
// - importar_brand_brain: mismo flujo que "Importar" (Instagram vía Apify y/o
//   sitio web, analizados con Claude); solo genera el borrador.
// - crear_brand_brain / editar_brand_brain: alta y cambios (dos pasos).
// - crear_brand_line / editar_brand_line: líneas de producto/servicio de una
//   marca, con autollenado por IA igual que el botón de la UI (dos pasos).

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()

async function requireBrainAccess(ctx: ToolCtx) {
  const id = ctx.http?.authInfo?.extra?.profileId
  if (typeof id !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("id, role, permissions").eq("id", id).single()
  if (!data) throw new Error("Perfil no encontrado")
  if (!can(data as never, "access_brand_brains")) throw new Error("No tienes acceso a Brand Brains.")
  return data
}

const list = (label: string, xs?: string[] | null) => (xs?.length ? `${label}:\n${xs.map((x) => `  - ${x}`).join("\n")}` : `${label}: —`)

function preview(b: Partial<BrandBrain>): string {
  return [
    `Nombre: ${b.name || "—"}`,
    `Industria: ${b.industry || "—"} · Idioma: ${b.language || "es"}`,
    `Descripción: ${b.description || "—"}`,
    `Tono de voz: ${b.tone_of_voice || "—"}`,
    `Audiencia: ${b.target_audience || "—"}`,
    list("USPs", b.usps),
    list("Beneficios clave", b.key_benefits),
    list("Dolores", b.pain_points),
    list("Características", b.key_features),
    list("CTAs", b.ctas),
    `Colores: ${b.brand_colors?.length ? b.brand_colors.map((c) => `${c.hex}${c.label ? ` (${c.label})` : ""}`).join(", ") : "—"}`,
    `Logo: ${b.logo_url || "—"}`,
    b.additional_context ? `Contexto adicional: ${b.additional_context}` : "",
  ].filter(Boolean).join("\n")
}

async function duplicateWarning(name?: string | null): Promise<string> {
  if (!name?.trim()) return ""
  const { data } = await db().from("brand_brains").select("name").ilike("name", name.trim()).limit(1)
  return data?.length ? `\n⚠️ Ya existe un Brand Brain llamado "${data[0].name}".` : ""
}

const strList = z.array(z.string()).optional()
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const clean = (xs?: string[]) => (xs ?? []).map((x) => x.trim()).filter(Boolean)

async function findBrain(q: string) {
  const s = q.trim()
  const { data } = await db().from("brand_brains").select("*").ilike("name", `%${s}%`).order("name").limit(10)
  const rows = (data ?? []) as BrandBrain[]
  const exact = rows.filter((b) => b.name.toLowerCase() === s.toLowerCase())
  const hits = exact.length ? exact : rows
  if (!hits.length) throw new Error(`No encontré el Brand Brain "${q}". Usa brand_brains para ver la lista.`)
  if (hits.length > 1) throw new Error(`"${q}" coincide con varios Brand Brains: ${hits.map((b) => b.name).join(", ")}. Sé más específico.`)
  return hits[0]
}

async function getLines(brainId: string): Promise<BrandLine[]> {
  const { data, error } = await db().from("brand_lines").select("*").eq("brand_brain_id", brainId).order("position")
  if (error) throw new Error(error.message)
  return (data ?? []) as BrandLine[]
}

function findLine(lines: BrandLine[], q: string, brainName: string): BrandLine {
  const s = q.trim().toLowerCase()
  const exact = lines.filter((l) => l.name.toLowerCase() === s)
  const hits = exact.length ? exact : lines.filter((l) => l.name.toLowerCase().includes(s))
  if (!hits.length) throw new Error(`${brainName} no tiene una brand line "${q}". Líneas: ${lines.map((l) => l.name).join(", ") || "ninguna"}.`)
  if (hits.length > 1) throw new Error(`"${q}" coincide con varias líneas: ${hits.map((l) => l.name).join(", ")}. Sé más específico.`)
  return hits[0]
}

function linePreview(l: Partial<BrandLine>): string {
  return [
    `Línea: ${l.name || "—"} · color ${l.color || "#6366f1"}`,
    `Descripción: ${l.description || "—"}`,
    list("USPs", l.usps),
    list("Dolores", l.pain_points),
    `Keywords: ${l.keywords?.length ? l.keywords.join(", ") : "—"}`,
  ].join("\n")
}

function revalidateBrain(id: string) {
  revalidatePath("/brand-brains")
  revalidatePath(`/brand-brains/${id}`)
}

export function registerBrandBrainTools(server: McpServer) {
  server.registerTool(
    "importar_brand_brain",
    {
      title: "Importar Brand Brain (Instagram / sitio web)",
      description:
        "Genera el BORRADOR de un Brand Brain a partir del perfil de Instagram y/o el sitio web de la marca (mismo análisis que el botón Importar de /brand-brains). No guarda nada: devuelve la vista previa y el `borrador` en JSON. Para darlo de alta, revisa/ajusta con el usuario y llama crear_brand_brain con esos campos. Puede tardar 1-2 minutos con Instagram.",
      inputSchema: z.object({
        instagram: z.string().optional().describe("Usuario de Instagram, con o sin @"),
        sitio_web: z.string().optional().describe("URL o dominio del sitio de la marca"),
      }),
    },
    async ({ instagram, sitio_web }, ctx: ToolCtx) => {
      await requireBrainAccess(ctx)
      if (!instagram?.trim() && !sitio_web?.trim()) throw new Error("Indica instagram, sitio_web o ambos.")

      const sources: string[] = []
      const tasks: Promise<Partial<BrandBrain>>[] = []
      if (instagram?.trim()) { tasks.push(draftFromInstagram(instagram.trim())); sources.push(`Instagram @${instagram.trim().replace(/^@/, "")}`) }
      if (sitio_web?.trim()) { tasks.push(draftFromWebsite(sitio_web.trim())); sources.push(`sitio ${sitio_web.trim()}`) }

      const draft = mergeBrainDrafts(await Promise.all(tasks))
      const borrador = {
        nombre: draft.name ?? "",
        industria: draft.industry ?? "",
        descripcion: draft.description ?? "",
        tono_de_voz: draft.tone_of_voice ?? "",
        audiencia: draft.target_audience ?? "",
        usps: draft.usps ?? [],
        beneficios: draft.key_benefits ?? [],
        dolores: draft.pain_points ?? [],
        caracteristicas: draft.key_features ?? [],
        ctas: draft.ctas ?? [],
        colores: draft.brand_colors ?? [],
        logo_url: draft.logo_url ?? undefined,
      }

      return text(
        `Borrador generado desde ${sources.join(" + ")}:\n\n${preview(draft)}${await duplicateWarning(draft.name)}\n\n` +
        `No se guardó nada. Para darlo de alta llama crear_brand_brain con estos campos (ajústalos si el usuario lo pide):\n` +
        "```json\n" + JSON.stringify(borrador, null, 2) + "\n```",
      )
    },
  )

  server.registerTool(
    "crear_brand_brain",
    {
      title: "Crear Brand Brain",
      description:
        "Da de alta un Brand Brain (normalmente con el borrador de importar_brand_brain, pero también a mano). Sin confirmar: true solo muestra lo que crearía. Si viene logo_url (https), la imagen se copia al Storage del dashboard.",
      inputSchema: z.object({
        nombre: z.string().min(1),
        industria: z.string().optional(),
        idioma: z.string().optional().describe("Código de idioma, ej. es, en. Por defecto es"),
        descripcion: z.string().optional(),
        tono_de_voz: z.string().optional(),
        audiencia: z.string().optional(),
        usps: strList,
        beneficios: strList,
        dolores: strList,
        caracteristicas: strList,
        ctas: strList,
        colores: z.array(z.object({ hex: hexColor, label: z.string().optional() })).optional(),
        contexto_adicional: z.string().optional(),
        iniciales: z.string().max(4).optional(),
        logo_url: z.string().url().optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const profile = await requireBrainAccess(ctx)
      const row = {
        name: a.nombre.trim(),
        initials: a.iniciales?.trim() || null,
        industry: a.industria?.trim() || null,
        language: a.idioma?.trim() || "es",
        brand_colors: (a.colores ?? []).map((c) => ({ hex: c.hex.toLowerCase(), label: c.label?.trim() || "" })),
        description: a.descripcion?.trim() || null,
        usps: clean(a.usps),
        key_benefits: clean(a.beneficios),
        pain_points: clean(a.dolores),
        target_audience: a.audiencia?.trim() || null,
        key_features: clean(a.caracteristicas),
        ctas: clean(a.ctas),
        tone_of_voice: a.tono_de_voz?.trim() || null,
        additional_context: a.contexto_adicional?.trim() || null,
      }
      const logo = a.logo_url && /^https:\/\//i.test(a.logo_url) ? a.logo_url : null
      const desc = preview({ ...row, logo_url: logo } as Partial<BrandBrain>)

      if (!a.confirmar) {
        return text(`Crearía este Brand Brain:\n\n${desc}${await duplicateWarning(row.name)}${a.logo_url && !logo ? "\n⚠️ logo_url ignorado: debe ser https." : ""}\n\nNo se creó nada. Si es correcto, vuelve a llamar con confirmar: true.`)
      }

      const admin = db()
      const { data: brain, error } = await admin
        .from("brand_brains")
        .insert({ ...row, created_by: profile.id })
        .select("id, name")
        .single()
      if (error) throw new Error(error.message)

      let logoNote = ""
      if (logo) {
        const url = await mirrorUrlToStorage(brain.id, logo, "logo")
        if (url) {
          await admin.from("brand_brains").update({ logo_url: url, logo_square_url: url }).eq("id", brain.id)
        } else {
          logoNote = "\n⚠️ No se pudo copiar el logo; súbelo desde el dashboard."
        }
      }

      revalidatePath("/brand-brains")
      return text(`✅ Brand Brain creado: ${brain.name} (/brand-brains/${brain.id})${logoNote}`)
    },
  )

  server.registerTool(
    "brand_brains",
    {
      title: "Listar Brand Brains",
      description: "Lista los Brand Brains (o busca por nombre) con industria, idioma y sus brand lines.",
      inputSchema: z.object({ busqueda: z.string().optional() }),
    },
    async ({ busqueda }, ctx: ToolCtx) => {
      await requireBrainAccess(ctx)
      let q = db().from("brand_brains").select("id, name, industry, language, brand_lines(name)").order("name").limit(200)
      if (busqueda?.trim()) q = q.ilike("name", `%${busqueda.trim()}%`)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as { id: string; name: string; industry: string | null; language: string | null; brand_lines: { name: string }[] }[]
      if (!rows.length) return text("No hay Brand Brains que coincidan.")
      return text(rows.map((b) => `- ${b.name}${b.industry ? ` · ${b.industry}` : ""} · ${b.language ?? "es"} · ${b.brand_lines?.length ? `líneas: ${b.brand_lines.map((l) => l.name).join(", ")}` : "sin brand lines"}`).join("\n"))
    },
  )

  server.registerTool(
    "detalle_brand_brain",
    {
      title: "Detalle de un Brand Brain",
      description: "Todo un Brand Brain (descripción, tono, audiencia, USPs, beneficios, dolores, características, CTAs, colores, contexto) y cada una de sus brand lines con descripción, USPs, dolores y keywords.",
      inputSchema: z.object({ brand_brain: z.string().min(1) }),
    },
    async ({ brand_brain }, ctx: ToolCtx) => {
      await requireBrainAccess(ctx)
      const b = await findBrain(brand_brain)
      const lines = await getLines(b.id)
      return text(
        `${preview(b)}\nLink: /brand-brains/${b.id}\n\n## Brand lines (${lines.length})` +
        (lines.length ? lines.map((l, i) => `\n\n${i + 1}. ${linePreview(l)}`).join("") : "\nNinguna todavía."),
      )
    },
  )

  server.registerTool(
    "editar_brand_brain",
    {
      title: "Editar Brand Brain",
      description:
        "Cambia solo los campos indicados de un Brand Brain. Las listas (usps, beneficios, dolores, caracteristicas, ctas, colores) se REEMPLAZAN completas: para agregar o quitar un elemento, lee primero detalle_brand_brain y manda la lista final. Cadena vacía borra un texto. Sin confirmar: true solo muestra antes → después.",
      inputSchema: z.object({
        brand_brain: z.string().min(1),
        nuevo_nombre: z.string().min(1).optional(),
        industria: z.string().optional(),
        idioma: z.string().optional(),
        descripcion: z.string().optional(),
        tono_de_voz: z.string().optional(),
        audiencia: z.string().optional(),
        usps: strList,
        beneficios: strList,
        dolores: strList,
        caracteristicas: strList,
        ctas: strList,
        colores: z.array(z.object({ hex: hexColor, label: z.string().optional() })).optional(),
        contexto_adicional: z.string().optional(),
        iniciales: z.string().max(4).optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      await requireBrainAccess(ctx)
      const b = await findBrain(a.brand_brain)
      const patch: Record<string, unknown> = {}
      const txt = (v: string | undefined, col: string) => { if (v !== undefined) patch[col] = v.trim() || null }
      if (a.nuevo_nombre) patch.name = a.nuevo_nombre.trim()
      txt(a.industria, "industry"); txt(a.descripcion, "description"); txt(a.tono_de_voz, "tone_of_voice")
      txt(a.audiencia, "target_audience"); txt(a.contexto_adicional, "additional_context"); txt(a.iniciales, "initials")
      if (a.idioma?.trim()) patch.language = a.idioma.trim()
      if (a.usps) patch.usps = clean(a.usps)
      if (a.beneficios) patch.key_benefits = clean(a.beneficios)
      if (a.dolores) patch.pain_points = clean(a.dolores)
      if (a.caracteristicas) patch.key_features = clean(a.caracteristicas)
      if (a.ctas) patch.ctas = clean(a.ctas)
      if (a.colores) patch.brand_colors = a.colores.map((c) => ({ hex: c.hex.toLowerCase(), label: c.label?.trim() || "" }))
      if (!Object.keys(patch).length) throw new Error("No indicaste nada que cambiar.")

      const after = { ...b, ...patch } as BrandBrain
      const desc = `ANTES:\n${preview(b)}\n\nDESPUÉS:\n${preview(after)}`
      if (!a.confirmar) return text(`${desc}${patch.name ? await duplicateWarning(patch.name as string) : ""}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)

      const { error } = await db().from("brand_brains").update(patch).eq("id", b.id)
      if (error) throw new Error(error.message)
      revalidateBrain(b.id)
      return text(`✅ Brand Brain actualizado: ${after.name} (/brand-brains/${b.id})`)
    },
  )

  server.registerTool(
    "crear_brand_line",
    {
      title: "Crear brand line",
      description:
        "Agrega una brand line (línea de producto/servicio) a un Brand Brain. Con autollenar: true, Claude genera descripción, USPs, dolores y keywords a partir del nombre, la descripcion que des (se toma como fuente de verdad) y el contexto de la marca — igual que el botón de la UI; solo llena lo que no mandes. Sin confirmar: true solo muestra la vista previa (con lo autollenado) y no guarda; para guardar exactamente eso, vuelve a llamar con esos campos y confirmar: true (sin autollenar, para no regenerar).",
      inputSchema: z.object({
        brand_brain: z.string().min(1),
        nombre: z.string().min(1),
        descripcion: z.string().optional(),
        usps: strList,
        dolores: strList,
        keywords: strList,
        color: hexColor.optional(),
        autollenar: z.boolean().default(false),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      await requireBrainAccess(ctx)
      const b = await findBrain(a.brand_brain)
      const lines = await getLines(b.id)
      const dup = lines.find((l) => l.name.toLowerCase() === a.nombre.trim().toLowerCase())

      const fields = {
        name: a.nombre.trim(),
        description: a.descripcion?.trim() || null,
        usps: clean(a.usps),
        pain_points: clean(a.dolores),
        keywords: clean(a.keywords),
        color: a.color?.toLowerCase() ?? "#6366f1",
      }
      if (a.autollenar) {
        const ai = await autofillBrandLineCore(db(), fields.name, b.id, a.descripcion?.trim() || undefined)
        fields.description = ai.description || fields.description
        if (!fields.usps.length) fields.usps = clean(ai.usps)
        if (!fields.pain_points.length) fields.pain_points = clean(ai.pain_points)
        if (!fields.keywords.length) fields.keywords = clean(ai.keywords)
      }

      const desc = linePreview(fields)
      if (!a.confirmar) {
        return text(
          `Crearía en ${b.name}:\n\n${desc}${dup ? `\n⚠️ ${b.name} ya tiene una línea "${dup.name}".` : ""}\n\nNo se creó nada. Para guardarla vuelve a llamar con confirmar: true` +
          (a.autollenar ? ` y estos campos (sin autollenar):\n\`\`\`json\n${JSON.stringify({ descripcion: fields.description, usps: fields.usps, dolores: fields.pain_points, keywords: fields.keywords }, null, 2)}\n\`\`\`` : "."),
        )
      }

      const line = await insertBrandLine(db(), b.id, fields)
      revalidateBrain(b.id)
      return text(`✅ Brand line creada en ${b.name}:\n${linePreview(line)}`)
    },
  )

  server.registerTool(
    "editar_brand_line",
    {
      title: "Editar brand line",
      description:
        "Cambia solo lo indicado de una brand line de un Brand Brain. Las listas (usps, dolores, keywords) se REEMPLAZAN completas: lee primero detalle_brand_brain y manda la lista final. Sin confirmar: true solo muestra antes → después.",
      inputSchema: z.object({
        brand_brain: z.string().min(1),
        linea: z.string().min(1).describe("Nombre (o parte) de la brand line"),
        nuevo_nombre: z.string().min(1).optional(),
        descripcion: z.string().optional(),
        usps: strList,
        dolores: strList,
        keywords: strList,
        color: hexColor.optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      await requireBrainAccess(ctx)
      const b = await findBrain(a.brand_brain)
      const line = findLine(await getLines(b.id), a.linea, b.name)
      const patch: Partial<BrandLine> = {}
      if (a.nuevo_nombre) patch.name = a.nuevo_nombre.trim()
      if (a.descripcion !== undefined) patch.description = a.descripcion.trim() || null
      if (a.usps) patch.usps = clean(a.usps)
      if (a.dolores) patch.pain_points = clean(a.dolores)
      if (a.keywords) patch.keywords = clean(a.keywords)
      if (a.color) patch.color = a.color.toLowerCase()
      if (!Object.keys(patch).length) throw new Error("No indicaste nada que cambiar.")

      const desc = `ANTES:\n${linePreview(line)}\n\nDESPUÉS:\n${linePreview({ ...line, ...patch })}`
      if (!a.confirmar) return text(`${b.name}\n\n${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)

      const { error } = await db().from("brand_lines").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", line.id)
      if (error) throw new Error(error.message)
      revalidateBrain(b.id)
      return text(`✅ Brand line actualizada en ${b.name}.\n${desc}`)
    },
  )
}
