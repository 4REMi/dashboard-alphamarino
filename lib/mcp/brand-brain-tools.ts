import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { can } from "@/lib/permissions"
import type { BrandBrain } from "@/lib/types"
import { draftFromInstagram, draftFromWebsite } from "@/lib/brand-brains/import-core"
import { mergeBrainDrafts } from "@/lib/brand-brains/merge-draft"
import { mirrorUrlToStorage } from "@/lib/brand-brains/storage"

// Brand Brains desde el MCP. Mismo flujo que "Importar" en /brand-brains:
// importar_brand_brain genera el borrador (Instagram vía Apify y/o sitio web,
// analizados con Claude) SIN guardar nada; crear_brand_brain lo da de alta
// (vista previa sin confirmar: true). Permiso: access_brand_brains, el mismo
// que deja entrar a la sección.

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
        colores: z.array(z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), label: z.string().optional() })).optional(),
        contexto_adicional: z.string().optional(),
        iniciales: z.string().max(4).optional(),
        logo_url: z.string().url().optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const profile = await requireBrainAccess(ctx)
      const clean = (xs?: string[]) => (xs ?? []).map((x) => x.trim()).filter(Boolean)
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
}
