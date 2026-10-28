import { resolveProject } from "@/lib/mcp/resolve-project"
import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createTask, updateTaskStatus } from "@/lib/actions/tasks"
import { addLogEntry } from "@/lib/actions/projects"
import { createServiceOffer, archiveServiceOffer, updateServiceOffer } from "@/lib/actions/services"
import { attachServiceOfferToProject } from "@/lib/actions/service-deliverables"
import { registerOperationsTools } from "@/lib/mcp/operations-tools"
import { registerFinanceTools } from "@/lib/mcp/finance-tools"
import { registerMetaTools } from "@/lib/mcp/meta-tools"
import { registerMetaCreateTools } from "@/lib/mcp/meta-create-tools"
import { registerMetaEditTools } from "@/lib/mcp/meta-edit-tools"
import { registerProjectTools } from "@/lib/mcp/project-tools"
import { registerDeliverableTools } from "@/lib/mcp/deliverable-tools"
import { registerCustomerTools } from "@/lib/mcp/customer-tools"
import { registerManualTools } from "@/lib/mcp/manual-tools"
import { registerQuoteTools } from "@/lib/mcp/quote-tools"
import { getProjectContext } from "@/lib/project-context"
import { interpretStandup } from "@/lib/standup-core"

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
  return (await resolveProject(projectName)).id
}

async function resolveAssigneeId(assigneeName: string | undefined): Promise<string | null> {
  if (!assigneeName?.trim()) return null
  const admin = createAdminClient()
  const { data } = await admin.from("profiles").select("id, full_name").ilike("full_name", `%${assigneeName.trim()}%`).limit(6)
  if (!data || data.length === 0) throw new Error(`No encontré a nadie en el equipo que coincida con "${assigneeName}".`)
  if (data.length > 1) throw new Error(`"${assigneeName}" coincide con varias personas: ${data.map((p) => p.full_name).join(", ")}. Sé más específico.`)
  return data[0].id
}

async function resolveOfferId(offerName: string): Promise<{ id: string; status: string }> {
  const admin = createAdminClient()
  const { data } = await admin.from("service_offers").select("id, name, status").ilike("name", `%${offerName.trim()}%`).limit(6)
  if (!data || data.length === 0) throw new Error(`No encontré ninguna oferta que coincida con "${offerName}".`)
  if (data.length > 1) throw new Error(`"${offerName}" coincide con varias ofertas: ${data.map((o) => o.name).join(", ")}. Sé más específico.`)
  return data[0]
}

