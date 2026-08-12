export const dynamic = "force-dynamic"

import { createClient } from "@/lib/supabase/server"
import { getSops } from "@/lib/actions/sops"
import { getProjectTypeBadges } from "@/lib/actions/config"
import { SopsClient } from "@/components/sops/sops-client"
import { BookOpen } from "lucide-react"
import type { Profile, Sop } from "@/lib/types"

async function getCurrentProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single()
  return profile
}

export default async function SopsPage() {
  // None of these three depend on each other — fetch in parallel. Note this
  // is the lightweight getProjectTypeBadges() (id/name/icon/color only), not
  // the heavier getProjectTypes() (which also joins phase_sets) — that one
  // stays lazy-loaded only when the create/edit SOP modal opens.
  const [profile, sops, projectTypeBadges] = await Promise.all([
    getCurrentProfile(),
    getSops().catch(() => []),
    getProjectTypeBadges().catch(() => []),
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
        projectTypeBadges={projectTypeBadges}
      />
    </div>
  )
}
