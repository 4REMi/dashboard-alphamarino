export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProjectTypes, getPhaseSets } from "@/lib/actions/config"
import { getWorkspaceSettings } from "@/lib/actions/workspace"
import { ProjectTypeManager } from "@/components/settings/project-type-manager"
import { PhaseSetManager } from "@/components/settings/phase-set-manager"
import { BrandingManager } from "@/components/settings/branding-manager"
import type { ProjectType, PhaseSet } from "@/lib/types"

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()

  if (profile?.role !== "admin") redirect("/")

  const [projectTypes, phaseSets, workspaceSettings] = await Promise.all([
    getProjectTypes().catch(() => []),
    getPhaseSets().catch(() => []),
    getWorkspaceSettings().catch(() => ({ logo_url: null })),
  ])

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">Administra los ajustes generales, tipos de proyecto y plantillas de fases.</p>
      </div>

      {/* Branding */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Marca</h2>
        <BrandingManager initialLogoUrl={workspaceSettings.logo_url} />
      </section>

      {/* Project config */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Proyectos</h2>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <ProjectTypeManager
            initialTypes={projectTypes as ProjectType[]}
            phaseSets={phaseSets as PhaseSet[]}
          />
          <PhaseSetManager
            initialSets={phaseSets as PhaseSet[]}
            projectTypes={projectTypes as ProjectType[]}
          />
        </div>
      </section>
    </div>
  )
}
