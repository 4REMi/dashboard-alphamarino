import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkSecret } from "@/lib/quotes/core"

// Make avisa que terminó una propuesta. Con lead_id actualiza ese lead; sin
// lead_id (vino del atajo del iPhone) crea uno nuevo para que también quede
// en el hub. Body: { lead_id?, business_name?, development_type?, price?,
// pdf_url?, slides_url?, error? }
export async function POST(req: NextRequest) {
  if (!checkSecret(req.headers.get("x-quotes-secret") ?? req.nextUrl.searchParams.get("secret"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }) }
  const s = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim() : null)
  const price = b.price != null && b.price !== "" && !Number.isNaN(Number(b.price)) ? Number(b.price) : null
  const type = (s("development_type") ?? "").toLowerCase().includes("ecommerce") ? "web_ecommerce" : s("development_type") ? "web_informativo" : null
  const err = s("error")
  const patch = {
    status: err ? "error" : "generada",
    last_error: err,
    ...(s("pdf_url") ? { proposal_pdf_url: s("pdf_url") } : {}),
    ...(s("slides_url") ? { proposal_slides_url: s("slides_url") } : {}),
    ...(price != null ? { price } : {}),
    ...(err ? {} : { proposal_generated_at: new Date().toISOString() }),
    updated_at: new Date().toISOString(),
  }
  const db = createAdminClient()
  const leadId = s("lead_id")
  if (leadId) {
    const { error } = await db.from("quote_leads").update(patch).eq("id", leadId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: leadId })
  }
  const { data, error } = await db.from("quote_leads").insert({
    ...patch, source: "atajo", name: s("business_name") ?? "Propuesta del atajo", company: s("business_name"),
    proposal_type: type, raw: b,
  }).select("id").single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id, created: true })
}
