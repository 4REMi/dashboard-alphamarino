import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveProject } from "@/lib/mcp/resolve-project"

// detalle_tarea: una tarea con TODO su detalle (descripción, checklist,
// entregable, SOP, ping, fase, fechas). Solo lectura. Visibilidad igual que
// el dashboard (RLS de tasks, 001_initial_schema.sql): admin/subadmin ven
// todo; un empleado solo tareas de proyectos donde es miembro o asignadas a
// él; las tareas personales solo las ve su dueño.

interface ToolCtx { http?: { authInfo?: AuthInfo } }
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] })
const db = () => createAdminClient()

const STATUS: Record<string, string> = { Todo: "Por hacer", "In Progress": "En progreso", Done: "Completada" }
const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" }) : "—"
const todayMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })

type TaskRow = {
  id: string; title: string; description: string | null; status: string; due_date: string | null
  created_at: string; updated_at?: string | null; completed_at?: string | null
  is_personal: boolean; is_pinged: boolean; ping_recipient_ids: string[] | null
  requires_deliverable: boolean; deliverable_instructions: string | null
  assignee_id: string | null; project_id: string | null; assignment_flag?: string | null
  project: { name: string } | null; phase: { name: string } | null
  assignee: { full_name: string } | null; position: { name: string } | null
  sop: { title: string; doc_url: string | null; video_url: string | null } | null
  task_set_task: { sop: { title: string; doc_url: string | null; video_url: string | null } | null } | null
}

