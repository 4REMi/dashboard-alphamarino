import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveProject } from "@/lib/mcp/resolve-project"
import { lineParts, type AdCloneLine } from "@/lib/types"

// Solo lectura: briefs por concepto con guiones completos y los creativos
// (creative_assets.brief_id) ligados a cada brief. Para crear/editar/
// eliminar/aprobar guiones: lib/mcp/script-tools.ts (usa la misma
// numeración de guiones y líneas).

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const REVIEW: Record<string, string> = { pending_review: "en revisión del cliente", approved: "aprobado", changes_requested: "cambios pedidos" }

type Brief = { id: string; concept_id: string; title: string | null; important_notes: string | null; adapted_script: Record<string, AdCloneLine[]> | AdCloneLine[] | null; script_titles: Record<string, string> | null; script_reviews: Record<string, { client_status: string | null; client_feedback: string | null }> | null; share_token: string; brand_brain: { name: string } | null; brand_line: { name: string } | null }

function scripts(b: Brief) {
  const raw = b.adapted_script
  if (!raw) return []
  const entries: [string, AdCloneLine[]][] = Array.isArray(raw) ? [["_single", raw]] : Object.entries(raw)
  return entries.filter(([, l]) => l?.length).map(([key, lines], i, all) => ({
    key, lines, number: i + 1,
    title: b.script_titles?.[key] || (all.length > 1 ? `Guión #${i + 1}` : "Guión"),
    status: b.script_reviews?.[key]?.client_status ?? "pending_review",
    feedback: b.script_reviews?.[key]?.client_feedback ?? null,
  }))
}

function renderScript(lines: AdCloneLine[]) {
  // Líneas numeradas: editar_guion (lib/mcp/script-tools.ts) usa estos números.
  return lines.map((l, i) => {
    const { section, visual, overlay } = lineParts(l)
    const said = (l.adapted || l.original || "").trim()
    return [`    ${i + 1}. ${section ? `[${section}] ` : ""}${said || "(sin texto hablado)"}`, visual && `       🎬 ${visual}`, overlay && `       📝 ${overlay}`].filter(Boolean).join("\n")
  }).join("\n")
}