// "📎 falta entregable" / "📎 entregado" para tareas que lo requieren.
async function deliverableFlags(tasks: { id: string; requires_deliverable?: boolean | null }[]): Promise<Map<string, string>> {
  const need = tasks.filter((t) => t.requires_deliverable).map((t) => t.id)
  const out = new Map<string, string>()
  if (!need.length) return out
  const { data } = await createAdminClient().from("deliverables").select("task_id").in("task_id", need)
  const done = new Set((data ?? []).map((d) => d.task_id as string))
  for (const id of need) out.set(id, done.has(id) ? " · 📎 entregable subido" : " · 📎 falta entregable")
  return out
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "sin fecha"
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// Registrado en app/api/mcp/route.ts. Deliberadamente arranca con solo 3
// tools — las mismas acciones que ya existen en Captura rápida
// (crear_tarea, agregar_nota_proyecto) más completar_tarea (útil y de
// bajo riesgo, y ya la tiene Telegram) — no un intento de replicar TODO
// lo que hace el bot de un jalón. Se va ampliando de una en una (ver la
// guía) reusando siempre acciones reales del dashboard, nunca lógica
// duplicada ni un bypass de permisos como el que usa el bot.
export function registerMcpTools(server: McpServer) {
  // Plantillas de Operations (solo admin) — lib/mcp/operations-tools.ts
  registerOperationsTools(server)
  registerFinanceTools(server)
  registerMetaTools(server)
  registerMetaCreateTools(server)
  registerMetaEditTools(server)
  registerProjectTools(server)
  registerDeliverableTools(server)
  registerCustomerTools(server)
  registerManualTools(server)
  registerQuoteTools(server)

  server.registerTool(
    "crear_tarea",
    {
      title: "Crear tarea",
      description: "Crea una tarea nueva, opcionalmente dentro de un proyecto y/o asignada a alguien del equipo. Igual que el dashboard: puede avisar a personas cuando se complete (avisar_al_terminar; \"yo\" = quien llama), llevar checklist, pedir entregable y caer en una fase del proyecto.",
      inputSchema: z.object({
        titulo: z.string().min(1),
        descripcion: z.string().optional(),
        proyecto: z.string().optional().describe("Nombre del proyecto (match parcial) — si se omite, la tarea queda personal/sin proyecto."),
        asignado_a: z.string().optional().describe("Nombre de la persona del equipo a quien asignarla (match parcial)."),
        fecha_limite: z.string().optional().describe("YYYY-MM-DD"),
        avisar_al_terminar: z.array(z.string()).optional().describe("Personas a avisar cuando se complete (nombres; \"yo\" = quien llama). Lista vacía = todo el equipo del proyecto."),
        checklist: z.array(z.object({ texto: z.string().min(1), bloqueante: z.boolean().default(false).describe("Si es true, la tarea no se puede completar sin palomearlo") })).optional(),
        requiere_entregable: z.boolean().optional().describe("La tarea pide subir un resultado (texto, documento o imagen) al completarla"),
        instrucciones_entregable: z.string().optional(),
        fase: z.string().optional().describe("Fase del proyecto (nombre, match parcial)"),
      }),
    },
    async ({ titulo, descripcion, proyecto, asignado_a, fecha_limite, avisar_al_terminar, checklist, requiere_entregable, instrucciones_entregable, fase }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const projectId = await resolveProjectId(proyecto)
      const assigneeId = await resolveAssigneeId(asignado_a)
      const pingIds = avisar_al_terminar
        ? await Promise.all(avisar_al_terminar.map(async (n) => /^(yo|m[ií]|a m[ií])$/i.test(n.trim()) ? actingProfileId : (await resolveAssigneeId(n))!))
        : null
      if (avisar_al_terminar && !projectId && !pingIds?.length) throw new Error("Para avisar a todo el equipo la tarea necesita un proyecto; indica nombres en avisar_al_terminar.")
      let phaseId: string | null = null
      if (fase) {
        if (!projectId) throw new Error("Para indicar fase la tarea necesita proyecto.")
        const { data: phases } = await createAdminClient().from("project_phases").select("id, name").eq("project_id", projectId)
        const q = fase.trim().toLowerCase()
        const hits = (phases ?? []).filter((p) => p.name.toLowerCase() === q).length ? (phases ?? []).filter((p) => p.name.toLowerCase() === q) : (phases ?? []).filter((p) => p.name.toLowerCase().includes(q))
        if (hits.length !== 1) throw new Error(hits.length ? `"${fase}" coincide con varias fases: ${hits.map((h) => h.name).join(", ")}.` : `No encontré la fase "${fase}" en ese proyecto.`)
        phaseId = hits[0].id
      }

      const fd = new FormData()
      fd.set("title", titulo)
      if (descripcion) fd.set("description", descripcion)
      if (projectId) fd.set("project_id", projectId)
      if (assigneeId) fd.set("assignee_id", assigneeId)
      if (fecha_limite) fd.set("due_date", fecha_limite)
      if (phaseId) fd.set("phase_id", phaseId)
      if (avisar_al_terminar) {
        fd.set("is_pinged", "true")
        if (pingIds?.length) fd.set("ping_recipient_ids_json", JSON.stringify([...new Set(pingIds)]))
      }
      if (checklist?.length) fd.set("checklist_items_json", JSON.stringify(checklist.map((c) => ({ text: c.texto, is_blocking: c.bloqueante }))))
      if (requiere_entregable) {
        fd.set("requires_deliverable", "true")
        if (instrucciones_entregable) fd.set("deliverable_instructions", instrucciones_entregable)
      }

      await createTask(fd, actingProfileId)
      const extras = [
        avisar_al_terminar ? (pingIds?.length ? "con aviso al terminar" : "con aviso al equipo al terminar") : null,
        checklist?.length ? `checklist de ${checklist.length}` : null,
        requiere_entregable ? "pide entregable" : null,
        phaseId ? `en fase ${fase}` : null,
      ].filter(Boolean)
      return textResult(`Tarea "${titulo}" creada${projectId ? ` en el proyecto` : " (personal, sin proyecto)"}${assigneeId ? ", asignada" : ""}${extras.length ? ` · ${extras.join(" · ")}` : ""}.`)
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
      description: "Agrega una entrada a la bitácora (log) de un proyecto. Úsala SOLO cuando el usuario pida explícitamente dejar algo en la bitácora (\"anótalo en la bitácora\", \"deja nota\"). Nunca la uses por iniciativa propia para registrar lo que hiciste con otras herramientas: eso ya queda en Actividad de IA. Silenciosa por default; opcionalmente puede avisar por Telegram.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        nota: z.string().min(1),
        avisar_a: z.string().optional().describe('"todos"/"equipo" para avisarle a todo el equipo del proyecto, o el nombre de una persona (match parcial) para avisarle solo a ella. Si se omite, la nota queda silenciosa (default). Escribir @Nombre Completo en la nota también avisa a esa persona.'),
        categoria: z.enum(["Decisión", "Bloqueo", "Cliente", "Interno"]).optional(),
        fecha_evento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Cuándo pasó, si no fue hoy (YYYY-MM-DD)"),
        fijar: z.boolean().optional().describe("Fijarla como contexto fijo del proyecto (acuerdos/reglas vigentes que leen reportes, briefs y Claude)"),
      }),
    },
    async ({ proyecto, nota, avisar_a, categoria, fecha_evento, fijar }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const projectId = await resolveProjectId(proyecto)
      if (!projectId) throw new Error(`No encontré el proyecto "${proyecto}".`)

      const wantsTeam = !!avisar_a && ["todos", "equipo", "todo el equipo"].includes(avisar_a.trim().toLowerCase())
      const recipientId = !wantsTeam && avisar_a ? await resolveAssigneeId(avisar_a) : null

      await addLogEntry(projectId, nota, actingProfileId, { team: wantsTeam, recipientIds: recipientId ? [recipientId] : undefined }, { category: categoria ?? null, eventDate: fecha_evento ?? null, pinned: !!fijar })
      return textResult(`Nota agregada${fijar ? " y fijada como contexto" : ""} a la bitácora del proyecto${wantsTeam ? " — se avisó a todo el equipo." : recipientId ? " — se avisó a la persona indicada." : "."}`)
    },
  )

  // Captura rápida: la misma IA que el botón del dashboard separa un texto
  // libre en tareas y notas. SIEMPRE en dos pasos: con `texto` regresa la
  // vista previa (y los items en JSON); con `items` + confirmar: true crea.
  // Entre ambos, Claude puede ajustar los items según lo que diga el usuario.
  const CaptureItem = z.object({
    tipo: z.enum(["tarea", "nota"]),
    texto: z.string().min(1).describe("Título de la tarea o cuerpo de la nota"),
    proyecto: z.string().optional().describe("Nombre del proyecto (obligatorio en notas)"),
    responsable: z.string().optional().describe("Solo tareas"),
    fecha_limite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Solo tareas"),
    descripcion: z.string().optional().describe("Solo tareas: contexto para quien la haga"),
    pingear: z.boolean().optional().describe("Solo tareas con proyecto: avisar por Telegram cuando se complete"),
    avisar_al_terminar: z.array(z.string()).optional().describe("Solo tareas pingeadas: nombres a avisar (vacío = equipo del proyecto)"),
    avisar_a: z.string().optional().describe("Solo notas: 'equipo' o un nombre"),
    requiere_entregable: z.boolean().optional().describe("Solo tareas: pide subir un resultado al completarla"),
    instrucciones_entregable: z.string().optional(),
  })
  server.registerTool(
    "captura_rapida",
    {
      title: "Captura rápida",
      description: "Las notas de bitácora (tipo nota) solo van si el usuario pidió explícitamente dejar algo en la bitácora; si no, quítalas de items antes de confirmar. Convierte un texto libre (stand-up, resumen de llamada, lista de pendientes de varios proyectos y personas) en tareas y notas de bitácora, con la misma IA que la Captura rápida del dashboard. Paso 1: manda `texto` → regresa la vista previa numerada para mostrarla al usuario y los `items`. Paso 2: manda esos `items` (ajustados si el usuario pidió cambios) con confirmar: true → crea todo. Nunca crea nada en el paso 1.",
      inputSchema: z.object({
        texto: z.string().optional(),
        items: z.array(CaptureItem).max(40).optional(),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ texto, items, confirmar }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const admin = createAdminClient()
      if (!items?.length) {
        if (!texto?.trim()) throw new Error("Manda el texto a capturar.")
        const parsed = await interpretStandup(admin, texto)
        if (!parsed.length) return textResult("No encontré tareas ni notas en ese texto.")
        const { data: projects } = await admin.from("projects").select("id, name")
        const { data: people } = await admin.from("profiles").select("id, full_name")
        const pName = (id: string | null) => projects?.find((p) => p.id === id)?.name
        const uName = (id: string | null) => people?.find((p) => p.id === id)?.full_name
        const out = parsed.map((it) => ({
          tipo: it.tipo === "nota_proyecto" ? "nota" as const : "tarea" as const,
          texto: (it.tipo === "nota_proyecto" ? it.descripcion ?? it.titulo : it.titulo ?? it.descripcion) ?? "",
          proyecto: pName(it.projectIdGuess) ?? undefined,
          responsable: it.tipo === "tarea" ? uName(it.assigneeIdGuess) ?? undefined : undefined,
          fecha_limite: it.tipo === "tarea" ? it.fecha ?? undefined : undefined,
          descripcion: it.tipo === "tarea" && it.descripcion ? it.descripcion : undefined,
          pingear: it.pingear && !!it.projectIdGuess ? true : undefined,
          avisar_al_terminar: it.pingear && it.pingRecipientIdsGuess.length ? it.pingRecipientIdsGuess.map((id) => uName(id)).filter((x): x is string => !!x) : undefined,
          requiere_entregable: it.requiereEntregable || undefined,
          instrucciones_entregable: it.instruccionesEntregable ?? undefined,
          _proyectoMencionado: it.projectNameRaw, _responsableMencionado: it.assigneeNameRaw,
        }))
        const lines = out.map((it, i) => {
          const warn: string[] = []
          if (it._proyectoMencionado && !it.proyecto) warn.push(`proyecto "${it._proyectoMencionado}" no encontrado`)
          if (it.tipo === "nota" && !it.proyecto) warn.push("las notas necesitan proyecto")
          if (it._responsableMencionado && !it.responsable) warn.push(`"${it._responsableMencionado}" no encontrado en el equipo`)
          const extra = [
            it.descripcion ? `   Descripción: ${it.descripcion}` : "",
            it.requiere_entregable ? `   📎 Pide entregable${it.instrucciones_entregable ? `: ${it.instrucciones_entregable}` : ""}` : "",
            it.pingear ? `   🔔 Ping al completar: ${it.avisar_al_terminar?.length ? it.avisar_al_terminar.join(", ") : "equipo del proyecto"}` : "",
          ].filter(Boolean).join("\n")
          return `${i + 1}. ${it.tipo === "tarea" ? "☐ Tarea" : "📝 Nota"}: ${it.texto}\n   ${it.proyecto ?? "sin proyecto"}${it.responsable ? ` · ${it.responsable}` : ""}${it.fecha_limite ? ` · vence ${it.fecha_limite}` : ""}${extra ? `\n${extra}` : ""}${warn.length ? `\n   ⚠️ ${warn.join("; ")}` : ""}`
        })
        const clean = out.map(({ _proyectoMencionado, _responsableMencionado, ...rest }) => { void _proyectoMencionado; void _responsableMencionado; return rest })
        return textResult(`Vista previa (nada creado todavía):\n${lines.join("\n")}\n\nMuestra esto al usuario. Si lo aprueba (o tras aplicar sus ajustes), llama de nuevo con confirmar: true e items:\n${JSON.stringify(clean)}`)
      }

      if (!confirmar) {
        return textResult(`Crearía ${items.length} elemento(s):\n${items.map((it, i) => `${i + 1}. ${it.tipo === "tarea" ? "☐" : "📝"} ${it.texto} · ${it.proyecto ?? "sin proyecto"}${it.responsable ? ` · ${it.responsable}` : ""}${it.fecha_limite ? ` · vence ${it.fecha_limite}` : ""}${it.pingear ? " · 🔔 ping" : ""}${it.requiere_entregable ? " · 📎 entregable" : ""}${it.descripcion ? " · con descripción" : ""}`).join("\n")}\n\nNo se creó nada. Si es correcto, vuelve a llamar con confirmar: true.`)
      }
      const done: string[] = [], failed: string[] = []
      for (const [i, it] of items.entries()) {
        try {
          const projectId = await resolveProjectId(it.proyecto)
          if (it.tipo === "nota") {
            if (!projectId) throw new Error("las notas necesitan proyecto")
            const wantsTeam = !!it.avisar_a && ["todos", "equipo", "todo el equipo"].includes(it.avisar_a.trim().toLowerCase())
            const recipientId = !wantsTeam && it.avisar_a ? await resolveAssigneeId(it.avisar_a) : null
            await addLogEntry(projectId, it.texto, actingProfileId, { team: wantsTeam, recipientIds: recipientId ? [recipientId] : undefined })
          } else {
            const fd = new FormData()
            fd.set("title", it.texto)
            fd.set("status", "Todo")
            if (projectId) fd.set("project_id", projectId)
            const assigneeId = await resolveAssigneeId(it.responsable)
            if (assigneeId) fd.set("assignee_id", assigneeId)
            if (it.fecha_limite) fd.set("due_date", it.fecha_limite)
            if (it.descripcion?.trim()) fd.set("description", it.descripcion.trim())
            if (it.requiere_entregable) {
              fd.set("requires_deliverable", "true")
              if (it.instrucciones_entregable?.trim()) fd.set("deliverable_instructions", it.instrucciones_entregable.trim())
            }
            const pinged = !!it.pingear && !!projectId
            fd.set("is_pinged", String(pinged))
            if (pinged && it.avisar_al_terminar?.length) {
              const ids = (await Promise.all(it.avisar_al_terminar.map((n) => resolveAssigneeId(n)))).filter(Boolean)
              fd.set("ping_recipient_ids_json", JSON.stringify(ids))
            }
            await createTask(fd, actingProfileId)
          }
          done.push(`${i + 1}. ${it.texto}`)
        } catch (e) { failed.push(`${i + 1}. ${it.texto} — ${e instanceof Error ? e.message : e}`) }
      }
      return textResult(`${done.length ? `✅ Creado (${done.length}):\n${done.join("\n")}` : ""}${failed.length ? `\n\n❌ No se pudo (${failed.length}):\n${failed.join("\n")}` : ""}`)
    },
  )

  // --- Tools de lectura — misma filosofía de fallbacks que las de
  // escritura (ambigüedad nunca se adivina, vacío siempre explicado,
  // listas largas siempre con tope), documentada con el detalle completo
  // en docs/agent-guides/mcp-server.md. Ninguna de estas tenía ya un
  // chequeo de permiso por rol antes de esto (igual que addLogEntry) —
  // heredan ese mismo criterio abierto-a-cualquier-logueado, no uno nuevo
  // y más estricto.

  server.registerTool(
    "listar_proyectos",
    {
      title: "Listar proyectos",
      description: "Lista proyectos. Sin query, regresa solo los activos (no completados). Con query, busca por nombre entre todos.",
      inputSchema: z.object({
        query: z.string().optional().describe("Nombre o parte del nombre a buscar — si se omite, lista los proyectos activos."),
      }),
    },
    async ({ query }) => {
      const admin = createAdminClient()
      let q = admin.from("projects").select("name, status, customer:customers(name)")
      q = query?.trim() ? q.ilike("name", `%${query.trim()}%`) : q.neq("status", "Completed")
      const { data } = await q.order("name").limit(20)
      if (!data || data.length === 0) return textResult(query ? `Ningún proyecto coincide con "${query}".` : "No hay proyectos activos.")
      const lines = data.map((p) => `- ${p.name} (${p.status}${p.customer && "name" in p.customer ? `, cliente: ${(p.customer as { name: string }).name}` : ""})`)
      const suffix = data.length === 20 ? "\n(mostrando los primeros 20 — sé más específico si buscabas otro)" : ""
      return textResult(`${query ? "Proyectos que coinciden" : "Proyectos activos"}:\n${lines.join("\n")}${suffix}`)
    },
  )

  server.registerTool(
    "estado_proyecto",
    {
      title: "Estado de un proyecto",
      description: "Status, fechas, cliente, conteo de tareas por estado y ciclo activo (si es paid media) de un proyecto. No trae métricas de anuncios: para gasto/resultados de Meta usa meta_estado_cliente.",
      inputSchema: z.object({ proyecto: z.string().min(1) }),
    },
    async ({ proyecto }) => {
      const admin = createAdminClient()
      const projectId = await resolveProjectId(proyecto)
      if (!projectId) throw new Error(`No encontré el proyecto "${proyecto}".`)

      const { data: project } = await admin
        .from("projects")
        .select("name, status, progress, start_date, end_date, project_type, auto_close_cycles, customer:customers(name)")
        .eq("id", projectId)
        .single()
      if (!project) throw new Error(`No encontré el proyecto "${proyecto}".`)

      const { data: tasks } = await admin.from("tasks").select("status").eq("project_id", projectId)
      const counts = { Todo: 0, "In Progress": 0, Done: 0 } as Record<string, number>
      for (const t of tasks ?? []) counts[t.status] = (counts[t.status] ?? 0) + 1

      const lines = [
        `${project.name} — status: ${project.status} (${project.progress ?? 0}% de avance)`,
        project.customer && "name" in project.customer ? `Cliente: ${(project.customer as { name: string }).name}` : null,
        project.start_date || project.end_date ? `Fechas: ${formatDate(project.start_date)} → ${formatDate(project.end_date)}` : null,
        `Tareas: ${counts.Todo} por hacer, ${counts["In Progress"]} en progreso, ${counts.Done} completadas`,
      ].filter(Boolean)

      if (project.project_type === "paid_media") {
        const { data: cycle } = await admin
          .from("paid_media_cycles")
          .select("start_date, end_date")
          .eq("project_id", projectId)
          .eq("is_active", true)
          .maybeSingle()
        if (cycle) {
          const overdue = cycle.end_date < todayIso()
          lines.push(`Ciclo activo: ${formatDate(cycle.start_date)} → ${formatDate(cycle.end_date)}${overdue ? " — ⚠️ VENCIDO, no se ha cerrado" : ""}`)
          lines.push("Métricas de Meta (gasto, resultados, por anuncio): usa meta_estado_cliente.")
        } else {
          lines.push("Ciclo de paid media: no tiene un ciclo activo en este momento.")
        }
      }

      return textResult(lines.join("\n"))
    },
  )

  server.registerTool(
    "miembros_proyecto",
    {
      title: "Miembros de un proyecto",
      description: "Quién está asignado a un proyecto y con qué puesto.",
      inputSchema: z.object({ proyecto: z.string().min(1) }),
    },
    async ({ proyecto }) => {
      const admin = createAdminClient()
      const projectId = await resolveProjectId(proyecto)
      if (!projectId) throw new Error(`No encontré el proyecto "${proyecto}".`)

      const { data } = await admin
        .from("project_members")
        .select("profile:profiles(full_name, role, position:positions(name))")
        .eq("project_id", projectId)
      if (!data || data.length === 0) return textResult("Este proyecto no tiene miembros asignados todavía.")

      const lines = data.map((m) => {
        const p = m.profile as unknown as { full_name: string; role: string; position: { name: string } | null } | null
        if (!p) return null
        return `- ${p.full_name}${p.position?.name ? ` (${p.position.name})` : ""}`
      }).filter(Boolean)
      return textResult(`Miembros del proyecto:\n${lines.join("\n")}`)
    },
  )

  server.registerTool(
    "resumen_tareas",
    {
      title: "Resumen de tareas",
      description: "Overview de tareas abiertas/vencidas — se necesita al menos un proyecto o una persona, para no traer todo el sistema de golpe.",
      inputSchema: z.object({
        proyecto: z.string().optional(),
        asignado_a: z.string().optional(),
      }),
    },
    async ({ proyecto, asignado_a }, ctx: ToolCtx) => {
      if (!proyecto?.trim() && !asignado_a?.trim()) throw new Error("Dame al menos un proyecto o una persona — traer TODAS las tareas del sistema de un jalón no es útil.")
      const actingProfileId = requireProfileId(ctx)
      const admin = createAdminClient()
      const projectId = await resolveProjectId(proyecto)
      const assigneeId = await resolveAssigneeId(asignado_a)

      let q = admin.from("tasks").select("id, title, status, due_date, is_personal, assignee_id, requires_deliverable, project:projects(name)").neq("status", "Done")
      if (projectId) q = q.eq("project_id", projectId)
      if (assigneeId) q = q.eq("assignee_id", assigneeId)
      const { data } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(20)
      if (!data || data.length === 0) return textResult("No hay tareas abiertas que coincidan con eso.")

      // Una tarea personal de OTRA persona nunca debe filtrarse por aquí —
      // solo se muestra si es del que está preguntando.
      const visible = data.filter((t) => !t.is_personal || t.assignee_id === actingProfileId)
      if (visible.length === 0) return textResult("No hay tareas abiertas visibles que coincidan con eso.")

      const today = todayIso()
      const flags = await deliverableFlags(visible)
      const lines = visible.map((t) => {
        const overdue = t.due_date && t.due_date < today
        const proj = t.project && "name" in t.project ? (t.project as { name: string }).name : "personal"
        return `- ${t.title} [${t.status}] · ${proj} · vence ${formatDate(t.due_date)}${overdue ? " ⚠️ VENCIDA" : ""}${flags.get(t.id) ?? ""}`
      })
      const suffix = data.length === 20 ? "\n(mostrando las 20 más próximas — hay más)" : ""
      return textResult(`Tareas abiertas:\n${lines.join("\n")}${suffix}`)
    },
  )

  server.registerTool(
    "bitacora_proyecto",
    {
      title: "Bitácora de un proyecto",
      description: "Contexto fijo del proyecto (acuerdos, con quién se habla, reglas) y las notas más recientes de su bitácora. Consúltalo antes de proponer o ejecutar algo sobre un proyecto.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        limite: z.number().int().min(1).max(30).optional().describe("Default 10, tope 30."),
      }),
    },
    async ({ proyecto, limite }) => {
      const admin = createAdminClient()
      const projectId = await resolveProjectId(proyecto)
      if (!projectId) throw new Error(`No encontré el proyecto "${proyecto}".`)

      const { data } = await admin
        .from("project_log_entries")
        .select("body, created_at, pinned, author:profiles!project_log_entries_author_id_fkey(full_name)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(limite ?? 10)
      const ctx = await getProjectContext(projectId)
      if ((!data || data.length === 0) && !ctx.pinned.length) return textResult("Este proyecto no tiene notas en su bitácora todavía.")

      const lines = (data ?? []).filter((e) => !e.pinned).map((e) => {
        const author = e.author && "full_name" in e.author ? (e.author as { full_name: string }).full_name : "alguien"
        return `- [${formatDate(e.created_at)}] ${author}: ${e.body}`
      })
      if (ctx.pinned.length) lines.unshift(`📌 CONTEXTO FIJO (cómo funciona el proyecto hoy):\n${ctx.pinned.map((p) => `- ${p}`).join("\n")}\n\nNotas:`)
      return textResult(`Bitácora (más reciente primero):\n${lines.join("\n")}`)
    },
  )

  server.registerTool(
    "mis_tareas_pendientes",
    {
      title: "Mis tareas pendientes",
      description: "Tus propias tareas abiertas (asignadas a ti), ordenadas por fecha límite.",
      inputSchema: z.object({}),
    },
    async (_args, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const admin = createAdminClient()
      const { data } = await admin
        .from("tasks")
        .select("id, title, status, due_date, requires_deliverable, project:projects(name)")
        .eq("assignee_id", actingProfileId)
        .neq("status", "Done")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(20)
      if (!data || data.length === 0) return textResult("No tienes tareas abiertas — todo al día.")

      const today = todayIso()
      const flags = await deliverableFlags(data)
      const lines = data.map((t) => {
        const overdue = t.due_date && t.due_date < today
        const proj = t.project && "name" in t.project ? (t.project as { name: string }).name : "personal"
        return `- ${t.title} [${t.status}] · ${proj} · vence ${formatDate(t.due_date)}${overdue ? " ⚠️ VENCIDA" : ""}${flags.get(t.id) ?? ""}`
      })
      const suffix = data.length === 20 ? "\n(mostrando las 20 más próximas — hay más)" : ""
      return textResult(`Tus tareas abiertas:\n${lines.join("\n")}${suffix}`)
    },
  )

  server.registerTool(
    "buscar_empleado",
    {
      title: "Buscar empleado",
      description: "Datos de una persona del equipo — puesto, contacto, cuántas tareas abiertas tiene.",
      inputSchema: z.object({ nombre: z.string().min(1) }),
    },
    async ({ nombre }) => {
      const admin = createAdminClient()
      const { data: candidates } = await admin
        .from("profiles")
        .select("id, full_name, role, phone, email, telegram_chat_id, position:positions(name)")
        .ilike("full_name", `%${nombre.trim()}%`)
        .limit(6)
      if (!candidates || candidates.length === 0) throw new Error(`No encontré a nadie en el equipo que coincida con "${nombre}".`)
      if (candidates.length > 1) throw new Error(`"${nombre}" coincide con varias personas: ${candidates.map((p) => p.full_name).join(", ")}. Sé más específico.`)

      const person = candidates[0]
      const position = person.position && "name" in person.position ? (person.position as { name: string }).name : null
      const { count } = await admin.from("tasks").select("*", { count: "exact", head: true }).eq("assignee_id", person.id).neq("status", "Done")

      const lines = [
        `${person.full_name} — ${person.role}${position ? `, ${position}` : ""}`,
        person.email ? `Email: ${person.email}` : null,
        person.phone ? `Teléfono: ${person.phone}` : null,
        `Telegram: ${person.telegram_chat_id ? "vinculado" : "no vinculado"}`,
        `Tareas abiertas: ${count ?? 0}`,
      ].filter(Boolean)
      return textResult(lines.join("\n"))
    },
  )

  // --- Ofertas (Servicios) — a diferencia de tareas/proyectos, crear/
  // editar/archivar ofertas es admin/subadmin-only. Antes eso SOLO se
  // enforced vía RLS (nunca en código de la app) — createServiceOffer/
  // archiveServiceOffer/attachServiceOfferToProject ahora chequean el rol
  // explícito (ver requireOffersPermission en services.ts) antes de
  // escribir, para no heredar por accidente un bypass de permisos al
  // reusar el cliente admin desde aquí.

  server.registerTool(
    "listar_ofertas",
    {
      title: "Listar ofertas de servicio",
      description: "Lista ofertas del catálogo de Servicios. Sin query, solo las activas (no archivadas).",
      inputSchema: z.object({ query: z.string().optional() }),
    },
    async ({ query }) => {
      const admin = createAdminClient()
      let q = admin.from("service_offers").select("name, category, price, currency, status")
      q = query?.trim() ? q.ilike("name", `%${query.trim()}%`) : q.eq("status", "active")
      const { data } = await q.order("category").order("name").limit(30)
      if (!data || data.length === 0) return textResult(query ? `Ninguna oferta coincide con "${query}".` : "No hay ofertas activas.")
      const lines = data.map((o) => `- [${o.category}] ${o.name}${o.price != null ? ` — $${o.price} ${o.currency}` : " — sin precio fijo"}${o.status === "archived" ? " (archivada)" : ""}`)
      const suffix = data.length === 30 ? "\n(mostrando las primeras 30 — sé más específico si buscabas otra)" : ""
      return textResult(`${query ? "Ofertas que coinciden" : "Ofertas activas"}:\n${lines.join("\n")}${suffix}`)
    },
  )

  server.registerTool(
    "detalle_oferta",
    {
      title: "Detalle de una oferta",
      description: "Descripción completa, deliverables y precio de una oferta del catálogo.",
      inputSchema: z.object({ nombre: z.string().min(1) }),
    },
    async ({ nombre }) => {
      const admin = createAdminClient()
      const { id } = await resolveOfferId(nombre)
      const { data: offer } = await admin.from("service_offers").select("name, category, description, price, currency, price_note, status, deliverables").eq("id", id).single()
      if (!offer) throw new Error(`No encontré la oferta "${nombre}".`)

      const deliverables = (offer.deliverables ?? []) as { text: string; control_text?: string | null; cadence: string; quantity: number | null }[]
      const lines = [
        `${offer.name} [${offer.category}]${offer.status === "archived" ? " (archivada)" : ""}`,
        offer.description ? offer.description : null,
        offer.price != null ? `Precio: $${offer.price} ${offer.currency}${offer.price_note ? ` (${offer.price_note})` : ""}` : "Sin precio fijo.",
        deliverables.length > 0
          ? `Deliverables:\n${deliverables.map((d) => `  - ${d.text}${d.control_text ? ` [control: ${d.control_text}]` : ""} (${d.cadence}${d.quantity ? `, x${d.quantity}` : ""})`).join("\n")}`
          : "Sin deliverables estructurados.",
      ].filter(Boolean)
      return textResult(lines.join("\n"))
    },
  )

  server.registerTool(
    "ofertas_de_proyecto",
    {
      title: "Ofertas asignadas a un proyecto",
      description: "Qué ofertas de Servicios tiene contratadas un proyecto.",
      inputSchema: z.object({ proyecto: z.string().min(1) }),
    },
    async ({ proyecto }) => {
      const admin = createAdminClient()
      const projectId = await resolveProjectId(proyecto)
      if (!projectId) throw new Error(`No encontré el proyecto "${proyecto}".`)

      const { data } = await admin.from("project_service_offers").select("offer:service_offers(name, category)").eq("project_id", projectId)
      if (!data || data.length === 0) return textResult("Este proyecto no tiene ofertas de Servicios asignadas.")
      const lines = data.map((r) => {
        const o = r.offer as unknown as { name: string; category: string } | null
        return o ? `- [${o.category}] ${o.name}` : null
      }).filter(Boolean)
      return textResult(`Ofertas asignadas:\n${lines.join("\n")}`)
    },
  )

  // Líneas de entregables de una oferta: texto de venta, texto de control
  // (lo que se palomea en el proyecto), cadencia y cantidad.
  const CADENCIA = { una_vez: "once", por_periodo: "monthly", cada_3_periodos: "quarterly", cada_6_periodos: "biannual", continuo: "continuous" } as const
  const CAD_LABEL: Record<string, string> = { once: "una vez", monthly: "por periodo", quarterly: "cada 3 periodos", biannual: "cada 6 periodos", continuous: "continuo" }
  const Linea = z.object({
    texto: z.string().min(1).describe("Texto de venta (lo que ve el cliente en la oferta)"),
    control: z.string().optional().describe("Texto de control: corto y verificable, lo que se palomea (ej. '6 piezas visuales')"),
    cadencia: z.enum(["una_vez", "por_periodo", "cada_3_periodos", "cada_6_periodos", "continuo"]).optional(),
    cantidad: z.number().int().positive().optional().describe("Unidades por periodo; no aplica a 'continuo'"),
  })
  type Del = { id: string; text: string; control_text: string | null; cadence: string; quantity: number | null; added_at: string | null }
  const toDel = (l: z.infer<typeof Linea>): Del => {
    const cadence = l.cadencia ? CADENCIA[l.cadencia] : "once"
    return { id: crypto.randomUUID(), text: l.texto.trim(), control_text: l.control?.trim() || null, cadence, quantity: cadence === "continuous" ? null : l.cantidad ?? null, added_at: todayIso() }
  }
  const fmtDel = (d: Del, i: number) => `${i + 1}. ${d.text}${d.control_text ? ` [control: ${d.control_text}]` : ""} · ${CAD_LABEL[d.cadence] ?? d.cadence}${d.quantity ? ` ×${d.quantity}` : ""}`

  server.registerTool(
    "crear_oferta",
    {
      title: "Crear oferta de servicio",
      description: "Crea una oferta nueva en el catálogo de Servicios. Solo admin/subadmin.",
      inputSchema: z.object({
        nombre: z.string().min(1),
        categoria: z.string().min(1),
        descripcion: z.string().optional(),
        precio: z.number().optional(),
        moneda: z.enum(["MXN", "USD"]).optional(),
        entregables: z.array(Linea).max(60).optional().describe("Líneas de entregables con su control, cadencia y cantidad"),
      }),
    },
    async ({ nombre, categoria, descripcion, precio, moneda, entregables }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const fd = new FormData()
      if (entregables?.length) fd.set("deliverables_json", JSON.stringify(entregables.map(toDel)))
      fd.set("name", nombre)
      fd.set("category", categoria)
      if (descripcion) fd.set("description", descripcion)
      if (precio != null) fd.set("price", String(precio))
      fd.set("currency", moneda ?? "MXN")
      await createServiceOffer(fd, actingProfileId)
      return textResult(`Oferta "${nombre}" creada en la categoría "${categoria}"${entregables?.length ? ` con ${entregables.length} entregable(s):\n${entregables.map(toDel).map(fmtDel).join("\n")}` : "."}`)
    },
  )

  server.registerTool(
    "oferta_entregables",
    {
      title: "Editar entregables de una oferta",
      description: "Agrega, edita, quita o mueve líneas de entregables de una oferta del catálogo (texto de venta, texto de control, cadencia, cantidad). Las líneas se indican por número (de detalle_oferta) o por parte de su texto. Las líneas nuevas cuentan desde hoy en los proyectos que ya tienen la oferta. Sin confirmar: true solo muestra antes → después. Solo admin/subadmin.",
      inputSchema: z.object({
        oferta: z.string().min(1),
        cambios: z.array(z.object({
          accion: z.enum(["agregar", "editar", "quitar", "mover"]),
          linea: z.string().optional().describe("Número de línea o parte de su texto (editar/quitar/mover)"),
          texto: z.string().optional(), control: z.string().optional(),
          cadencia: Linea.shape.cadencia, cantidad: z.number().int().nonnegative().optional().describe("0 para quitar la cantidad"),
          posicion: z.number().int().positive().optional().describe("agregar/mover: posición destino (1 = primera)"),
        })).min(1).max(40),
        confirmar: z.boolean().default(false),
      }),
    },
    async ({ oferta, cambios, confirmar }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const { id } = await resolveOfferId(oferta)
      const { data: o } = await createAdminClient().from("service_offers").select("*").eq("id", id).single()
      if (!o) throw new Error("No encontré la oferta.")
      const before = ((o.deliverables ?? []) as Del[]).map((d) => ({ ...d, id: d.id || crypto.randomUUID(), control_text: d.control_text ?? null, quantity: d.quantity ?? null, added_at: d.added_at ?? null }))
      const list = before.map((d) => ({ ...d }))
      const find = (ref?: string) => {
        if (!ref?.trim()) throw new Error("Falta indicar la línea.")
        if (/^\d+$/.test(ref.trim())) { const d = list[Number(ref) - 1]; if (!d) throw new Error(`No hay línea ${ref}.`); return d }
        const q = ref.trim().toLowerCase()
        const hits = list.filter((d) => d.text.toLowerCase().includes(q) || (d.control_text ?? "").toLowerCase().includes(q))
        if (hits.length !== 1) throw new Error(hits.length ? `"${ref}" coincide con varias líneas; usa el número.` : `No encontré la línea "${ref}".`)
        return hits[0]
      }
      for (const c of cambios) {
        if (c.accion === "agregar") {
          if (!c.texto?.trim()) throw new Error("Para agregar hace falta el texto de venta.")
          const d = toDel({ texto: c.texto, control: c.control, cadencia: c.cadencia, cantidad: c.cantidad || undefined })
          list.splice(c.posicion ? Math.min(c.posicion - 1, list.length) : list.length, 0, d)
        } else if (c.accion === "editar") {
          const d = find(c.linea)
          if (c.texto != null) d.text = c.texto.trim()
          if (c.control != null) d.control_text = c.control.trim() || null
          if (c.cadencia) d.cadence = CADENCIA[c.cadencia]
          if (c.cantidad != null) d.quantity = c.cantidad || null
          if (d.cadence === "continuous") d.quantity = null
        } else if (c.accion === "quitar") {
          const d = find(c.linea); list.splice(list.indexOf(d), 1)
        } else {
          const d = find(c.linea); if (!c.posicion) throw new Error("Para mover indica la posición.")
          list.splice(list.indexOf(d), 1); list.splice(Math.min(c.posicion - 1, list.length), 0, d)
        }
      }
      const desc = `Oferta "${o.name}"\nAntes (${before.length}):\n${before.map(fmtDel).join("\n") || "(sin entregables)"}\n\nDespués (${list.length}):\n${list.map(fmtDel).join("\n") || "(sin entregables)"}`
      if (!confirmar) return textResult(`${desc}\n\nNo se cambió nada. Si es correcto, vuelve a llamar con confirmar: true.`)
      const fd = new FormData()
      fd.set("name", o.name); fd.set("category", o.category)
      if (o.description) fd.set("description", o.description)
      fd.set("is_base", String(!!o.is_base))
      if (o.based_on_offer_id) fd.set("based_on_offer_id", o.based_on_offer_id)
      if (o.default_project_type_id) fd.set("default_project_type_id", o.default_project_type_id)
      if (o.price != null) fd.set("price", String(o.price))
      if (o.currency) fd.set("currency", o.currency)
      if (o.price_note) fd.set("price_note", o.price_note)
      fd.set("deliverables_json", JSON.stringify(list))
      await updateServiceOffer(o.id, fd, actingProfileId)
      return textResult(`✅ Entregables actualizados.\n${desc}`)
    },
  )

  server.registerTool(
    "archivar_oferta",
    {
      title: "Archivar/reactivar una oferta",
      description: "Archiva (o reactiva) una oferta existente del catálogo. Solo admin/subadmin.",
      inputSchema: z.object({
        nombre: z.string().min(1),
        archivar: z.boolean().default(true).describe("true para archivar, false para reactivar."),
      }),
    },
    async ({ nombre, archivar }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const { id, status } = await resolveOfferId(nombre)
      if (archivar && status === "archived") return textResult(`"${nombre}" ya estaba archivada.`)
      if (!archivar && status === "active") return textResult(`"${nombre}" ya estaba activa.`)
      await archiveServiceOffer(id, archivar, actingProfileId)
      return textResult(`Oferta "${nombre}" ${archivar ? "archivada" : "reactivada"}.`)
    },
  )

  server.registerTool(
    "asignar_oferta_a_proyecto",
    {
      title: "Asignar una oferta a un proyecto",
      description: "Contrata/asigna una oferta del catálogo de Servicios a un proyecto. Solo admin/subadmin.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        oferta: z.string().min(1),
      }),
    },
    async ({ proyecto, oferta }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const projectId = await resolveProjectId(proyecto)
      if (!projectId) throw new Error(`No encontré el proyecto "${proyecto}".`)
      const { id: offerId } = await resolveOfferId(oferta)
      await attachServiceOfferToProject(projectId, offerId, actingProfileId)
      return textResult(`Oferta "${oferta}" asignada al proyecto.`)
    },
  )
}
