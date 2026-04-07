import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Handles Supabase auth redirects:
 * - Email invite acceptance
 * - Password reset links
 * - Email confirmation
 *
 * Supabase appends ?code=... to this URL after verifying the token.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Redirect to the dashboard (or wherever `next` points)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — send to login with an error hint
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
