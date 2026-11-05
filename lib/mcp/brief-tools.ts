import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveProject } from "@/lib/mcp/resolve-project"
import { lineParts, type AdCloneLine } from "@/lib/types"

// Solo lectura: briefs por concepto con guiones completos y los creativos
// (creative_assets.brief_id) ligados a cada brief.

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const REVIEW: Record<string, string> = { pending_review: "en revisión del cliente", approved: "aprobado", changes_requested: "cambios pedidos" }

type Brief = { id: string; concept_id: string; title: string | null; important_notes: string | null; adapted_script: Record<string, AdCloneLine[]> | AdCloneLine[] | null; script_titles: Record<string, string> | null; script_reviews: Record<string, { client_status: string | null; client_feedback: string | null }> | null; share_token: string; brand_brain: { name: string } | null }

function scripts(b: Brief) {
  const raw = b.adapted_script
  if (!raw) return []
  const entries: [string, AdCloneLine[]][] = Array.isArray(raw) ? [["_single", raw]] : Object.entries(raw)
  return entries.filter(([, l]) => l?.length).map(([key, lines], i, all) => ({
    key, lines,
    title: b.script_titles?.[key] || (all.length > 1 ? `Guión #${i + 1}` : "Guión"),
    status: b.script_reviews?.[key]?.client_status ?? "pending_review",
    feedback: b.script_reviews?.[key]?.client_feedback ?? null,
  }))
}

function renderScript(lines: AdCloneLine[]) {
  return lines.map((l) => {
    const { section, visual, overlay } = lineParts(l)
    const said = (l.adapted || l.original || "").trim()
    return [`    ${section ? `[${section}] ` : ""}${said || "(sin texto hablado)"}`, visual && `      🎬 ${visual}`, overlay && `      📝 ${overlay}`].filter(Boolean).join("\n")
  }).join("\n")
}

export function registerBriefTools(server: McpServer) {
  server.registerTool("briefs_concepto", {
    title: "Briefs y guiones por concepto",
    description: "Solo lectura. Por cada concepto del proyecto (o solo el indicado): sus briefs con nombre, hook, guiones completos (sección, texto hablado, 🎬 visual, 📝 texto en pantalla), estado de revisión de cada guion y los asset_id de los creativos ligados a cada brief (con versión vigente/anterior). Marca los briefs sin creativo y los creativos sin brief. Útil para cruzar qué video corresponde a qué brief.",
    inputSchema: z.object({
      proyecto: z.string().min(1),
      concepto: z.string().optional().describe("Nombre (o parte) del concepto; vacío = todos los que tengan briefs o creativos"),
      sin_guion_completo: z.boolean().default(false).describe("true = solo títulos y estado, sin el texto de los guiones (respuesta corta)"),
    }),
  }, async ({ proyecto, concepto, sin_guion_completo }) => {
    const db = createAdminClient()
    const p = await resolveProject(proyecto)
    let cq = db.from("creative_concepts").select("id, name, status, proposed_hook, angle_type, target_persona").eq("project_id", p.id).order("created_at")
    if (concepto?.trim()) cq = cq.ilike("name", `%${concepto.trim()}%`)
    const [{ data: concepts }, { data: briefs }, { data: assets }] = await Promise.all([
      cq,
      db.from("creative_briefs").select("id, concept_id, title, important_notes, adapted_script, script_titles, script_reviews, share_token, brand_brain:brand_brains(name)").eq("project_id", p.id).order("created_at"),
      db.from("creative_assets").select("id, concept_id, brief_id, file_type, format, hook, production_status, client_status, revises_asset_id, created_at").eq("project_id", p.id).order("created_at"),
    ])
    if (!concepts?.length) return text(concepto ? `No encontré conceptos que coincidan con "${concepto}" en ${p.name}.` : `${p.name} no tiene conceptos.`)
    const superseded = new Set((assets ?? []).map((a) => a.revises_asset_id).filter(Boolean))
    const assetLine = (a: NonNullable<typeof assets>[number]) =>
      `${a.id} · ${a.file_type ?? a.format ?? "archivo"}${superseded.has(a.id) ? " · versión anterior" : ""}${a.revises_asset_id ? ` · revisión de ${a.revises_asset_id}` : ""} · ${a.production_status}${a.client_status ? ` · cliente: ${REVIEW[a.client_status] ?? a.client_status}` : ""}${a.hook ? ` · hook: "${a.hook}"` : ""}`

    const out: string[] = [`Proyecto: ${p.name}`]
    for (const c of concepts) {
      const cb = ((briefs ?? []) as unknown as Brief[]).filter((b) => b.concept_id === c.id)
      const ca = (assets ?? []).filter((a) => a.concept_id === c.id)
      if (!concepto && !cb.length && !ca.length) continue
      out.push(`\n## ${c.name ?? "Concepto sin nombre"} (${c.status})${c.proposed_hook ? `\nHook del concepto: "${c.proposed_hook}"` : ""}`)
      if (!cb.length) out.push("Sin briefs.")
      for (const b of cb) {
        const linked = ca.filter((a) => a.brief_id === b.id)
        const ss = scripts(b)
        out.push(`\n### Brief: ${b.title || b.brand_brain?.name || "Brief"} (brief_id ${b.id})`,
          `Estado: ${linked.length ? `${linked.length} creativo(s) ligado(s)` : "SIN CREATIVO todavía"} · ${ss.length} guión(es) · link editor: /share/brief/${b.share_token}`)
        if (b.important_notes) out.push(`Notas: ${b.important_notes}`)
        for (const s of ss) {
          const hook = (s.lines.find((l) => (l.adapted || l.original)?.trim())?.adapted || s.lines[0]?.original || "").trim()
          out.push(`- ${s.title} · ${REVIEW[s.status] ?? s.status}${s.feedback ? ` · feedback: "${s.feedback}"` : ""}${hook ? `\n  Hook: "${hook}"` : ""}`)
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
