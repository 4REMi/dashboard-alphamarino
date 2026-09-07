import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { handleMessage } from "@/lib/telegram-bot/router"
import { sendMessage } from "@/lib/telegram-bot/telegram"

// Vowen's "Voice Workflow" webhook action has no HMAC signing option — it's
// a plain GET/POST with the dictated text passed through a custom header
// (configured by the user as e.g. "content: {{text}}"). Auth here is a
// shared-secret header instead, since that's the only mechanism the
// workflow editor actually exposes.
function isAuthorized(req: NextRequest, secret: string): boolean {
  const provided = req.headers.get("x-vowen-secret")
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function processRequest(req: NextRequest) {
  const secret = process.env.VOWEN_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: "VOWEN_WEBHOOK_SECRET no configurado" }, { status: 500 })

  if (!isAuthorized(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  // Text can arrive as a header (GET, current Vowen workflow setup) or in a
  // JSON body (if the workflow is ever switched to POST with a body).
  let text = (req.headers.get("content") || req.headers.get("x-vowen-text") || "").trim()
  if (!text) {
    try {
      const body = await req.json() as { transcript?: string; summary?: string; text?: string }
      text = (body.transcript || body.summary || body.text || "").trim()
    } catch { /* no JSON body — fine for GET */ }
  }
  if (!text) return NextResponse.json({ ok: true })

  const chatId = Number(process.env.TELEGRAM_ALLOWED_CHAT_ID)

  try {
    await handleMessage(chatId, text, {}, "vowen")
  } catch (err) {
    if (chatId) await sendMessage(chatId, `⚠️ Error procesando nota de Vowen: ${err instanceof Error ? err.message : "desconocido"}`)
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  return processRequest(req)
}

export async function POST(req: NextRequest) {
  return processRequest(req)
}
