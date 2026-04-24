export const dynamic = "force-dynamic"

import { createClient } from "@/lib/supabase/server"
import { getMyPendingSopRequests } from "@/lib/actions/sops"
import { getMyProposals, getAllSubmittedProposals } from "@/lib/actions/lab"
import { getPhaseSets } from "@/lib/actions/config"
import { SopRequestInbox } from "@/components/lab/sop-request-inbox"
import { ProposalEditor } from "@/components/lab/proposal-editor"
import { ProposalReviewPanel } from "@/components/lab/proposal-review-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Lightbulb } from "lucide-react"
import type { SopRequest, LabProposal, PhaseSet } from "@/lib/types"

export default async function MyLabPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user!.id)
    .single()

  const isAdmin = profile?.role === "admin" || profile?.role === "subadmin"

  const [sopRequests, myProposals, submittedProposals, phaseSets] = await Promise.all([
    getMyPendingSopRequests().catch(() => [] as SopRequest[]),
    getMyProposals().catch(() => [] as LabProposal[]),
    isAdmin ? getAllSubmittedProposals().catch(() => [] as LabProposal[]) : Promise.resolve([] as LabProposal[]),
    isAdmin ? getPhaseSets().catch(() => [] as PhaseSet[]) : Promise.resolve([] as PhaseSet[]),
  ])

  const pendingSopCount = sopRequests.filter((r) => r.status === "pending").length
  const pendingReviewCount = submittedProposals.filter((p) => p.status === "submitted").length

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mi Lab</h1>
          <p className="text-sm text-muted-foreground">
            {profile?.full_name ? `Espacio personal de ${profile.full_name}` : "Tu espacio personal de propuestas y SOPs"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="proposals" className="mt-2">
        <TabsList>
          <TabsTrigger value="proposals">
            Mis propuestas
            {myProposals.length > 0 && (
              <span className="ml-1.5 text-[10px] font-semibold bg-primary/15 text-primary rounded-full px-1.5 py-0.5">
                {myProposals.length}
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

        <TabsContent value="proposals" className="mt-4">
          <ProposalEditor initialProposals={myProposals} />
        </TabsContent>

        <TabsContent value="sop-requests" className="mt-4">
          <SopRequestInbox requests={sopRequests} isAdmin={isAdmin} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="review" className="mt-4">
            <ProposalReviewPanel
              initialProposals={submittedProposals}
              phaseSets={phaseSets as PhaseSet[]}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