export function registerBriefTools(server: McpServer) {
  server.registerTool("briefs_concepto", {
    title: "Briefs y guiones por concepto",
    description: "Solo lectura. Por cada concepto del proyecto (o solo el indicado): su brand line, sus briefs con nombre, hook, guiones completos (sección, texto hablado, 🎬 visual, 📝 texto en pantalla), estado de revisión de cada guion y los asset_id de los creativos ligados a cada brief (con versión vigente/anterior). Marca los briefs sin creativo y los creativos sin brief. Útil para cruzar qué video corresponde a qué brief.",
    inputSchema: z.object({
      proyecto: z.string().min(1),
      concepto: z.string().optional().describe("Nombre (o parte) del concepto; vacío = todos los que tengan briefs o creativos"),
      sin_guion_completo: z.boolean().default(false).describe("true = solo títulos y estado, sin el texto de los guiones (respuesta corta)"),
      todos_los_ciclos: z.boolean().default(false).describe("true = incluir conceptos y creativos de ciclos anteriores. Por defecto solo lo que el dashboard muestra: el ciclo activo (o el más reciente) + Evergreen"),
    }),
  }, async ({ proyecto, concepto, sin_guion_completo, todos_los_ciclos }) => {
    const db = createAdminClient()
    const p = await resolveProject(proyecto)
    // Mismo alcance que el Creative Tracker (getCreativeConcepts/getCreativeAssets):
    // ciclo activo ?? el más reciente; sin ciclos = todo.
    const { data: cycles } = await db.from("paid_media_cycles").select("id, is_active, start_date").eq("project_id", p.id).order("start_date", { ascending: false })
    const cycle = todos_los_ciclos ? null : (cycles ?? []).find((c) => c.is_active) ?? (cycles ?? [])[0] ?? null
    let conceptIds: Set<string> | null = null
    let assetIds: Set<string> | null = null
    if (cycle) {
      const [{ data: cc, error: ce }, { data: ac, error: ae }] = await Promise.all([
        db.from("creative_concept_cycles").select("concept_id").eq("cycle_id", cycle.id),
        db.from("creative_asset_cycles").select("asset_id").eq("cycle_id", cycle.id),
      ])
      if (!ce) conceptIds = new Set((cc ?? []).map((r) => r.concept_id as string))
      if (!ae) assetIds = new Set((ac ?? []).map((r) => r.asset_id as string))
    }
    let cq = db.from("creative_concepts").select("id, name, status, proposed_hook, angle_type, target_persona, cycle_id, brand_line:brand_lines!brand_line_id(name)").eq("project_id", p.id).order("created_at")
    if (concepto?.trim()) cq = cq.ilike("name", `%${concepto.trim()}%`)
    const [cRes, { data: briefs }, aRes] = await Promise.all([
      cq,
      db.from("creative_briefs").select("id, concept_id, title, important_notes, adapted_script, script_titles, script_reviews, share_token, brand_brain:brand_brains(name), brand_line:brand_lines!brand_line_id(name)").eq("project_id", p.id).order("created_at"),
      db.from("creative_assets").select("id, concept_id, brief_id, cycle_id, file_type, format, hook, production_status, client_status, revises_asset_id, created_at").eq("project_id", p.id).order("created_at"),
    ])
    let concepts = cRes.data
    let assets = aRes.data
    if (cycle) {
      concepts = (concepts ?? []).filter((c) => conceptIds ? conceptIds.has(c.id) : (c.cycle_id === cycle.id || (!c.cycle_id && c.status === "Evergreen")))
      assets = (assets ?? []).filter((a) => assetIds ? assetIds.has(a.id) : a.cycle_id === cycle.id)
    }
    if (!concepts?.length) return text(concepto ? `No encontré conceptos que coincidan con "${concepto}" en ${p.name}.` : `${p.name} no tiene conceptos.`)
    const superseded = new Set((assets ?? []).map((a) => a.revises_asset_id).filter(Boolean))
    const assetLine = (a: NonNullable<typeof assets>[number]) =>
      `${a.id} · ${a.file_type ?? a.format ?? "archivo"}${superseded.has(a.id) ? " · versión anterior" : ""}${a.revises_asset_id ? ` · revisión de ${a.revises_asset_id}` : ""} · ${a.production_status}${a.client_status ? ` · cliente: ${REVIEW[a.client_status] ?? a.client_status}` : ""}${a.hook ? ` · hook: "${a.hook}"` : ""}`

    const out: string[] = [`Proyecto: ${p.name} · ${cycle ? `ciclo ${cycle.is_active ? "activo" : "más reciente"} (${cycle.start_date}) + Evergreen; usa todos_los_ciclos para el historial` : todos_los_ciclos ? "todos los ciclos" : "sin ciclos"}`]
    for (const c of concepts) {
      const cb = ((briefs ?? []) as unknown as Brief[]).filter((b) => b.concept_id === c.id)
      const ca = (assets ?? []).filter((a) => a.concept_id === c.id)
      if (!concepto && !cb.length && !ca.length) continue
      const cLine = (c as unknown as { brand_line: { name: string } | null }).brand_line?.name ?? null
      out.push(`\n## ${c.name ?? "Concepto sin nombre"} (${c.status}) · línea: ${cLine ?? "sin línea"}${c.proposed_hook ? `\nHook del concepto: "${c.proposed_hook}"` : ""}`)
      if (!cb.length) out.push("Sin briefs.")
      for (const b of cb) {
        const linked = ca.filter((a) => a.brief_id === b.id)
        const ss = scripts(b)
        out.push(`\n### Brief: ${b.title || b.brand_brain?.name || "Brief"} (brief_id ${b.id})${b.brand_line && b.brand_line.name !== cLine ? ` · línea del brief: ${b.brand_line.name}` : ""}`,
          `Estado: ${linked.length ? `${linked.length} creativo(s) ligado(s)` : "SIN CREATIVO todavía"} · ${ss.length} guión(es) · link editor: /share/brief/${b.share_token}`)
        if (b.important_notes) out.push(`Notas: ${b.important_notes}`)
        for (const s of ss) {
          const hook = (s.lines.find((l) => (l.adapted || l.original)?.trim())?.adapted || s.lines[0]?.original || "").trim()
          out.push(`- Guion #${s.number} "${s.title}" (clave ${s.key}) · ${REVIEW[s.status] ?? s.status}${s.feedback ? ` · feedback: "${s.feedback}"` : ""}${hook ? `\n  Hook: "${hook}"` : ""}`)
          if (!sin_guion_completo) out.push(renderScript(s.lines))
        }
        out.push(linked.length ? `Creativos ligados:\n${linked.map((a) => `  - ${assetLine(a)}`).join("\n")}` : "Creativos ligados: ninguno")
      }
      const orphan = ca.filter((a) => !a.brief_id || !cb.some((b) => b.id === a.brief_id))
      if (orphan.length) out.push(`\nCreativos sin brief:\n${orphan.map((a) => `  - ${assetLine(a)}`).join("\n")}`)
    }
    if (out.length === 1) return text(`${p.name} no tiene briefs ni creativos todavía.`)
    return text(out.join("\n"))
  })
}
