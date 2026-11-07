import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveProject } from "@/lib/mcp/resolve-project"
import { lineParts, type AdCloneLine } from "@/lib/types"
import { SCRIPT_STRUCTURES, type ScriptStructureKey } from "@/lib/constants/creatives"
import { writeScriptFromConcept } from "@/lib/actions/ad-clone"
import {
  applyLineEdits, listScripts, nextScriptKey, normalizeScriptMap, patchApproveScripts, patchRemoveReference,
  patchScriptTitle, patchSetScriptLines, SCRIPT_VARIANT_SEEDS, type BriefScriptsRow,
} from "@/lib/briefs/scripts-core"

// Guiones de briefs desde el MCP: generar con IA (misma IA que "Crear
// rápido"), crear, editar (líneas, título), eliminar y aprobar. Misma lógica
// que el dashboard (lib/briefs/scripts-core.ts) y mismo permiso: solo
// admin/subadmin. Todo lo que escribe va en dos pasos (confirmar).
// Para leer guiones: briefs_concepto (lib/mcp/brief-tools.ts).

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()
const NO_CHANGES = "\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true."

async function requireEditor(ctx: ToolCtx) {
  const id = ctx.http?.authInfo?.extra?.profileId
  if (typeof id !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  const { data } = await db().from("profiles").select("id, role").eq("id", id).single()
  if (data?.role !== "admin" && data?.role !== "subadmin") throw new Error("Solo admin o subadmin pueden editar briefs y guiones.")
  return data.id as string
}

// ── Resolución por nombre ────────────────────────────────────────────

type Concept = {
  id: string; name: string | null; brand_line_id: string | null
  angle_type: string | null; target_persona: string | null; pain_point: string | null; why_it_works: string | null
  objection: string | null; transformation: string | null; funnel_stage: string | null
}
type Brief = BriefScriptsRow & { id: string; title: string | null; share_token: string; brand_brain_id: string | null; brand_line_id: string | null; concept_id: string }

async function findConcept(projectId: string, projectName: string, q: string): Promise<Concept> {
  const { data } = await db().from("creative_concepts").select("id, name, brand_line_id, angle_type, target_persona, pain_point, why_it_works, objection, transformation, funnel_stage").eq("project_id", projectId)
  const rows = (data ?? []) as Concept[]
  const s = q.trim().toLowerCase()
  const exact = rows.filter((c) => (c.name ?? "").trim().toLowerCase() === s)
  const hits = exact.length ? exact : rows.filter((c) => (c.name ?? "").toLowerCase().includes(s))
  if (!hits.length) throw new Error(`${projectName} no tiene un concepto "${q}".`)
  if (hits.length > 1) throw new Error(`"${q}" coincide con varios conceptos de ${projectName}: ${hits.map((c) => c.name).join(", ")}. Sé más específico.`)
  return hits[0]
}

const briefLabel = (b: Brief) => `${b.title || "Brief sin título"} (brief_id ${b.id})`

// brief: id exacto o título (o parte). Sin brief: el único del concepto.
async function findBrief(concept: Concept, q?: string): Promise<Brief | null> {
  const { data } = await db().from("creative_briefs").select("*").eq("concept_id", concept.id).order("created_at")
  const rows = (data ?? []) as Brief[]
  if (q?.trim()) {
    const s = q.trim().toLowerCase()
    const byId = rows.find((b) => b.id === q.trim())
    if (byId) return byId
    const hits = rows.filter((b) => (b.title ?? "").toLowerCase().includes(s))
    if (!hits.length) throw new Error(`El concepto "${concept.name}" no tiene un brief "${q}". Briefs: ${rows.map(briefLabel).join(", ") || "ninguno"}.`)
    if (hits.length > 1) throw new Error(`"${q}" coincide con varios briefs: ${hits.map(briefLabel).join(", ")}. Usa el brief_id.`)
    return hits[0]
  }
  if (rows.length > 1) throw new Error(`El concepto "${concept.name}" tiene varios briefs: ${rows.map(briefLabel).join(", ")}. Indica cuál con \`brief\` (título o brief_id).`)
  return rows[0] ?? null
}

async function findBriefOrFail(concept: Concept, q?: string): Promise<Brief> {
  const b = await findBrief(concept, q)
  if (!b) throw new Error(`El concepto "${concept.name}" no tiene briefs ni guiones todavía.`)
  return b
}

// guion: clave exacta (gen_1, manual_2, id de video), número ("2" o "#2") o título (o parte).
function findScript(brief: Brief, q: string) {
  const scripts = listScripts(brief)
  if (!scripts.length) throw new Error(`El brief ${briefLabel(brief)} no tiene guiones.`)
  const s = q.trim()
  const byKey = scripts.find((x) => x.key === s)
  if (byKey) return byKey
  const n = /^#?(\d+)$/.exec(s)
  if (n) {
    const byNum = scripts.find((x) => x.number === Number(n[1]))
    if (byNum) return byNum
  }
  const hits = scripts.filter((x) => x.title.toLowerCase().includes(s.toLowerCase()))
  if (hits.length === 1) return hits[0]
  const all = scripts.map((x) => `#${x.number} "${x.title}" (${x.key})`).join(", ")
  if (!hits.length) throw new Error(`No encontré el guion "${q}" en ${briefLabel(brief)}. Guiones: ${all}.`)
  throw new Error(`"${q}" coincide con varios guiones: ${hits.map((x) => `#${x.number} "${x.title}"`).join(", ")}. Usa el número.`)
}

// ── Líneas ────────────────────────────────────────────────────────────

const LineInput = z.object({
  seccion: z.string().optional().describe("Ej. Hook, Problema, CTA"),
  hablado: z.string().describe("Lo que se dice (teleprompter / voz en off); vacío si la línea es solo visual"),
  visual: z.string().optional().describe("Qué se ve (🎬)"),
  en_pantalla: z.string().optional().describe("Texto en pantalla (📝)"),
})
type LineIn = z.infer<typeof LineInput>

const toLine = (l: LineIn, original = ""): AdCloneLine => ({
  speaker: l.seccion?.trim() || null,
  original,
  adapted: l.hablado.trim(),
  visual: l.visual?.trim() || null,
  overlay: l.en_pantalla?.trim() || null,
})

// Normaliza líneas viejas (notas metidas en speaker) al formato con campos.
function normalizeLine(l: AdCloneLine): AdCloneLine {
  const { section, visual, overlay } = lineParts(l)
  return { ...l, speaker: section, visual, overlay }
}

function renderLines(lines: AdCloneLine[]): string {
  return lines.map((l, i) => {
    const { section, visual, overlay } = lineParts(l)
    const said = (l.adapted || l.original || "").trim()
    return [`  ${i + 1}. ${section ? `[${section}] ` : ""}${said || "(sin texto hablado)"}`, visual && `      🎬 ${visual}`, overlay && `      📝 ${overlay}`].filter(Boolean).join("\n")
  }).join("\n")
}

const toInputFormat = (lines: AdCloneLine[]) => lines.map((l) => {
  const { section, visual, overlay } = lineParts(l)
  return { seccion: section ?? undefined, hablado: (l.adapted || l.original || "").trim(), visual: visual ?? undefined, en_pantalla: overlay ?? undefined }
})

function revalidateBrief(projectId: string, shareToken: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/share/brief/${shareToken}`)
  revalidatePath(`/share/concepts/${projectId}`)
}

async function updateBrief(brief: Brief, projectId: string, patch: Record<string, unknown>) {
  const { error } = await db().from("creative_briefs").update(patch).eq("id", brief.id)
  if (error) throw new Error(error.message)
  revalidateBrief(projectId, brief.share_token)
}

// ── Herramientas ──────────────────────────────────────────────────────

const STRUCTURE_KEYS = SCRIPT_STRUCTURES.map((s) => s.key) as [ScriptStructureKey, ...ScriptStructureKey[]]
const Target = {
  proyecto: z.string().min(1),
  concepto: z.string().min(1).describe("Nombre (o parte) del concepto"),
  brief: z.string().optional().describe("Título o brief_id; solo si el concepto tiene varios briefs"),
}

export function registerScriptTools(server: McpServer) {
  server.registerTool(
    "generar_guiones_ia",
    {
      title: "Generar guiones con IA",
      description:
        `Escribe 1-3 opciones de guion desde cero para un concepto con la misma IA que "Crear rápido" del Creative Tracker: usa la estrategia del concepto, el Brand Brain del proyecto y la brand line del concepto, con una estructura probada. NO guarda nada: devuelve las opciones en el formato de crear_guion para que el usuario elija/ajuste y luego se guarden con crear_guion. Estructuras: ${SCRIPT_STRUCTURES.map((s) => `${s.key} (${s.name})`).join("; ")}. Tarda ~30-60 s. Solo admin/subadmin.`,
      inputSchema: z.object({
        proyecto: Target.proyecto,
        concepto: Target.concepto,
        estructura: z.enum(STRUCTURE_KEYS),
        variantes: z.number().int().min(1).max(3).default(3),
      }),
    },
    async (a, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const p = await resolveProject(a.proyecto)
      const c = await findConcept(p.id, p.name, a.concepto)
      const { data: proj } = await db().from("projects").select("brand_brain_id").eq("id", p.id).single()
      if (!proj?.brand_brain_id) throw new Error(`${p.name} no tiene Brand Brain; asígnale uno para generar guiones.`)
      const { data: brain } = await db().from("brand_brains").select("name, industry, language, tone_of_voice, usps, key_benefits, pain_points, target_audience, ctas").eq("id", proj.brand_brain_id).single()
      if (!brain) throw new Error("Brand Brain no encontrado")
      const line = c.brand_line_id
        ? (await db().from("brand_lines").select("name, description, usps, pain_points, keywords").eq("id", c.brand_line_id).single()).data
        : null

      const results = await Promise.allSettled(
        SCRIPT_VARIANT_SEEDS.slice(0, a.variantes).map((seed) =>
          writeScriptFromConcept(c as never, brain as never, a.estructura, line, seed)),
      )
      const drafts = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
      if (!drafts.length) throw new Error("No se pudo generar ningún guion; intenta de nuevo.")
      const structure = SCRIPT_STRUCTURES.find((s) => s.key === a.estructura)!
      return text(
        `${drafts.length} opción(es) para "${c.name}" (${p.name}) · ${structure.name}${line ? ` · línea ${line.name}` : ""}:\n` +
        drafts.map((d, i) => `\n### Opción ${i + 1}\n${renderLines(d)}\n\`\`\`json\n${JSON.stringify(toInputFormat(d))}\n\`\`\``).join("\n") +
        `\n\nNo se guardó nada. Para guardar una, llama crear_guion con sus \`lineas\` (ajústalas si el usuario lo pide).`,
      )
    },
  )

  server.registerTool(
    "crear_guion",
    {
      title: "Crear guion",
      description:
        "Agrega un guion nuevo al brief de un concepto (si el concepto no tiene brief, crea uno con el Brand Brain del proyecto y la línea del concepto, igual que \"Crear rápido\"). Las líneas vienen de generar_guiones_ia o las escribe el chat: cada una con seccion, hablado, visual y en_pantalla. Queda en revisión del cliente. Sin confirmar: true solo muestra el guion. Solo admin/subadmin.",
      inputSchema: z.object({
        ...Target,
        titulo: z.string().optional().describe("Nombre del guion, ej. \"Ana testimonial\""),
        lineas: z.array(LineInput).min(1),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      const userId = await requireEditor(ctx)
      const p = await resolveProject(a.proyecto)
      const c = await findConcept(p.id, p.name, a.concepto)
      const brief = await findBrief(c, a.brief)
      const lines = a.lineas.map((l) => toLine(l))
      const where = brief ? `brief ${briefLabel(brief)}` : "un brief NUEVO para el concepto"
      const desc = `${p.name} · concepto "${c.name}" · ${where}\nGuion${a.titulo ? ` "${a.titulo}"` : ""}:\n${renderLines(lines)}`
      if (!a.confirmar) return text(`Crearía:\n${desc}${NO_CHANGES}`)

      let target = brief
      if (!target) {
        const { data: proj } = await db().from("projects").select("brand_brain_id").eq("id", p.id).single()
        if (!proj?.brand_brain_id) throw new Error(`${p.name} no tiene Brand Brain; asígnale uno para crear el brief.`)
        const { data, error } = await db().from("creative_briefs").insert({
          project_id: p.id, concept_id: c.id, brand_brain_id: proj.brand_brain_id, brand_line_id: c.brand_line_id,
          attached_ad_ids: [], no_transcribe_ad_ids: [], attached_board_ids: [], created_by: userId,
        }).select("*").single()
        if (error) throw new Error(error.message)
        target = data as Brief
      }
      const scripts = normalizeScriptMap(target.adapted_script)
      const key = nextScriptKey(scripts, "manual")
      scripts[key] = lines
      const patch: Record<string, unknown> = { adapted_script: scripts, updated_at: new Date().toISOString() }
      if (a.titulo?.trim()) patch.script_titles = patchScriptTitle(target, key, a.titulo).script_titles
      await updateBrief(target, p.id, patch)
      return text(`✅ Guion creado (${key}) en ${briefLabel(target)}.\n${desc}\nLink del editor: /share/brief/${target.share_token}`)
    },
  )

  server.registerTool(
    "editar_guion",
    {
      title: "Editar guion",
      description:
        "Edita un guion de un brief (lee primero con briefs_concepto: los números de línea son los de ahí). Puedes: reemplazar TODAS las líneas (`lineas`), o cambiar líneas sueltas (`cambios`: número + solo los campos a cambiar), quitar líneas (`quitar_lineas`) e insertar nuevas (`insertar`, después del número indicado; 0 = al inicio) — todos los números se refieren al guion actual. También renombrarlo (`titulo`; vacío = nombre por defecto). Cambiar líneas lo regresa a revisión del cliente (igual que el editor). Sin confirmar: true solo muestra antes → después. Solo admin/subadmin.",
      inputSchema: z.object({
        ...Target,
        guion: z.string().min(1).describe("Número (\"2\"), título o clave del guion"),
        lineas: z.array(LineInput).min(1).optional().describe("Reemplaza el guion completo"),
        cambios: z.array(z.object({
          linea: z.number().int().min(1),
          seccion: z.string().optional(), hablado: z.string().optional(), visual: z.string().optional(), en_pantalla: z.string().optional(),
        })).optional(),
        quitar_lineas: z.array(z.number().int().min(1)).optional(),
        insertar: z.array(LineInput.extend({ despues_de: z.number().int().min(0) })).optional(),
        titulo: z.string().optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async (a, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const p = await resolveProject(a.proyecto)
      const c = await findConcept(p.id, p.name, a.concepto)
      const brief = await findBriefOrFail(c, a.brief)
      const s = findScript(brief, a.guion)
      const editsLines = !!(a.lineas || a.cambios?.length || a.quitar_lineas?.length || a.insertar?.length)
      if (!editsLines && a.titulo === undefined) throw new Error("No indicaste nada que cambiar.")
      if (a.lineas && (a.cambios?.length || a.quitar_lineas?.length || a.insertar?.length)) throw new Error("Usa `lineas` (reemplazo completo) o cambios/quitar/insertar, no ambos.")

      const before = s.lines.map(normalizeLine)
      let after = before
      if (a.lineas) {
        after = a.lineas.map((l) => toLine(l))
      } else if (editsLines) {
        after = applyLineEdits(before, {
          cambios: (a.cambios ?? []).map((ch) => ({
            line: ch.linea,
            ...(ch.seccion !== undefined ? { speaker: ch.seccion.trim() || null } : {}),
            ...(ch.hablado !== undefined ? { adapted: ch.hablado.trim() } : {}),
            ...(ch.visual !== undefined ? { visual: ch.visual.trim() || null } : {}),
            ...(ch.en_pantalla !== undefined ? { overlay: ch.en_pantalla.trim() || null } : {}),
          })),
          quitar: a.quitar_lineas ?? [],
          insertar: (a.insertar ?? []).map((ins) => ({ after: ins.despues_de, line: toLine(ins) })),
        })
        if (!after.length) throw new Error("El guion quedaría vacío; para quitarlo usa eliminar_guion.")
      }

      const titleChange = a.titulo !== undefined ? `Título: "${s.title}" → "${a.titulo.trim() || "(por defecto)"}"\n` : ""
      const desc = `${p.name} · "${c.name}" · ${briefLabel(brief)} · guion #${s.number} "${s.title}" (${s.key})\n${titleChange}` +
        (editsLines ? `\nANTES:\n${renderLines(before)}\n\nDESPUÉS:\n${renderLines(after)}\n\nVuelve a quedar en revisión del cliente.` : "")
      if (!a.confirmar) return text(`${desc}${NO_CHANGES}`)

      // Releer para no pisar cambios hechos mientras tanto en el editor.
      const fresh = (await db().from("creative_briefs").select("*").eq("id", brief.id).single()).data as Brief
      let patch: Record<string, unknown> = {}
      if (editsLines) patch = { ...patch, ...patchSetScriptLines(fresh, s.key, after) }
      if (a.titulo !== undefined) patch = { ...patch, ...patchScriptTitle(fresh, s.key, a.titulo) }
      await updateBrief(fresh, p.id, patch)
      return text(`✅ Guion actualizado.\n${desc}`)
    },
  )

  server.registerTool(
    "eliminar_guion",
    {
      title: "Eliminar guion",
      description: "Quita un guion de un brief (igual que borrarlo en el editor): se borra con su título y su revisión; si el guion venía de un video de referencia, ese video también se quita del brief. No se puede deshacer. Sin confirmar: true solo muestra qué se borraría. Solo admin/subadmin.",
      inputSchema: z.object({ ...Target, guion: z.string().min(1).describe("Número, título o clave del guion"), confirmar: z.boolean().default(false) }),
    },
    async (a, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const p = await resolveProject(a.proyecto)
      const c = await findConcept(p.id, p.name, a.concepto)
      const brief = await findBriefOrFail(c, a.brief)
      const s = findScript(brief, a.guion)
      const isRef = (brief.attached_ad_ids ?? []).includes(s.key)
      const { count } = await db().from("creative_assets").select("id", { count: "exact", head: true }).eq("brief_id", brief.id)
      const desc = `${p.name} · "${c.name}" · ${briefLabel(brief)}\nEliminar guion #${s.number} "${s.title}" (${s.key}, ${s.lines.length} líneas)` +
        (isRef ? "\n⚠️ Viene de un video de referencia: el video también se quita del brief." : "") +
        (count ? `\nEl brief tiene ${count} creativo(s) ligado(s); siguen ligados al brief.` : "") +
        "\nNo se puede deshacer."
      if (!a.confirmar) return text(`${desc}${NO_CHANGES}`)
      const fresh = (await db().from("creative_briefs").select("*").eq("id", brief.id).single()).data as Brief
      await updateBrief(fresh, p.id, patchRemoveReference(fresh, s.key))
      return text(`✅ Guion eliminado.\n${desc}`)
    },
  )

  server.registerTool(
    "aprobar_guiones",
    {
      title: "Aprobar guiones (aprobación interna)",
      description: "Marca guiones de un brief como aprobados sin revisión del cliente (igual que \"Aprobar\" del Creative Tracker, para proyectos sin link de cliente). Sin `guiones` aprueba todos los del brief. Sin confirmar: true solo muestra cuáles. Solo admin/subadmin.",
      inputSchema: z.object({ ...Target, guiones: z.array(z.string()).optional().describe("Números, títulos o claves; vacío = todos"), confirmar: z.boolean().default(false) }),
    },
    async (a, ctx: ToolCtx) => {
      await requireEditor(ctx)
      const p = await resolveProject(a.proyecto)
      const c = await findConcept(p.id, p.name, a.concepto)
      const brief = await findBriefOrFail(c, a.brief)
      const chosen = a.guiones?.length ? a.guiones.map((g) => findScript(brief, g)) : listScripts(brief)
      if (!chosen.length) throw new Error(`El brief ${briefLabel(brief)} no tiene guiones.`)
      const desc = `${p.name} · "${c.name}" · ${briefLabel(brief)}\nAprobar: ${chosen.map((x) => `#${x.number} "${x.title}"`).join(", ")}`
      if (!a.confirmar) return text(`${desc}${NO_CHANGES}`)
      const fresh = (await db().from("creative_briefs").select("*").eq("id", brief.id).single()).data as Brief
      await updateBrief(fresh, p.id, patchApproveScripts(fresh, chosen.map((x) => x.key)))
      return text(`✅ Guiones aprobados.\n${desc}`)
    },
  )
}
