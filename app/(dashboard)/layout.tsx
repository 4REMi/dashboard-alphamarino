export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        profile={profileResult.data as Profile | null}
        logoUrl={workspaceSettings.logo_url}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
