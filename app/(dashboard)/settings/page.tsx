export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProjectTypes, getPhaseSets } from "@/lib/actions/config"
import { ProjectTypeManager } from "@/components/settings/project-type-manager"
import { PhaseSetManager } from "@/components/settings/phase-set-manager"
import type { ProjectType, PhaseSet } from "@/lib/types"

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()

  if (profile?.role !== "admin") redirect("/")

  const [projectTypes, phaseSets] = await Promise.all([
    getProjectTypes().catch(() => []),
    getPhaseSets().catch(() => []),
  ])

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">Administra los tipos de proyecto y las plantillas de fases.</p>
      </div>

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
    </div>
  )
}