export function registerTaskTools(server: McpServer) {
  server.registerTool(
    "detalle_tarea",
    {
      title: "Detalle de una tarea",
      description:
        "Todo sobre UNA tarea: estado, proyecto, fase, responsable, fechas (creada, vence, completada), descripción, checklist (marcado/pendiente, cuáles bloquean), ping y a quién avisa, entregable requerido (instrucciones y lo que ya se subió) y SOP. Busca por título (o parte); `proyecto` ayuda si el título se repite. Incluye tareas completadas. Solo muestra tareas que tú puedes ver en el dashboard.",
      inputSchema: z.object({
        titulo: z.string().min(1).describe("Título (o parte) de la tarea"),
        proyecto: z.string().optional(),
        tarea_id: z.string().uuid().optional().describe("Id exacto, si ya lo tienes (de una búsqueda anterior)"),
      }),
    },
    async ({ titulo, proyecto, tarea_id }, ctx: ToolCtx) => {
      const me = ctx.http?.authInfo?.extra?.profileId
      if (typeof me !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
      const { data: profile } = await db().from("profiles").select("role").eq("id", me).single()
      const isManager = profile?.role === "admin" || profile?.role === "subadmin"

      let q = db().from("tasks").select(`
        id, title, description, status, due_date, created_at, updated_at, completed_at,
        is_personal, is_pinged, ping_recipient_ids, requires_deliverable, deliverable_instructions,
        assignee_id, project_id, assignment_flag,
        project:projects(name), phase:project_phases(name),
        assignee:profiles!tasks_assignee_id_fkey(full_name), position:positions(name),
        sop:sops(title, doc_url, video_url),
        task_set_task:task_set_tasks(sop:sops(title, doc_url, video_url))
      `)
      if (tarea_id) q = q.eq("id", tarea_id)
      else q = q.ilike("title", `%${titulo.trim()}%`)
      if (proyecto?.trim()) q = q.eq("project_id", (await resolveProject(proyecto)).id)
      const { data, error } = await q.order("created_at", { ascending: false }).limit(40)
      if (error) throw new Error(error.message)

      // Visibilidad: como la RLS del dashboard.
      let memberOf = new Set<string>()
      if (!isManager) {
        const { data: m } = await db().from("project_members").select("project_id").eq("profile_id", me)
        memberOf = new Set((m ?? []).map((r) => r.project_id as string))
      }
      const rows = ((data ?? []) as unknown as TaskRow[]).filter((t) => {
        if (t.is_personal && t.assignee_id !== me) return false
        if (isManager) return true
        return t.assignee_id === me || (!!t.project_id && memberOf.has(t.project_id))
      })
      if (!rows.length) throw new Error(`No encontré una tarea que coincida con "${titulo}"${proyecto ? ` en ${proyecto}` : ""} (o no la puedes ver).`)

      // Preferir coincidencia exacta del título; si hay varias, pedir precisión.
      const exact = rows.filter((t) => t.title.trim().toLowerCase() === titulo.trim().toLowerCase())
      const hits = exact.length ? exact : rows
      if (hits.length > 1) {
        return text(
          `"${titulo}" coincide con ${hits.length} tareas; dime cuál (o usa proyecto / tarea_id):\n` +
          hits.slice(0, 15).map((t) => `- ${t.title} · ${t.project?.name ?? "personal"} · ${STATUS[t.status] ?? t.status} · vence ${fmt(t.due_date)} · tarea_id ${t.id}`).join("\n") +
          (hits.length > 15 ? `\n… y ${hits.length - 15} más` : ""),
        )
      }
      const t = hits[0]

      const [{ data: checklist }, { data: deliverables }, pingNames] = await Promise.all([
        db().from("task_checklist_items").select("text, is_checked, is_blocking, item_order").eq("task_id", t.id).order("item_order"),
        t.requires_deliverable
          ? db().from("deliverables").select("type, title, content, file_url, file_name, created_at, uploader:profiles!deliverables_uploaded_by_fkey(full_name)").eq("task_id", t.id).order("created_at")
          : Promise.resolve({ data: [] as unknown[] }),
        t.ping_recipient_ids?.length
          ? db().from("profiles").select("full_name").in("id", t.ping_recipient_ids).then((r) => (r.data ?? []).map((p) => p.full_name as string))
          : Promise.resolve([] as string[]),
      ])

      const overdue = t.status !== "Done" && t.due_date && t.due_date < todayMx()
      const sop = t.sop ?? t.task_set_task?.sop ?? null
      const items = (checklist ?? []) as { text: string; is_checked: boolean; is_blocking: boolean }[]
      const dels = (deliverables ?? []) as { type: string; title: string; content: string | null; file_url: string | null; file_name: string | null; created_at: string; uploader: { full_name: string } | null }[]

      const out = [
        `# ${t.title}`,
        `Estado: ${STATUS[t.status] ?? t.status}${overdue ? " · ⚠️ VENCIDA" : ""}${t.is_personal ? " · 🔒 personal" : ""}`,
        `Proyecto: ${t.project?.name ?? "— (tarea suelta)"}${t.phase ? ` · fase ${t.phase.name}` : ""}`,
        `Responsable: ${t.assignee?.full_name ?? "sin asignar"}${t.position ? ` · puesto ${t.position.name}` : ""}${t.assignment_flag === "no_match" ? " · ⚠️ nadie del equipo tiene ese puesto" : t.assignment_flag === "multi" ? " · ⚠️ varios del equipo tienen ese puesto" : ""}`,
        `Fechas: creada ${fmt(t.created_at)} · vence ${fmt(t.due_date)}${t.completed_at ? ` · completada ${fmt(t.completed_at)}` : ""}${t.updated_at ? ` · último cambio ${fmt(t.updated_at)}` : ""}`,
        `\nDescripción:\n${t.description?.trim() || "(sin descripción)"}`,
      ]
      if (items.length) {
        const done = items.filter((i) => i.is_checked).length
        out.push(`\nChecklist (${done}/${items.length}):`, ...items.map((i) => `- [${i.is_checked ? "x" : " "}] ${i.text}${i.is_blocking ? " (bloquea completar)" : ""}`))
      } else out.push("\nChecklist: ninguno")
      if (t.is_pinged) out.push(`\n🔔 Ping: al completarla avisa a ${pingNames.length ? pingNames.join(", ") : "todo el equipo del proyecto"}`)
      if (t.requires_deliverable) {
        out.push(`\n📎 Requiere entregable${t.deliverable_instructions ? `: ${t.deliverable_instructions}` : ""}`)
        out.push(dels.length
          ? dels.map((d) => `- ${d.title} (${d.type}) · subido por ${d.uploader?.full_name ?? "—"} el ${fmt(d.created_at)}${d.file_url ? ` · ${d.file_url}` : ""}${d.content ? `\n  ${d.content}` : ""}`).join("\n")
          : "- Falta: todavía no se sube.")
      }
      if (sop) out.push(`\n📘 SOP: ${sop.title}${sop.doc_url ? ` · doc ${sop.doc_url}` : ""}${sop.video_url ? ` · video ${sop.video_url}` : ""}`)
      out.push(`\ntarea_id ${t.id}`)
      return text(out.join("\n"))
    },
  )
}
