import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkSecret, mapGhlPayload } from "@/lib/quotes/core"

// Webhook de un workflow de GHL ("la oportunidad entra a Proposal Pending").
// Auth: ?secret=… o header x-quotes-secret con QUOTES_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  if (!checkSecret(req.headers.get("x-quotes-secret") ?? req.nextUrl.searchParams.get("secret"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }) }
  const lead = mapGhlPayload(body)
  const db = createAdminClient()
  const row = { ...lead, source: "ghl", raw: body as object, updated_at: new Date().toISOString() }
  // Misma oportunidad otra vez: se actualiza (sin perder estado ni propuesta).
  if (lead.ghl_opportunity_id) {
    const { data: existing } = await db.from("quote_leads").select("id").eq("ghl_opportunity_id", lead.ghl_opportunity_id).maybeSingle()
    if (existing) {
      const { error } = await db.from("quote_leads").update(row).eq("id", existing.id)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: existing.id, updated: true })
    }
  }
  const { data, error } = await db.from("quote_leads").insert({ ...row, status: "nuevo" }).select("id").single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
