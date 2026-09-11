import { createAdminClient } from "@/lib/supabase/admin"
import { sendMessage } from "@/lib/telegram-bot/telegram"
import { NOTIFICATION_EVENTS, type NotificationEventKey, type NotificationPayload } from "@/lib/notifications/events"

// Internal helper, not a server action — call it from wherever an event
// actually happens (a server action, a bot handler, a cron job later on).
// Never throws: a notification failing to send should never break the
// action that triggered it. Every call is logged to notification_log
// (sent, failed, skipped_no_channel, or skipped_disabled) so nothing here
// is guesswork.
export async function notify<K extends NotificationEventKey>(
  profileId: string,
  eventKey: K,
  data: NotificationPayload<K>,
): Promise<void> {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_chat_id, notification_preferences, language")
    .eq("id", profileId)
    .single()

  const lang = profile?.language === "en" ? "en" : "es"
  const message = NOTIFICATION_EVENTS[eventKey].build(data as never, lang)

  const chatId = profile?.telegram_chat_id as number | null | undefined
  const preferences = (profile?.notification_preferences ?? {}) as Record<string, boolean>
  // Opt-out model, same as profiles.permissions: absent or true = enabled,
  // explicit false = this person turned this event off for themselves.
  const enabled = preferences[eventKey] !== false

  let status: "sent" | "failed" | "skipped_no_channel" | "skipped_disabled"
  if (!chatId) {
    status = "skipped_no_channel"
  } else if (!enabled) {
    status = "skipped_disabled"
  } else {
    try {
      await sendMessage(chatId, message)
      status = "sent"
    } catch (err) {
      console.error(`[notify] failed to send "${eventKey}" to profile ${profileId}:`, err)
      status = "failed"
    }
  }

  const { error } = await supabase.from("notification_log").insert({
    profile_id: profileId,
    event_key: eventKey,
    channel: "telegram",
    message,
    status,
  })
  if (error) console.error("[notification_log] insert failed:", error.message)
}
