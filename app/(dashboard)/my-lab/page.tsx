export const dynamic = "force-dynamic"

import { createClient } from "@/lib/supabase/server"
import { getMyPendingSopRequests, getSops } from "@/lib/actions/sops"
import { getAllSubmittedPhases, getCanonicalTree, getMyProposedTasks, getAllSubmittedProposedTasks, getMyProposedChecklistAdditions, getAllSubmittedProposedChecklistAdditions, getAllSubmittedProposedPhases, getMyPendingChanges } from "@/lib/actions/lab"
import { getPhaseSets } from "@/lib/actions/config"
import { getPositions } from "@/lib/actions/config"
import { MiOpsLabTabs } from "@/components/lab/mi-ops-lab-tabs"
import { Lightbulb } from "lucide-react"
import type { SopRequest, LabPhase, PhaseSet, Sop, LabProposedPhase, LabProposedTask, LabProposedChecklistAddition } from "@/lib/types"

export default async function MyLabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user!.id)
    .single()

  const isAdmin = profile?.role === "admin" || profile?.role === "subadmin"

  const [
    sopRequests,
    myPendingChanges,
    allSops,
    submittedPhases,
    phaseSets,
    canonicalTree,
    myProposedTasks,
    allProposedTasks,
    myProposedChecklists,
    allProposedChecklists,
    positions,
    allProposedPhases,
  ] = await Promise.all([
    getMyPendingSopRequests().catch(() => [] as SopRequest[]),
    getMyPendingChanges().catch(() => []),
    getSops().catch(() => [] as Sop[]),
    isAdmin ? getAllSubmittedPhases().catch(() => [] as LabPhase[]) : Promise.resolve([] as LabPhase[]),
    isAdmin ? getPhaseSets().catch(() => [] as PhaseSet[]) : Promise.resolve([] as PhaseSet[]),
    getCanonicalTree().catch(() => []),
    getMyProposedTasks().catch(() => []),
    isAdmin ? getAllSubmittedProposedTasks().catch(() => []) : Promise.resolve([]),
    getMyProposedChecklistAdditions().catch(() => []),
    isAdmin ? getAllSubmittedProposedChecklistAdditions().catch(() => []) : Promise.resolve([]),
    getPositions().catch(() => []),
    isAdmin ? getAllSubmittedProposedPhases().catch(() => [] as LabProposedPhase[]) : Promise.resolve([] as LabProposedPhase[]),
  ])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mi Ops Lab</h1>
          <p className="text-sm text-muted-foreground">
            {profile?.full_name
              ? `Espacio personal de ${profile.full_name}`
              : "Tu espacio personal de propuestas y SOPs"}
          </p>
        </div>
      </div>

      <MiOpsLabTabs
        isAdmin={isAdmin}
        sopRequests={sopRequests}
        myPendingChanges={myPendingChanges}
        allSops={allSops as Sop[]}
        submittedPhases={submittedPhases}
        phaseSets={phaseSets as PhaseSet[]}
        canonicalTree={canonicalTree}
        myProposedTasks={myProposedTasks as LabProposedTask[]}
        allProposedTasks={allProposedTasks as LabProposedTask[]}
        myProposedChecklists={myProposedChecklists as LabProposedChecklistAddition[]}
        allProposedChecklists={allProposedChecklists as LabProposedChecklistAddition[]}
        positions={positions}
        allProposedPhases={allProposedPhases}
      />
    </div>
  )
}
