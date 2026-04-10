export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { MobileShell } from "@/components/mobile-shell"
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

  const profile = profileResult.data as Profile | null

  return (
    <MobileShell profile={profile} logoUrl={workspaceSettings.logo_url}>
      {children}
    </MobileShell>
  )
}
