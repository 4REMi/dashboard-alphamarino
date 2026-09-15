import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"
import { listWorkflows } from "@/lib/actions/ad-nodes/workflows"
import { WorkflowList } from "@/components/ad-lab/workflow-list"

export default async function AdNodesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, permissions")
    .eq("id", user.id)
    .single()

  const profile = profileData as Pick<Profile, "id" | "full_name" | "email" | "role" | "permissions"> | null
  if (!can(profile, "access_ad_lab")) redirect("/")

  const workflows = await listWorkflows()

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
          🧩
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ad Nodes</h1>
          <p className="text-sm text-muted-foreground">
            Workflows visuales de IA — conecta nodos de texto, imagen, análisis y generación para armar pipelines reusables.
          </p>
        </div>
      </div>

      <WorkflowList workflows={workflows} />
    </div>
  )
}
