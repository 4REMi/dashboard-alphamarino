import { SupabaseClient } from "@supabase/supabase-js"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { findByName } from "@/lib/telegram-bot/match"
import type { Movimiento } from "@/lib/telegram-bot/classify"

export async function handleNotaProyecto(
  supabase: SupabaseClient,
  chatId: number,
  movimiento: Movimiento,
  projects: { id: string; name: string }[],
  rawText: string,
) {
  const project = findByName(projects, movimiento.proyecto)
  if (!project) {
    await sendMessage(chatId, `¿De qué proyecto es esta nota? Proyectos activos: ${projects.map((p) => p.name).join(", ") || "(ninguno)"}`)
    return
  }

  // project_log_entries.author_id es NOT NULL y no hay un usuario autenticado
  // en este contexto (el bot escribe con el cliente admin) — se le atribuye
  // a un perfil fijo configurado por variable de entorno.
  const authorId = process.env.TELEGRAM_BOT_AUTHOR_ID
  if (!authorId) {
    await sendMessage(chatId, "⚠️ Falta configurar TELEGRAM_BOT_AUTHOR_ID para poder registrar notas de bitácora.")
    return
  }

  const body = movimiento.descripcion || rawText

  const { error } = await supabase.from("project_log_entries").insert({
    project_id: project.id,
    author_id: authorId,
    body,
  })
  if (error) throw error

  await sendMessage(chatId, `✅ Nota agregada a la bitácora de ${project.name}:\n${body}`)
}
