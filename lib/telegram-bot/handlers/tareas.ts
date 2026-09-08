import { SupabaseClient } from "@supabase/supabase-js"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { findByName, findAllMatches } from "@/lib/telegram-bot/match"
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
  const assignee = movimiento.asignado
    ? findByName(profiles.map((p) => ({ ...p, name: p.full_name })), movimiento.asignado)
    : null

  const { error } = await supabase.from("tasks").insert({
    project_id: project?.id ?? null,
    title: titulo,
    status: "Todo",
    due_date: movimiento.fecha ?? null,
    assignee_id: assignee?.id ?? null,
  })
  if (error) throw error

  await sendMessage(
    chatId,
    `✅ Tarea creada: ${titulo}${project ? ` · ${project.name}` : " (sin proyecto)"}${assignee ? `\n👤 ${assignee.full_name}` : ""}${movimiento.fecha ? `\n📅 ${movimiento.fecha}` : ""}`
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
