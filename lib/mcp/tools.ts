import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createTask, updateTaskStatus } from "@/lib/actions/tasks"
import { addLogEntry } from "@/lib/actions/projects"

// Minimal shape of what registerTool's handler actually receives —
// typed loosely on purpose (see docs/agent-guides/mcp-server.md) instead
// of importing the SDK's exact (much larger, still-shifting) ServerContext
// type, since all three tools below only ever touch this one field.
interface ToolCtx {
  http?: { authInfo?: AuthInfo }
}

function requireProfileId(ctx: ToolCtx): string {
  const profileId = ctx.http?.authInfo?.extra?.profileId
  if (typeof profileId !== "string") throw new Error("No se pudo identificar quién está llamando esta herramienta")
  return profileId
}

// Un chat no tiene el <select> de proyecto que sí tiene Captura rápida —
// se resuelve por nombre, mismo criterio (match parcial, insensible a
// mayúsculas) que ya usa el bot de Telegram para lo mismo, pero
// implementado aparte: MCP no debe depender de código interno del bot.
// Ambigüedad real (2+ proyectos que matchean) se lanza como error para
// que el chat le pida al usuario que sea más específico, en vez de
// adivinar cuál.
async function resolveProjectId(projectName: string | undefined): Promise<string | null> {
  if (!projectName?.trim()) return null
  const admin = createAdminClient()
  const { data } = await admin.from("projects").select("id, name").ilike("name", `%${projectName.trim()}%`).limit(6)
  if (!data || data.length === 0) throw new Error(`No encontré ningún proyecto que coincida con "${projectName}".`)
  if (data.length > 1) throw new Error(`"${projectName}" coincide con varios proyectos: ${data.map((p) => p.name).join(", ")}. Sé más específico.`)
  return data[0].id
}

async function resolveAssigneeId(assigneeName: string | undefined): Promise<string | null> {
  if (!assigneeName?.trim()) return null
  const admin = createAdminClient()
  const { data } = await admin.from("profiles").select("id, full_name").ilike("full_name", `%${assigneeName.trim()}%`).limit(6)
  if (!data || data.length === 0) throw new Error(`No encontré a nadie en el equipo que coincida con "${assigneeName}".`)
  if (data.length > 1) throw new Error(`"${assigneeName}" coincide con varias personas: ${data.map((p) => p.full_name).join(", ")}. Sé más específico.`)
  return data[0].id
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

// Registrado en app/api/mcp/route.ts. Deliberadamente arranca con solo 3
// tools — las mismas acciones que ya existen en Captura rápida
// (crear_tarea, agregar_nota_proyecto) más completar_tarea (útil y de
// bajo riesgo, y ya la tiene Telegram) — no un intento de replicar TODO
// lo que hace el bot de un jalón. Se va ampliando de una en una (ver la
// guía) reusando siempre acciones reales del dashboard, nunca lógica
// duplicada ni un bypass de permisos como el que usa el bot.
export function registerMcpTools(server: McpServer) {
  server.registerTool(
    "crear_tarea",
    {
      title: "Crear tarea",
      description: "Crea una tarea nueva, opcionalmente dentro de un proyecto y/o asignada a alguien del equipo.",
      inputSchema: z.object({
        titulo: z.string().min(1),
        descripcion: z.string().optional(),
        proyecto: z.string().optional().describe("Nombre del proyecto (match parcial) — si se omite, la tarea queda personal/sin proyecto."),
        asignado_a: z.string().optional().describe("Nombre de la persona del equipo a quien asignarla (match parcial)."),
        fecha_limite: z.string().optional().describe("YYYY-MM-DD"),
      }),
    },
    async ({ titulo, descripcion, proyecto, asignado_a, fecha_limite }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const projectId = await resolveProjectId(proyecto)
      const assigneeId = await resolveAssigneeId(asignado_a)

      const fd = new FormData()
      fd.set("title", titulo)
      if (descripcion) fd.set("description", descripcion)
      if (projectId) fd.set("project_id", projectId)
      if (assigneeId) fd.set("assignee_id", assigneeId)
      if (fecha_limite) fd.set("due_date", fecha_limite)

      await createTask(fd, actingProfileId)
      return textResult(`Tarea "${titulo}" creada${projectId ? ` en el proyecto` : " (personal, sin proyecto)"}${assigneeId ? ", asignada" : ""}.`)
    },
  )

  server.registerTool(
    "completar_tarea",
    {
      title: "Completar tarea",
      description: "Marca como completada una tarea existente dentro de un proyecto, buscándola por título (match parcial).",
      inputSchema: z.object({
        proyecto: z.string().min(1).describe("Nombre del proyecto donde vive la tarea."),
        titulo: z.string().min(1).describe("Título (o parte de él) de la tarea a completar."),
      }),
    },
    async ({ proyecto, titulo }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const projectId = await resolveProjectId(proyecto)
      if (!projectId) throw new Error(`No encontré el proyecto "${proyecto}".`)

      const admin = createAdminClient()
      const { data: candidates } = await admin
        .from("tasks")
        .select("id, title, status")
        .eq("project_id", projectId)
        .neq("status", "Done")
        .ilike("title", `%${titulo.trim()}%`)
        .limit(6)
      if (!candidates || candidates.length === 0) throw new Error(`No encontré ninguna tarea abierta que coincida con "${titulo}" en ese proyecto.`)
      if (candidates.length > 1) throw new Error(`"${titulo}" coincide con varias tareas abiertas: ${candidates.map((t) => t.title).join(", ")}. Sé más específico.`)

      await updateTaskStatus(candidates[0].id, "Done", projectId, actingProfileId)
      return textResult(`Tarea "${candidates[0].title}" marcada como completada.`)
    },
  )

  server.registerTool(
    "agregar_nota_proyecto",
    {
      title: "Agregar nota a la bitácora de un proyecto",
      description: "Agrega una entrada a la bitácora (log) de un proyecto — para dejar constancia de algo, no es una tarea.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        nota: z.string().min(1),
      }),
    },
    async ({ proyecto, nota }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const projectId = await resolveProjectId(proyecto)
      if (!projectId) throw new Error(`No encontré el proyecto "${proyecto}".`)

      await addLogEntry(projectId, nota, actingProfileId)
      return textResult(`Nota agregada a la bitácora del proyecto.`)
    },
  )
}
