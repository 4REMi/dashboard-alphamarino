import { NextRequest, NextResponse } from "next/server"
import { handleMessage } from "@/lib/telegram-bot/router"
import { sendMessage } from "@/lib/telegram-bot/telegram"

export async function POST(req: NextRequest) {
  const update = await req.json()
  const message = update.message

  if (!message?.text) return NextResponse.json({ ok: true })

  const chatId = message.chat.id as number
  if (String(chatId) !== process.env.TELEGRAM_ALLOWED_CHAT_ID) {
    return NextResponse.json({ ok: true })
  }

  try {
    await handleMessage(chatId, message.text as string)
  } catch (err) {
    await sendMessage(chatId, `⚠️ Error: ${err instanceof Error ? err.message : "desconocido"}`)
  }

  return NextResponse.json({ ok: true })
}
