"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClipboardEdit } from "lucide-react"
import { SopRequestInbox } from "@/components/lab/sop-request-inbox"
import { MyProposalsView } from "@/components/lab/my-proposals-view"
import { PhaseReviewPanel } from "@/components/lab/phase-review-panel"
import { CanonicalTreeView } from "@/components/lab/canonical-tree-view"
import type {
  SopRequest, LabPhase, PhaseSet, Sop, LabProposedPhase, LabProposedTask,
  LabProposedChecklistAddition, CanonicalPhaseSet, PendingChange, Position,
} from "@/lib/types"

interface Props {
  isAdmin: boolean
  sopRequests: SopRequest[]
  myPendingChanges: PendingChange[]
  allSops: Sop[]
  submittedPhases: LabPhase[]
  phaseSets: PhaseSet[]
  canonicalTree: CanonicalPhaseSet[]
  myProposedTasks: LabProposedTask[]
  allProposedTasks: LabProposedTask[]
  myProposedChecklists: LabProposedChecklistAddition[]
  allProposedChecklists: LabProposedChecklistAddition[]
  positions: Position[]
  allProposedPhases: LabProposedPhase[]
}

export function MiOpsLabTabs({
  isAdmin, sopRequests, myPendingChanges, allSops, submittedPhases, phaseSets, canonicalTree,
  myProposedTasks, allProposedTasks, myProposedChecklists, allProposedChecklists, positions, allProposedPhases,
}: Props) {
  const [activeTab, setActiveTab] = useState("canonical")
  const [focusChangeId, setFocusChangeId] = useState<string | null>(null)

  const pendingSopCount = sopRequests.filter((r) => r.status === "pending").length
  const pendingReviewCount = isAdmin
    ? submittedPhases.filter((p) => p.status === "submitted").length
      + allProposedTasks.filter((t) => t.status === "submitted").length
      + allProposedChecklists.filter((c) => c.status === "submitted").length
      + allProposedPhases.filter((p) => p.status === "submitted").length
    : 0
  const pendingChangesCount = myPendingChanges.filter((c) => c.status !== "approved").length

  function jumpToProposal(id: string) {
    setFocusChangeId(id)
    setActiveTab("phases")
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
      <TabsList>
        <TabsTrigger value="canonical">
          Árbol canónico
          {canonicalTree.length === 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">vacío</span>
          )}
        </TabsTrigger>
        <TabsTrigger value="phases">
          <ClipboardEdit className="w-3.5 h-3.5 mr-1" />
          Mis Propuestas
          {pendingChangesCount > 0 && (
            <span className="ml-1.5 text-[10px] font-semibold bg-primary/15 text-primary rounded-full px-1.5 py-0.5">
              {pendingChangesCount}
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

      <TabsContent value="canonical" className="mt-4">
        <CanonicalTreeView
          phaseSets={canonicalTree}
          myProposedTasks={myProposedTasks}
          myProposedChecklists={myProposedChecklists}
          myProposedPhases={myPendingChanges
            .filter((c) => c.kind === "phase_new")
            .map((c) => c.raw as LabProposedPhase)}
          myForkedPhases={myPendingChanges
            .filter((c) => c.kind === "phase_fork")
            .map((c) => c.raw as LabPhase)}
          positions={positions}
          sops={allSops}
          onJumpToProposal={jumpToProposal}
        />
      </TabsContent>

      <TabsContent value="phases" className="mt-4">
        <MyProposalsView
          initialPendingChanges={myPendingChanges}
          canonicalTree={canonicalTree}
          sops={allSops}
          positions={positions}
          focusChangeId={focusChangeId}
          onFocusHandled={() => setFocusChangeId(null)}
        />
      </TabsContent>

      <TabsContent value="sop-requests" className="mt-4">
        <SopRequestInbox requests={sopRequests} isAdmin={isAdmin} />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="review" className="mt-4">
          <PhaseReviewPanel
            initialPhases={submittedPhases}
            phaseSets={phaseSets}
            initialProposedTasks={allProposedTasks}
            initialProposedChecklists={allProposedChecklists}
            initialProposedPhases={allProposedPhases}
          />
        </TabsContent>
      )}
    </Tabs>
  )
}
