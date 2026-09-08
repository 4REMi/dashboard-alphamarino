import { NextRequest, NextResponse } from "next/server"
import { handleMessage } from "@/lib/telegram-bot/router"
import { sendMessage } from "@/lib/telegram-bot/telegram"

export async function POST(req: NextRequest) {
  // Verifies the update really came from Telegram (not just anyone who found
  // this URL) — set via setWebhook's secret_token param, and only enforced
  // once TELEGRAM_WEBHOOK_SECRET is actually configured, so this doesn't
  // break the bot before the webhook has been re-registered with the secret.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expectedSecret && req.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const update = await req.json()
  const message = update.message

  const text: string | undefined = message?.text ?? message?.caption
  const photo: { file_id: string }[] | undefined = message?.photo

  if (!message || (!text && !photo)) return NextResponse.json({ ok: true })

  const chatId = message.chat.id as number
  if (String(chatId) !== process.env.TELEGRAM_ALLOWED_CHAT_ID) {
    return NextResponse.json({ ok: true })
  }

  try {
    await handleMessage(chatId, text ?? "", {
      senderName: message.from?.first_name as string | undefined,
      photoFileId: photo?.[photo.length - 1]?.file_id,
    })
  } catch (err) {
    await sendMessage(chatId, `⚠️ Error: ${err instanceof Error ? err.message : "desconocido"}`)
  }

  return NextResponse.json({ ok: true })
}
