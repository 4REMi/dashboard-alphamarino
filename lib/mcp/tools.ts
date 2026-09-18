import { z } from "zod"
import type { McpServer, AuthInfo } from "@modelcontextprotocol/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createTask, updateTaskStatus } from "@/lib/actions/tasks"
import { addLogEntry } from "@/lib/actions/projects"
import { createServiceOffer, archiveServiceOffer } from "@/lib/actions/services"
import { attachServiceOfferToProject } from "@/lib/actions/service-deliverables"

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

async function resolveOfferId(offerName: string): Promise<{ id: string; status: string }> {
  const admin = createAdminClient()
  const { data } = await admin.from("service_offers").select("id, name, status").ilike("name", `%${offerName.trim()}%`).limit(6)
  if (!data || data.length === 0) throw new Error(`No encontré ninguna oferta que coincida con "${offerName}".`)
  if (data.length > 1) throw new Error(`"${offerName}" coincide con varias ofertas: ${data.map((o) => o.name).join(", ")}. Sé más específico.`)
  return data[0]
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
      description: "Agrega una entrada a la bitácora (log) de un proyecto — para dejar constancia de algo, no es una tarea. Silenciosa por default; opcionalmente puede avisar por Telegram.",
      inputSchema: z.object({
        proyecto: z.string().min(1),
        nota: z.string().min(1),
        avisar_a: z.string().optional().describe('"todos"/"equipo" para avisarle a todo el equipo del proyecto, o el nombre de una persona (match parcial) para avisarle solo a ella. Si se omite, la nota queda silenciosa (default).'),
      }),
    },
    async ({ proyecto, nota, avisar_a }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const projectId = await resolveProjectId(proyecto)
      if (!projectId) throw new Error(`No encontré el proyecto "${proyecto}".`)

      const wantsTeam = !!avisar_a && ["todos", "equipo", "todo el equipo"].includes(avisar_a.trim().toLowerCase())
      const recipientId = !wantsTeam && avisar_a ? await resolveAssigneeId(avisar_a) : null

      await addLogEntry(projectId, nota, actingProfileId, { team: wantsTeam, recipientIds: recipientId ? [recipientId] : undefined })
      return textResult(`Nota agregada a la bitácora del proyecto${wantsTeam ? " — se avisó a todo el equipo." : recipientId ? " — se avisó a la persona indicada." : "."}`)
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
      description: "Status, fechas, cliente, conteo de tareas por estado y ciclo activo (si es paid media) de un proyecto.",
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
          .select("start_date, end_date, status")
          .eq("project_id", projectId)
          .eq("status", "active")
          .order("start_date", { ascending: false })
          .maybeSingle()
        if (cycle) {
          const overdue = cycle.end_date < todayIso()
          lines.push(`Ciclo activo: ${formatDate(cycle.start_date)} → ${formatDate(cycle.end_date)}${overdue ? " — ⚠️ VENCIDO, no se ha cerrado" : ""}`)
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

      let q = admin.from("tasks").select("title, status, due_date, is_personal, assignee_id, project:projects(name)").neq("status", "Done")
      if (projectId) q = q.eq("project_id", projectId)
      if (assigneeId) q = q.eq("assignee_id", assigneeId)
      const { data } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(20)
      if (!data || data.length === 0) return textResult("No hay tareas abiertas que coincidan con eso.")

      // Una tarea personal de OTRA persona nunca debe filtrarse por aquí —
      // solo se muestra si es del que está preguntando.
      const visible = data.filter((t) => !t.is_personal || t.assignee_id === actingProfileId)
      if (visible.length === 0) return textResult("No hay tareas abiertas visibles que coincidan con eso.")

      const today = todayIso()
      const lines = visible.map((t) => {
        const overdue = t.due_date && t.due_date < today
        const proj = t.project && "name" in t.project ? (t.project as { name: string }).name : "personal"
        return `- ${t.title} [${t.status}] · ${proj} · vence ${formatDate(t.due_date)}${overdue ? " ⚠️ VENCIDA" : ""}`
      })
      const suffix = data.length === 20 ? "\n(mostrando las 20 más próximas — hay más)" : ""
      return textResult(`Tareas abiertas:\n${lines.join("\n")}${suffix}`)
    },
  )

  server.registerTool(
    "bitacora_proyecto",
    {
      title: "Bitácora de un proyecto",
      description: "Las notas más recientes de la bitácora (log) de un proyecto.",
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
        .select("body, created_at, pinned, author:profiles(full_name)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(limite ?? 10)
      if (!data || data.length === 0) return textResult("Este proyecto no tiene notas en su bitácora todavía.")

      const lines = data.map((e) => {
        const author = e.author && "full_name" in e.author ? (e.author as { full_name: string }).full_name : "alguien"
        return `- [${formatDate(e.created_at)}]${e.pinned ? " 📌" : ""} ${author}: ${e.body}`
      })
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
        .select("title, status, due_date, project:projects(name)")
        .eq("assignee_id", actingProfileId)
        .neq("status", "Done")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(20)
      if (!data || data.length === 0) return textResult("No tienes tareas abiertas — todo al día.")

      const today = todayIso()
      const lines = data.map((t) => {
        const overdue = t.due_date && t.due_date < today
        const proj = t.project && "name" in t.project ? (t.project as { name: string }).name : "personal"
        return `- ${t.title} [${t.status}] · ${proj} · vence ${formatDate(t.due_date)}${overdue ? " ⚠️ VENCIDA" : ""}`
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

      const deliverables = (offer.deliverables ?? []) as { text: string; cadence: string; quantity: number | null }[]
      const lines = [
        `${offer.name} [${offer.category}]${offer.status === "archived" ? " (archivada)" : ""}`,
        offer.description ? offer.description : null,
        offer.price != null ? `Precio: $${offer.price} ${offer.currency}${offer.price_note ? ` (${offer.price_note})` : ""}` : "Sin precio fijo.",
        deliverables.length > 0
          ? `Deliverables:\n${deliverables.map((d) => `  - ${d.text} (${d.cadence}${d.quantity ? `, x${d.quantity}` : ""})`).join("\n")}`
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
      }),
    },
    async ({ nombre, categoria, descripcion, precio, moneda }, ctx: ToolCtx) => {
      const actingProfileId = requireProfileId(ctx)
      const fd = new FormData()
      fd.set("name", nombre)
      fd.set("category", categoria)
      if (descripcion) fd.set("description", descripcion)
      if (precio != null) fd.set("price", String(precio))
      fd.set("currency", moneda ?? "MXN")
      await createServiceOffer(fd, actingProfileId)
      return textResult(`Oferta "${nombre}" creada en la categoría "${categoria}".`)
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
