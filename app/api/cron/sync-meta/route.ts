import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { runScheduledMetaSync } from "@/lib/actions/meta"
import { runRadarBudgetGuard } from "@/lib/actions/radar"

// Sincroniza Meta en todos los ciclos activos, 3 veces al día (ver
// vercel.json). Mismo esquema de auth que /api/cron/check-cycles.
export const maxDuration = 300

function isAuthorized(req: NextRequest, secret: string): boolean {
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 })
  if (!isAuthorized(req, secret)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const result = await runScheduledMetaSync(secret)
  // Con datos frescos: avisos 80/90% y pausa automática al 100% (Radar).
  const radar = await runRadarBudgetGuard(secret).catch((e) => ({ error: String(e) }))
  return NextResponse.json({ ok: true, ...result, radar })
}
