import { SupabaseClient } from "@supabase/supabase-js"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { findByName, findAllMatches } from "@/lib/telegram-bot/match"
import { notify } from "@/lib/notifications/notify"
import type { Movimiento } from "@/lib/telegram-bot/classify"

export async function handleTarea(
  supabase: SupabaseClient,
  chatId: number,
  movimiento: Movimiento,
  projects: { id: string; name: string }[],
  profiles: { id: string; full_name: string }[],
) {
  const titulo = movimiento.titulo || movimiento.descripcion
  if (!titulo) {
    await sendMessage(chatId, "¿Cuál es el título de la tarea?")
    return
  }

  const project = findByName(projects, movimiento.proyecto)

  // Sin mención explícita de responsable, la tarea se asigna a quien dicta
  // (TELEGRAM_BOT_AUTHOR_ID) en vez de quedar sin dueño — así ningún
  // pendiente dictado al vuelo se pierde. Si SÍ se menciona un nombre, ya
  // no se adivina con la primera coincidencia: si es ambiguo o no hay
  // match, se pregunta en vez de arriesgarse a asignarla a la persona
  // equivocada.
  let assigneeId: string | null = null
  let assigneeName: string | null = null

  if (!movimiento.asignado) {
    assigneeId = process.env.TELEGRAM_BOT_AUTHOR_ID ?? null
  } else {
    const matches = findAllMatches(profiles, (p) => p.full_name, movimiento.asignado)
    if (matches.length === 0) {
      await sendMessage(chatId, `No encontré a nadie del equipo llamado "${movimiento.asignado}" — ¿me confirmas el nombre?`)
      return
    }
    if (matches.length > 1) {
      await sendMessage(
        chatId,
        `Hay varias personas que podrían ser "${movimiento.asignado}" — sé más específico:\n${matches.slice(0, 8).map((m) => `• ${m.full_name}`).join("\n")}`
      )
      return
    }
    assigneeId = matches[0].id
    assigneeName = matches[0].full_name
  }

  // "personal" solo tiene sentido cuando SÍ hay proyecto — sin proyecto la
  // tarea ya es personal por definición (cae directo en "Mi lista").
  const isPersonal = !!project && !!movimiento.personal

  const { error } = await supabase.from("tasks").insert({
    project_id: project?.id ?? null,
    title: titulo,
    status: "Todo",
    due_date: movimiento.fecha ?? null,
    assignee_id: assigneeId,
    is_personal: isPersonal,
  })
  if (error) throw error

  // Este handler escribe directo en la tabla (como el resto del bot), sin
  // pasar por createTask() de lib/actions/tasks.ts — que es donde vive el
  // notify(task_assigned) normal. Se llama aquí explícitamente, y solo
  // cuando de verdad se le asignó a alguien más por nombre (no al
  // auto-asignado a uno mismo, que ya vio la confirmación al dictar).
  if (assigneeName) {
    await notify(assigneeId!, "task_assigned", { taskTitle: titulo, projectName: project?.name })
  }

  await sendMessage(
    chatId,
    `✅ Tarea creada: ${titulo}${project ? ` · ${project.name}` : " (sin proyecto)"}${isPersonal ? " 🔒 personal" : ""}${assigneeName ? `\n👤 ${assigneeName}` : ""}${movimiento.fecha ? `\n📅 ${movimiento.fecha}` : ""}`
  )
}

// Siempre requiere proyecto — títulos de tarea se repiten entre proyectos
// (son estandarizados por naturaleza iterativa), así que buscar sin acotar
// por proyecto produciría ambigüedad casi garantizada.
export async function handleTareaCompletada(
  supabase: SupabaseClient,
  chatId: number,
  movimiento: Movimiento,
  projects: { id: string; name: string }[],
) {
  const project = findByName(projects, movimiento.proyecto)
  if (!project) {
    await sendMessage(chatId, `¿De qué proyecto es esta tarea? Proyectos activos: ${projects.map((p) => p.name).join(", ") || "(ninguno)"}`)
    return
  }

  const titulo = movimiento.titulo || movimiento.descripcion
  if (!titulo) {
    await sendMessage(chatId, "¿Cuál es el título (o parte del título) de la tarea que quieres marcar como hecha?")
    return
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, phase_id")
    .eq("project_id", project.id)
    .neq("status", "Done")

  const matches = findAllMatches(tasks ?? [], (t) => t.title, titulo)

  if (matches.length === 0) {
    await sendMessage(chatId, `No encontré ninguna tarea abierta en ${project.name} que coincida con "${titulo}".`)
    return
  }
  if (matches.length > 1) {
    await sendMessage(
      chatId,
      `Encontré varias tareas en ${project.name} que podrían ser — sé más específico:\n${matches.slice(0, 8).map((m) => `• ${m.title}`).join("\n")}`
    )
    return
  }

  const task = matches[0]

  // Misma regla que updateTaskStatus() en lib/actions/tasks.ts — no se
  // puede marcar Done con checklist items obligatorios pendientes.
  const { count } = await supabase
    .from("task_checklist_items")
    .select("*", { count: "exact", head: true })
    .eq("task_id", task.id)
    .eq("is_blocking", true)
    .eq("is_checked", false)
  if (count && count > 0) {
    await sendMessage(chatId, `"${task.title}" tiene ${count} ítem${count > 1 ? "s" : ""} obligatorio${count > 1 ? "s" : ""} sin completar en su checklist — no se puede marcar como hecha todavía.`)
    return
  }

  const { error } = await supabase.from("tasks").update({ status: "Done" }).eq("id", task.id)
  if (error) throw error

  await sendMessage(chatId, `✅ Tarea completada: ${task.title} · ${project.name}`)
}
