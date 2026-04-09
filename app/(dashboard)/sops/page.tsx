export const dynamic = "force-dynamic"

import { createClient } from "@/lib/supabase/server"
import { getSops } from "@/lib/actions/sops"
import { getProjectTypes } from "@/lib/actions/config"
import { SopsClient } from "@/components/sops/sops-client"
import { BookOpen } from "lucide-react"
import type { Profile, ProjectType, Sop } from "@/lib/types"

export default async function SopsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single()

  const [sops, projectTypes] = await Promise.all([
    getSops().catch(() => []),
    getProjectTypes().catch(() => []),
  ])
  const isAdmin = profile?.role === "admin" || profile?.role === "subadmin"

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          Banco de SOPs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Procedimientos operativos estándar del equipo
        </p>
      </div>

      <SopsClient
        sops={sops as Sop[]}
        currentUser={profile as Profile}
        isAdmin={isAdmin}
        projectTypes={projectTypes as ProjectType[]}
      />
    </div>
  )
}
