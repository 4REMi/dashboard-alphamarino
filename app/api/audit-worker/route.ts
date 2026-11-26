import { after } from "next/server"
import { timingSafeEqual } from "crypto"
import { kickAuditWorker, processAuditQueue } from "@/lib/ad-audit/analysis-jobs"

// Trabajador de la cola de «Analizar partes» (auditorías). Responde de
// inmediato y procesa una tanda DESPUÉS de responder (after); si quedan
// trabajos, se vuelve a despertar a sí mismo. Solo lo llama el propio
// servidor con CRON_SECRET. Ver lib/ad-audit/analysis-jobs.ts.
export const maxDuration = 300

function authorized(req: Request, secret: string): boolean {
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return provided.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 })
  if (!authorized(req, secret)) return Response.json({ ok: false }, { status: 401 })

  const origin = new URL(req.url).origin
  after(async () => {
    const { remaining } = await processAuditQueue()
    if (remaining > 0) await kickAuditWorker(origin)
  })
  return Response.json({ ok: true }, { status: 202 })
}
