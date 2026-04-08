export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/sidebar"
import { getWorkspaceSettings } from "@/lib/actions/workspace"
import type { Profile } from "@/lib/types"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [profileResult, workspaceSettings] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getWorkspaceSettings().catch(() => ({ logo_url: null })),
  ])

  // Sync language preference from profile to cookie so next-intl picks it up
  const profile = profileResult.data as Profile | null
  if (profile?.language) {
    const cookieStore = await cookies()
    const current = cookieStore.get("NEXT_LOCALE")?.value
    if (current !== profile.language) {
      cookieStore.set("NEXT_LOCALE", profile.language, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      })
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        profile={profile}
        logoUrl={workspaceSettings.logo_url}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
