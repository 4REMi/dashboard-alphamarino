import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { can } from "@/lib/permissions"
import type { Profile } from "@/lib/types"
import { getWorkflow } from "@/lib/actions/ad-nodes/workflows"
import { NodeCanvas } from "@/components/ad-lab/node-canvas"
import { ArrowLeft } from "lucide-react"

export default async function AdNodeWorkflowPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params
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

  const workflow = await getWorkflow(workflowId)
  if (!workflow) notFound()

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4">
      <a href="/ad-lab/nodes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Workflows
      </a>
      <h1 className="text-xl font-bold tracking-tight">{workflow.name}</h1>
      <NodeCanvas workflow={workflow} />
    </div>
  )
}
