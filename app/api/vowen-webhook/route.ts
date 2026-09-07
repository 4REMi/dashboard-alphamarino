import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { handleMessage } from "@/lib/telegram-bot/router"
import { sendMessage } from "@/lib/telegram-bot/telegram"

const SIGNATURE_TOLERANCE_SECONDS = 300

// Verifies Vowen's HMAC-SHA256 signature against the RAW body (must run
// before JSON.parse — see https://docs.vowen.ai/integrations/webhooks).
function verifySignature(rawBody: string, signature: string | null, timestamp: string | null, secret: string): boolean {
  if (!signature || !timestamp) return false

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false

  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")
  const expected = `sha256=${digest}`

  if (signature.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export async function POST(req: NextRequest) {
  const secret = process.env.VOWEN_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: "VOWEN_WEBHOOK_SECRET no configurado" }, { status: 500 })

  const rawBody = await req.text()
  const signature = req.headers.get("x-vowen-signature")
  const timestamp = req.headers.get("x-vowen-timestamp")

  if (!verifySignature(rawBody, signature, timestamp, secret)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as { transcript?: string; summary?: string }
  const text = (payload.transcript || payload.summary || "").trim()
  if (!text) return NextResponse.json({ ok: true })

  const chatId = Number(process.env.TELEGRAM_ALLOWED_CHAT_ID)

  try {
    await handleMessage(chatId, text, {}, "vowen")
  } catch (err) {
    if (chatId) await sendMessage(chatId, `⚠️ Error procesando nota de Vowen: ${err instanceof Error ? err.message : "desconocido"}`)
  }

  return NextResponse.json({ ok: true })
}
