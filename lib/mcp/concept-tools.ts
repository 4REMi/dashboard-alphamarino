import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveProject } from "@/lib/mcp/resolve-project"
import { getLines, findLine } from "@/lib/mcp/brand-brain-tools"
import { ANGLE_GUIDE, AWARENESS_LABELS } from "@/lib/constants/creatives"
import type { BrandLine } from "@/lib/types"

// Crear conceptos creativos desde el MCP, igual que "Nuevo concepto" del
// Creative Tracker (createConcept, lib/actions/creatives.ts): mismo permiso
// (solo admin/subadmin), status Active y en el ciclo ACTIVO del proyecto (el
// trigger register_concept_cycle de la migración 098 lo registra como miembro).
// Un concepto va en UNA línea o en ninguna ("General"): un video que sirve a
// varias líneas va sin línea. Dos pasos (confirmar). Para guiones: crear_guion.

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
const ANGLES = ANGLE_GUIDE.map((a) => a.name) as [string, ...string[]]
const clean = (s?: string) => (s?.trim() ? s.trim() : null)

export function registerConceptTools(server: McpServer) {
  server.registerTool(
    "crear_concepto",
    {
      title: "Crear concepto creativo",
      description:
        `Crea un concepto (ángulo) en el Creative Tracker de un proyecto, igual que "Nuevo concepto": queda Active y en el ciclo activo. Solo admin/subadmin. Un concepto pertenece a UNA brand line del Brand Brain del proyecto o a ninguna (linea: "ninguna" = grupo General); si un video sirve a varias líneas, créalo sin línea. Después se le agregan guiones con crear_guion / generar_guiones_ia. Dos pasos.`,
      inputSchema: z.object({
        proyecto: z.string().min(1),
        nombre: z.string().min(2).describe("Nombre del concepto, ej. \"Antes de tu primera clase\""),
        persona_objetivo: z.string().min(2).describe("Quién es: edad, situación, contexto"),
        dolor: z.string().optional().describe("Dolor o deseo principal"),
        objecion: z.string().optional(),
        transformacion: z.string().optional().describe("Transformación prometida"),
        por_que_funciona: z.string().optional(),
        angulo: z.enum(ANGLES).optional().describe(`Uno de: ${ANGLES.join(", ")}`),
        principio_organizador: z.enum(["Pain-First", "Desire-First"]).optional().describe("Pain-First = parte de un dolor; Desire-First = de un deseo"),
        etapa_awareness: z.number().int().min(1).max(5).optional().describe(Object.entries(AWARENESS_LABELS).map(([k, v]) => `${k}=${v}`).join(", ")),
        funnel: z.enum(["TOF", "MOF", "BOF"]).optional(),
        producto_servicio: z.string().optional(),
        linea: z.string().optional().describe("Nombre (o parte) de la brand line, o \"ninguna\" / vacío = sin línea (General)"),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const profileId = ctx.http?.authInfo?.extra?.profileId
      if (typeof profileId !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
      const { data: me } = await db().from("profiles").select("id, role").eq("id", profileId).single()
      if (me?.role !== "admin" && me?.role !== "subadmin") throw new Error("Solo admin o subadmin pueden crear conceptos.")

      const p = await resolveProject(a.proyecto)
      const name = a.nombre.trim()
      const { data: existing } = await db().from("creative_concepts").select("name").eq("project_id", p.id)
      if ((existing ?? []).some((c) => norm(c.name ?? "") === norm(name))) {
        throw new Error(`${p.name} ya tiene un concepto llamado "${name}". Usa otro nombre (los guiones buscan el concepto por nombre).`)
      }

      let line: BrandLine | null = null
      if (a.linea?.trim() && !/^(ninguna|sin linea|sin línea|general|none|null)$/i.test(a.linea.trim())) {
        const { data: proj } = await db().from("projects").select("brand_brain_id, brand_brain:brand_brains(name)").eq("id", p.id).single()
        if (!proj?.brand_brain_id) throw new Error(`${p.name} no tiene Brand Brain asignado, así que no hay líneas que usar. Usa linea: "ninguna" o asígnale uno.`)
        line = findLine(await getLines(proj.brand_brain_id as string), a.linea, (proj.brand_brain as unknown as { name: string } | null)?.name ?? "")
      }

      const { data: cycle } = await db().from("paid_media_cycles").select("id, start_date").eq("project_id", p.id).eq("is_active", true).order("start_date", { ascending: false }).limit(1).maybeSingle()

      const row = {
        project_id: p.id,
        cycle_id: cycle?.id ?? null,
        name,
        organizing_principle: a.principio_organizador ?? null,
        product_service: clean(a.producto_servicio),
        angle_type: a.angulo ?? null,
        target_persona: a.persona_objetivo.trim(),
        why_it_works: clean(a.por_que_funciona),
        pain_point: clean(a.dolor),
        objection: clean(a.objecion),
        transformation: clean(a.transformacion),
        awareness_stage: a.etapa_awareness ?? null,
        funnel_stage: a.funnel ?? null,
        brand_line_id: line?.id ?? null,
        status: "Active",
        created_by: me.id as string,
      }
      const desc = [
        `${p.name} · concepto NUEVO "${name}"`,
        `Línea: ${line?.name ?? "sin línea (General)"} · Ciclo: ${cycle ? "activo" : "ninguno activo (queda sin ciclo)"}`,
        `Persona: ${row.target_persona}`,
        `Dolor: ${row.pain_point ?? "—"} · Objeción: ${row.objection ?? "—"} · Transformación: ${row.transformation ?? "—"}`,
        `Ángulo: ${row.angle_type ?? "—"} · Principio: ${row.organizing_principle ?? "—"} · Awareness: ${row.awareness_stage ? `${row.awareness_stage} (${AWARENESS_LABELS[row.awareness_stage]})` : "—"} · Funnel: ${row.funnel_stage ?? "—"}`,
      ].join("\n")
      if (!a.confirmar) return text(`Crearía:\n${desc}\n\nNo se creó nada. Si es correcto, vuelve a llamar con confirmar: true.`)

      const { error } = await db().from("creative_concepts").insert(row)
      if (error) throw new Error(error.message)
      revalidatePath(`/projects/${p.id}`)
      return text(`✅ Concepto creado.\n${desc}\n\nSiguiente paso: crear_guion o generar_guiones_ia con proyecto "${p.name}" y concepto "${name}".`)
    },
  )
}
