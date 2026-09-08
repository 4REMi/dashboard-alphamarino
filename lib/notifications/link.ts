import { createAdminClient } from "@/lib/supabase/admin"
import { sendMessage } from "@/lib/telegram-bot/telegram"

const CODE_PATTERN = /^[A-Z2-9]{6}$/

// Recognizes a Telegram-linking code sent to the bot from ANY chat (not
// just TELEGRAM_ALLOWED_CHAT_ID — that's the whole point, every employee
// links from their own chat) and, if it matches a pending, unexpired code,
// saves the sender's chat_id onto that profile. Returns true if this
// message was handled as a link attempt (valid or not) so the caller
// knows not to fall through to the regular bot pipeline.
export async function tryLinkTelegramAccount(chatId: number, text: string): Promise<boolean> {
  const code = text.trim().toUpperCase()
  if (!CODE_PATTERN.test(code)) return false

  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, telegram_link_code_expires_at")
    .eq("telegram_link_code", code)
    .maybeSingle()

  if (!profile || !profile.telegram_link_code_expires_at || new Date(profile.telegram_link_code_expires_at) < new Date()) {
    await sendMessage(chatId, "Ese código no es válido o ya venció. Genera uno nuevo desde tu ficha en Equipo.")
    return true
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      telegram_chat_id: chatId,
      telegram_link_code: null,
      telegram_link_code_expires_at: null,
      telegram_linked_at: new Date().toISOString(),
      telegram_unlinked_at: null,
    })
    .eq("id", profile.id)

  if (error) {
    await sendMessage(chatId, "No se pudo vincular tu cuenta — intenta de nuevo en un momento.")
    return true
  }

  await sendMessage(chatId, `✅ Telegram vinculado, ${profile.full_name}. Ya te van a llegar aquí tus notificaciones.`)
  return true
}
