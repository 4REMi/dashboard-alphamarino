import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { runDailyCycleCheck } from "@/lib/actions/projects"
import { runBonusReportReminders } from "@/lib/actions/my-compensation"
import { runTrusted } from "@/lib/trusted-context"
import { refreshMxnFees } from "@/lib/finance/project-fee"

// Triggered once a day by a scheduler (Vercel Cron via vercel.json, or any
// external cron hitting this URL with the right header — the route itself
// doesn't care who calls it, only that they know the secret). Vercel Cron
// sends `Authorization: Bearer <CRON_SECRET>` automatically once that env
// var is set on the project; a manual/external caller does the same.
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

  // Contexto de confianza (lib/trusted-context.ts): ya se validó CRON_SECRET.
  const result = await runTrusted("cron", () => runDailyCycleCheck())
  // Recordatorios del reporte de bonos (último día del mes y día 2).
  const bonus = await runBonusReportReminders(secret).catch((e) => ({ reminded: 0, error: String(e) }))
  // Fees pactados en MXN: equivalente en USD con el tipo de cambio de hoy (MRR).
  const mxnFeesUpdated = await refreshMxnFees().catch((e) => ({ error: String(e) }))
  return NextResponse.json({ ok: true, ...result, bonusReminders: bonus, mxnFeesUpdated })
}
