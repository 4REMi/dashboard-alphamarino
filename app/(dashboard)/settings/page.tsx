export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getWorkspaceSettings } from "@/lib/actions/workspace"
import { BrandingManager } from "@/components/settings/branding-manager"

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()

  if (profile?.role !== "admin") redirect("/")

  const workspaceSettings = await getWorkspaceSettings().catch(() => ({ logo_url: null }))

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">Ajustes globales del dashboard.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Marca</h2>
        <BrandingManager initialLogoUrl={workspaceSettings.logo_url} />
      </section>
    </div>
  )
}
