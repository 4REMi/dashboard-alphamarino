import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

// Called by login-form after successful auth to sync profile.language → NEXT_LOCALE cookie
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false })

  const { data } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .single()

  const lang = (data as { language?: string | null } | null)?.language
  if (lang === "es" || lang === "en") {
    const cookieStore = await cookies()
    cookieStore.set("NEXT_LOCALE", lang, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    })
  }

  return NextResponse.json({ ok: true })
}
