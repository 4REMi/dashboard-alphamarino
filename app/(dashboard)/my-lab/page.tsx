export const dynamic = "force-dynamic"

import { createClient } from "@/lib/supabase/server"
import { getMyPendingSopRequests, getSops } from "@/lib/actions/sops"
import { getMyPhases, getAllSubmittedPhases } from "@/lib/actions/lab"
import { getPhaseSets } from "@/lib/actions/config"
import { SopRequestInbox } from "@/components/lab/sop-request-inbox"
import { PhaseEditor } from "@/components/lab/phase-editor"
import { PhaseReviewPanel } from "@/components/lab/phase-review-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Lightbulb } from "lucide-react"
import type { SopRequest, LabPhase, PhaseSet, Sop } from "@/lib/types"

export default async function MyLabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user!.id)
    .single()

  const isAdmin = profile?.role === "admin" || profile?.role === "subadmin"

  const [sopRequests, myPhases, allSops, submittedPhases, phaseSets] = await Promise.all([
    getMyPendingSopRequests().catch(() => [] as SopRequest[]),
    getMyPhases().catch(() => [] as LabPhase[]),
    getSops().catch(() => [] as Sop[]),
    isAdmin ? getAllSubmittedPhases().catch(() => [] as LabPhase[]) : Promise.resolve([] as LabPhase[]),
    isAdmin ? getPhaseSets().catch(() => [] as PhaseSet[]) : Promise.resolve([] as PhaseSet[]),
  ])

  const pendingSopCount    = sopRequests.filter((r) => r.status === "pending").length
  const pendingReviewCount = submittedPhases.filter((p) => p.status === "submitted").length

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mi Lab</h1>
          <p className="text-sm text-muted-foreground">
            {profile?.full_name
              ? `Espacio personal de ${profile.full_name}`
              : "Tu espacio personal de propuestas y SOPs"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="phases" className="mt-2">
        <TabsList>
          <TabsTrigger value="phases">
            Mis fases
            {myPhases.length > 0 && (
              <span className="ml-1.5 text-[10px] font-semibold bg-primary/15 text-primary rounded-full px-1.5 py-0.5">
                {myPhases.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sop-requests">
            Solicitudes de SOP
            {pendingSopCount > 0 && (
              <span className="ml-1.5 text-[10px] font-semibold bg-amber-500/15 text-amber-600 rounded-full px-1.5 py-0.5">
                {pendingSopCount}
              </span>
            )}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="review">
              Revisión
              {pendingReviewCount > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold bg-amber-500/15 text-amber-600 rounded-full px-1.5 py-0.5">
                  {pendingReviewCount}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="phases" className="mt-4">
          <PhaseEditor initialPhases={myPhases} sops={allSops as Sop[]} />
        </TabsContent>

        <TabsContent value="sop-requests" className="mt-4">
          <SopRequestInbox requests={sopRequests} isAdmin={isAdmin} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="review" className="mt-4">
            <PhaseReviewPanel
              initialPhases={submittedPhases}
              phaseSets={phaseSets as PhaseSet[]}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
