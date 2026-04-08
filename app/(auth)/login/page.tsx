export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { getWorkspaceSettings } from "@/lib/actions/workspace"
import { LoginForm } from "./login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>
}) {
  const params = await searchParams

  // Supabase sometimes sends the auth code to /login instead of /auth/callback
  // (happens when Site URL in Supabase is set to the /login path).
  // Forward it to the proper handler.
  if (params.code) {
    redirect(`/auth/callback?code=${params.code}`)
  }

  const settings = await getWorkspaceSettings().catch(() => ({ logo_url: null }))
  return <LoginForm logoUrl={settings.logo_url} />
}
