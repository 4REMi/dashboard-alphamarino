"use client"

import { useState, useTransition, useCallback } from "react"
import type {
  CanonicalPhaseSet, CanonicalPhase, CanonicalTask,
  LabProposedTask, LabProposedChecklistAddition, LabProposedPhase, LabPhase, Position, Sop,
} from "@/lib/types"
import {
  FolderKanban, ListChecks, Lock, Paperclip, BookOpen,
  Plus, ChevronRight, Pencil, Layers, GitFork, Sparkles, ArrowUpRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_COLOR } from "@/components/lab/shared"
import { forkCanonicalPhase } from "@/lib/actions/lab"
import { useToast } from "@/components/ui/toast"
import { TaskFormModal, type TaskFormTarget } from "@/components/lab/task-form-modal"
import { ProposedChecklistModal } from "@/components/lab/proposed-checklist-modal"
import { ProposedPhaseModal } from "@/components/lab/proposed-phase-modal"

interface Props {
  phaseSets: CanonicalPhaseSet[]
  myProposedTasks: LabProposedTask[]
  myProposedChecklists: LabProposedChecklistAddition[]
  myProposedPhases: LabProposedPhase[]
  myForkedPhases: LabPhase[]
  positions: Position[]
  sops: Sop[]
  onJumpToProposal: (id: string) => void
}

export function CanonicalTreeView({
  phaseSets, myProposedTasks, myProposedChecklists, myProposedPhases, myForkedPhases, positions, sops, onJumpToProposal,
}: Props) {
  const [selectedPsId, setSelectedPsId] = useState<string | null>(null)
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)
  const [proposingPhase, setProposingPhase] = useState<{
    phaseSet: { id: string; name: string }
    allPhases: CanonicalPhase[]
    defaultAfterPhaseId: string
  } | null>(null)
  const [taskModalTarget, setTaskModalTarget] = useState<TaskFormTarget | null>(null)
  const [proposingChecklist, setProposingChecklist] = useState<{
    task: CanonicalTask
    phaseName: string
  } | null>(null)
  const [localProposedTasks, setLocalProposedTasks] = useState<LabProposedTask[]>(myProposedTasks)
  const [localProposedChecklists, setLocalProposedChecklists] = useState<LabProposedChecklistAddition[]>(myProposedChecklists)
  const [localProposedPhases, setLocalProposedPhases] = useState<LabProposedPhase[]>(myProposedPhases)
  const [localForkedPhases] = useState<LabPhase[]>(myForkedPhases)
  const [forking, setForking] = useState<string | null>(null)
  const [, startFork] = useTransition()
  const toast = useToast()

  const handleFork = useCallback((phaseId: string) => {
    setForking(phaseId)
    startFork(async () => {
      try {
        await forkCanonicalPhase(phaseId)
        toast("Fase copiada a Mis Fases — ábrela en la pestaña para editarla y enviarla a revisión", "success")
      } catch {
        toast("Error al copiar la fase", "error")
      } finally {
        setForking(null)
      }
    })
  }, [toast])

  const selectedPs = phaseSets.find((ps) => ps.id === selectedPsId) ?? null
  const phases = selectedPs?.phases ?? []
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) ?? null
  const tasks = selectedPhase?.tasks ?? []

  // Ghost phases (new-phase proposals) for the selected Phase Set, interleaved by position_after_phase_id
  const ghostPhases = selectedPs
    ? localProposedPhases.filter((pp) => pp.phase_set_id === selectedPs.id && pp.status !== "approved")
    : []
  const phaseRows: ({ type: "phase"; data: CanonicalPhase } | { type: "phase_ghost"; data: LabProposedPhase })[] = []
  ghostPhases.filter((pp) => !pp.position_after_phase_id).forEach((pp) => phaseRows.push({ type: "phase_ghost", data: pp }))
  phases.forEach((phase) => {
    phaseRows.push({ type: "phase", data: phase })
    ghostPhases.filter((pp) => pp.position_after_phase_id === phase.id).forEach((pp) => phaseRows.push({ type: "phase_ghost", data: pp }))
  })

  // Ghost tasks (new-task proposals, not edits) for the selected phase, interleaved by position_after_task_id
  const ghostTasks = selectedPhase
    ? localProposedTasks.filter((pt) =>
        pt.anchor_phase_set_phase_id === selectedPhase.id && pt.status !== "approved" && !pt.anchor_task_set_task_id
      )
    : []
  const taskRows: ({ type: "task"; data: CanonicalTask } | { type: "task_ghost"; data: LabProposedTask })[] = []
  ghostTasks.filter((pt) => !pt.position_after_task_id).forEach((pt) => taskRows.push({ type: "task_ghost", data: pt }))
  tasks.forEach((task) => {
    taskRows.push({ type: "task", data: task })
    ghostTasks.filter((pt) => pt.position_after_task_id === task.id).forEach((pt) => taskRows.push({ type: "task_ghost", data: pt }))
  })

  if (phaseSets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderKanban className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Aún no hay Phase Sets configurados en Ops Lab.</p>
      </div>
    )
  }

  return (
    <>
      <div
        className="flex rounded-xl border border-border bg-card shadow-sm overflow-hidden"
        style={{ height: "calc(100vh - 220px)", minHeight: 480 }}
      >
        {/* -- PANEL 1: Project Types / Phase Sets -- */}
        <div className="w-56 flex-shrink-0 flex flex-col border-r border-border">
          <div className="px-5 py-4 border-b flex-shrink-0">
            <p className="font-semibold text-sm">Tipos de Proyecto</p>
            <p className="text-xs text-muted-foreground">{phaseSets.length} tipo{phaseSets.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {phaseSets.map((ps) => {
              const isSelected = ps.id === selectedPsId
              return (
                <div
                  key={ps.id}
                  onClick={() => { setSelectedPsId(ps.id); setSelectedPhaseId(null) }}
                  className={cn(
                    "group flex items-center gap-2 px-5 py-3 cursor-pointer border-b border-border transition-colors",
                    isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/40"
                  )}
                >
                  {(() => {
                    const Icon = getProjectTypeIcon(ps.project_type_icon)
                    if (Icon) return <Icon className="w-4 h-4 flex-shrink-0" style={ps.project_type_color ? { color: ps.project_type_color } : undefined} />
                    if (ps.project_type_color) return <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ps.project_type_color }} />
                    return null
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ps.project_type_name ?? ps.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {ps.name}
                    </p>
                  </div>
                  {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </div>
              )
            })}
          </div>
        </div>

        {/* -- PANEL 2: Phases -- */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-border">
          <div className="px-5 py-4 border-b flex-shrink-0">
            <p className="font-semibold text-sm">{selectedPs ? selectedPs.name : "Fases"}</p>
            <p className="text-xs text-muted-foreground">
              {!selectedPs ? "Selecciona un tipo" : `${phases.length} fase${phases.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedPs && (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <FolderKanban className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Selecciona un tipo de proyecto</p>
              </div>
            )}
            {selectedPs && phases.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <Layers className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Sin fases configuradas.</p>
              </div>
            )}
            {selectedPs && (() => {
              let phaseIndex = 0
              return phaseRows.map((row) => {
                if (row.type === "phase_ghost") {
                  return <GhostPhaseRow key={`ghost-${row.data.id}`} proposal={row.data} onJumpToProposal={onJumpToProposal} />
                }
                const phase = row.data
                phaseIndex += 1
                const i = phaseIndex
                const isSelected = phase.id === selectedPhaseId
                const phaseProposals = localProposedTasks.filter(
                  (pt) => pt.anchor_phase_set_phase_id === phase.id
                )
                const pendingCount = phaseProposals.filter(
                  (pt) => pt.status === "draft" || pt.status === "submitted"
                ).length
                const forkedPhase = localForkedPhases.find(
                  (f) => f.source_phase_set_phase_id === phase.id && f.status !== "approved"
                )
                return (
                  <div
                    key={phase.id}
                    onClick={() => setSelectedPhaseId(phase.id === selectedPhaseId ? null : phase.id)}
                    className={cn(
                      "group relative cursor-pointer border-b border-border transition-colors",
                      isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center gap-2 px-5 py-3">
                      <span className={cn(
                        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold",
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {i}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{phase.name}</p>
                        {phase.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{phase.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {phase.tasks.length} tarea{phase.tasks.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      {forkedPhase && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-500/15 flex-shrink-0">
                          <GitFork className="w-2.5 h-2.5" /> En edición
                        </span>
                      )}
                      {pendingCount > 0 && (
                        <span className="inline-flex items-center rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-700 bg-amber-500/15 flex-shrink-0">
                          {pendingCount}
                        </span>
                      )}
                      {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    </div>
                    {/* Hover actions — absolutely positioned so they don't affect layout */}
                    <div className="hidden group-hover:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border shadow-sm px-1 py-0.5">
                      {forkedPhase && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onJumpToProposal(forkedPhase.id) }}
                          title="Ver en Mis Propuestas"
                          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors"
                        >
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setProposingPhase({
                            phaseSet: { id: selectedPs.id, name: selectedPs.name },
                            allPhases: phases,
                            defaultAfterPhaseId: phase.id,
                          })
                        }}
                        title="Proponer nueva fase"
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 px-2 py-1 rounded-md hover:bg-primary/10 transition-colors"
                      >
                        <Layers className="w-3 h-3" />
                      </button>
                      {!forkedPhase && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleFork(phase.id) }}
                          disabled={forking === phase.id}
                          title="Copiar a Mis Fases"
                          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-md hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                        >
                          <GitFork className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>

        {/* -- PANEL 3: Tasks -- */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-4 border-b flex-shrink-0 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{selectedPhase ? selectedPhase.name : "Tareas"}</p>
              <p className="text-xs text-muted-foreground">
                {!selectedPhase ? "Selecciona una fase" : `${tasks.length} tarea${tasks.length !== 1 ? "s" : ""} plantilla`}
              </p>
            </div>
            {selectedPhase && (
              <button
                onClick={() => setTaskModalTarget({
                  kind: "canonical-propose",
                  phase: selectedPhase,
                  phaseSetName: selectedPs!.name,
                  defaultAfterTaskId: tasks.length > 0 ? tasks[tasks.length - 1].id : undefined,
                })}
                title="Proponer nueva tarea"
                className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedPhase && (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <ListChecks className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Selecciona una fase</p>
              </div>
            )}
            {selectedPhase && taskRows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <ListChecks className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Sin tareas en esta fase.</p>
                <button
                  onClick={() => setTaskModalTarget({ kind: "canonical-propose", phase: selectedPhase, phaseSetName: selectedPs!.name })}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 px-3 py-1.5 rounded-md border border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Proponer primera tarea
                </button>
              </div>
            )}
            {selectedPhase && tasks.length === 0 && taskRows.length > 0 && (
              <div className="px-5 pt-3">
                <button
                  onClick={() => setTaskModalTarget({ kind: "canonical-propose", phase: selectedPhase, phaseSetName: selectedPs!.name })}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 px-3 py-1.5 rounded-md border border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Proponer primera tarea
                </button>
              </div>
            )}
            {selectedPhase && (() => {
              let taskIndex = 0
              return taskRows.map((row) => {
                if (row.type === "task_ghost") {
                  return <GhostTaskRow key={`ghost-${row.data.id}`} proposal={row.data} onJumpToProposal={onJumpToProposal} />
                }
                const task = row.data
                taskIndex += 1
                const index = taskIndex
                const checklistProposals = localProposedChecklists.filter(
                  (cp) => cp.anchor_task_set_task_id === task.id
                )
                const editProposal = localProposedTasks.find(
                  (pt) => pt.anchor_task_set_task_id === task.id && pt.status !== "approved"
                )
                return (
                  <CanonicalTaskRow
                    key={task.id}
                    task={task}
                    index={index}
                    checklistProposals={checklistProposals}
                    editProposal={editProposal}
                    onJumpToProposal={onJumpToProposal}
                    onProposeNewTask={() =>
                      setTaskModalTarget({
                        kind: "canonical-propose",
                        phase: selectedPhase,
                        phaseSetName: selectedPs!.name,
                        defaultAfterTaskId: task.id,
                      })
                    }
                    onProposeEdit={() =>
                      setTaskModalTarget({
                        kind: "canonical-propose",
                        phase: selectedPhase,
                        phaseSetName: selectedPs!.name,
                        existingTask: task,
                      })
                    }
                    onProposeChecklist={() =>
                      setProposingChecklist({ task, phaseName: selectedPhase.name })
                    }
                  />
                )
              })
            })()}

            {/* Non-interactive pointer to where proposals are now managed */}
            {selectedPhase && (() => {
              const myProposals = localProposedTasks.filter(
                (pt) => pt.anchor_phase_set_phase_id === selectedPhase.id && pt.status !== "approved"
              )
              if (myProposals.length === 0) return null
              return (
                <div className="border-t border-dashed border-border mt-2 px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Tienes {myProposals.length} propuesta{myProposals.length !== 1 ? "s" : ""} de tarea aquí —
                    gestiónalas en <span className="font-medium text-foreground">Mis Propuestas</span>.
                  </p>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {proposingPhase && (
        <ProposedPhaseModal
          phaseSet={proposingPhase.phaseSet}
          allPhases={proposingPhase.allPhases}
          defaultAfterPhaseId={proposingPhase.defaultAfterPhaseId}
          onClose={() => setProposingPhase(null)}
          onCreated={(proposal) => {
            setLocalProposedPhases((prev) => [proposal, ...prev])
            setProposingPhase(null)
            toast("Fase propuesta guardada como borrador — gestiónala en Mis Propuestas", "success")
          }}
        />
      )}

      {taskModalTarget && (
        <TaskFormModal
          target={taskModalTarget}
          positions={positions}
          sops={sops}
          onClose={() => setTaskModalTarget(null)}
          onSaved={(result) => {
            if (result.kind !== "canonical-propose") return
            setLocalProposedTasks((prev) => [result.task, ...prev])
          }}
        />
      )}

      {proposingChecklist && (
        <ProposedChecklistModal
          task={proposingChecklist.task}
          phaseName={proposingChecklist.phaseName}
          onClose={() => setProposingChecklist(null)}
          onCreated={(addition) => {
            setLocalProposedChecklists((prev) => [addition, ...prev])
            setProposingChecklist(null)
          }}
        />
      )}
    </>
  )
}

// -- Ghost rows: full-fidelity preview of a pending proposal, positioned in context --
// Mirrors the real CanonicalTaskRow/phase-row layout exactly (including inline checklist)
// so reviewing a proposal in place never requires a trip to Mis Propuestas — except to
// actually submit/retract/delete it, which is what "Ver en Propuestas" is for.

function GhostPhaseRow({ proposal, onJumpToProposal }: { proposal: LabProposedPhase; onJumpToProposal: (id: string) => void }) {
  // Unlike a real phase, this one has nothing to browse in column 3 — the whole
  // row IS the action, straight to Mis Propuestas, not just a hover-reveal link.
  return (
    <button
      type="button"
      onClick={() => onJumpToProposal(proposal.id)}
      className="w-full flex items-center gap-2 px-5 py-3 border-b border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
    >
      <span className="flex-shrink-0 w-6 h-6 rounded-full border border-dashed border-primary/50 flex items-center justify-center">
        <Sparkles className="w-3 h-3 text-primary" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{proposal.name}</p>
        {proposal.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{proposal.description}</p>
        )}
        <p className={cn("text-xs mt-0.5", (proposal.tasks?.length ?? 0) === 0 ? "text-amber-600 font-medium" : "text-muted-foreground")}>
          {(proposal.tasks?.length ?? 0)} tarea{(proposal.tasks?.length ?? 0) !== 1 ? "s" : ""}
        </p>
      </div>
      <span className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 whitespace-nowrap",
        PROPOSAL_STATUS_COLOR[proposal.status] ?? PROPOSAL_STATUS_COLOR.draft
      )}>
        {PROPOSAL_STATUS_LABEL[proposal.status] ?? proposal.status}
      </span>
      <ArrowUpRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
    </button>
  )
}

function GhostTaskRow({ proposal, onJumpToProposal }: { proposal: LabProposedTask; onJumpToProposal: (id: string) => void }) {
  const items = [...(proposal.checklist_items ?? [])].sort((a, b) => a.item_order - b.item_order)
  const hasChecklist = items.length > 0
  const blockingCount = items.filter((i) => i.is_blocking).length

  return (
    <div className="group border-b border-dashed border-primary/40 bg-primary/5">
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="w-5 h-5 rounded-full border border-dashed border-primary/50 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-2.5 h-2.5 text-primary" />
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{proposal.title}</p>
          {proposal.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{proposal.description}</p>
          )}
        </div>

        {hasChecklist && (
          <span className={cn(
            "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0",
            blockingCount > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}>
            {blockingCount > 0 && <Lock className="w-2.5 h-2.5" />}
            {items.length}
          </span>
        )}
        {proposal.requires_deliverable && <Paperclip className="w-3.5 h-3.5 text-info flex-shrink-0" />}
        {proposal.default_position?.name && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 bg-violet-100 text-violet-700 max-w-[80px] truncate">
            {proposal.default_position.name}
          </span>
        )}
        {proposal.sop?.title && (
          <span title={proposal.sop.title} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-primary/10 text-primary">
            <BookOpen className="w-3 h-3" />
            <span className="hidden sm:inline max-w-[80px] truncate">{proposal.sop.title}</span>
          </span>
        )}
        <span className={cn(
          "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold flex-shrink-0",
          PROPOSAL_STATUS_COLOR[proposal.status] ?? PROPOSAL_STATUS_COLOR.draft
        )}>
          {PROPOSAL_STATUS_LABEL[proposal.status] ?? proposal.status}
        </span>
        <button
          onClick={() => onJumpToProposal(proposal.id)}
          className="opacity-0 group-hover:opacity-100 text-[11px] font-medium text-primary hover:underline transition-all flex-shrink-0"
        >
          Ver en Propuestas
        </button>
      </div>

      {/* Inline checklist — same treatment as a real canonical task */}
      <div className="mt-0 pl-8 pr-3 pb-2 border-t border-dashed border-primary/20 pt-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ListChecks className="w-3 h-3 text-primary/70" />
          <span className="text-[11px] font-medium text-primary/70">Checklist propuesto</span>
          {blockingCount > 0 && (
            <span className="text-[11px] text-destructive/70 flex items-center gap-0.5 ml-0.5">
              <Lock className="w-2.5 h-2.5" />
              {blockingCount}
            </span>
          )}
        </div>

        {hasChecklist ? (
          <div className="space-y-0.5">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>
                  {item.text}
                </span>
                {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/50">Sin checklist</p>
        )}
      </div>
    </div>
  )
}

// -- Task row (column 3) --

function CanonicalTaskRow({
  task, index, checklistProposals, editProposal, onJumpToProposal, onProposeNewTask, onProposeEdit, onProposeChecklist,
}: {
  task: CanonicalTask
  index: number
  checklistProposals: LabProposedChecklistAddition[]
  editProposal: LabProposedTask | undefined
  onJumpToProposal: (id: string) => void
  onProposeNewTask: () => void
  onProposeEdit: () => void
  onProposeChecklist: () => void
}) {
  const sortedChecklistItems = [...task.checklist_items].sort((a, b) => a.item_order - b.item_order)
  const hasChecklist = sortedChecklistItems.length > 0
  const blockingCount = sortedChecklistItems.filter((i) => i.is_blocking).length
  const pendingChecklistProposals = checklistProposals.filter(
    (cp) => cp.status === "draft" || cp.status === "submitted"
  )

  return (
    <div className="group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
          {index}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
          )}
        </div>

        {hasChecklist && (
          <span className={cn(
            "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0",
            blockingCount > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}>
            {blockingCount > 0 && <Lock className="w-2.5 h-2.5" />}
            {sortedChecklistItems.length}
          </span>
        )}
        {task.requires_deliverable && <Paperclip className="w-3.5 h-3.5 text-info flex-shrink-0" />}
        {task.default_position_name && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 bg-violet-100 text-violet-700 max-w-[80px] truncate">
            {task.default_position_name}
          </span>
        )}
        {task.sop_title && (
          <span title={task.sop_title} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-primary/10 text-primary">
            <BookOpen className="w-3 h-3" />
            <span className="hidden sm:inline max-w-[80px] truncate">{task.sop_title}</span>
          </span>
        )}
        {pendingChecklistProposals.length > 0 && (
          <span className="inline-flex items-center rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-700 bg-amber-500/15">
            +{pendingChecklistProposals.length}
          </span>
        )}
        {editProposal && (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 px-2 py-0.5 text-[10px] font-semibold text-blue-600 bg-blue-500/10 flex-shrink-0">
            <Pencil className="w-2.5 h-2.5" /> Editada
          </span>
        )}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
          {editProposal ? (
            <button onClick={() => onJumpToProposal(editProposal.id)} title="Ver en Mis Propuestas"
              className="p-1 rounded text-blue-600 hover:text-blue-700 transition-all flex-shrink-0">
              <ArrowUpRight className="w-3 h-3" />
            </button>
          ) : (
            <button onClick={onProposeEdit} title="Proponer edición"
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-all flex-shrink-0">
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <button onClick={onProposeNewTask} title="Proponer nueva tarea después de esta"
            className="p-1 rounded text-muted-foreground hover:text-primary transition-all flex-shrink-0">
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Inline checklist — always visible like Ops Lab */}
      <div className="mt-0 pl-8 pr-3 pb-2 border-t border-border/40 pt-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ListChecks className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">Checklist plantilla</span>
          {blockingCount > 0 && (
            <span className="text-[11px] text-destructive/70 flex items-center gap-0.5 ml-0.5">
              <Lock className="w-2.5 h-2.5" />
              {blockingCount}
            </span>
          )}
          <button
            type="button"
            onClick={onProposeChecklist}
            className="ml-auto text-[11px] text-primary hover:underline transition-colors"
          >
            + Proponer
          </button>
        </div>

        {hasChecklist && (
          <div className="space-y-0.5">
            {sortedChecklistItems.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>
                  {item.text}
                </span>
                {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}

        {!hasChecklist && pendingChecklistProposals.length === 0 && (
          <p className="text-xs text-muted-foreground/50">Sin checklist</p>
        )}

        {pendingChecklistProposals.length > 0 && (
          <p className="text-[10px] text-amber-700 font-medium pt-1 border-t border-dashed border-border/40 mt-1">
            {pendingChecklistProposals.length} propuesta{pendingChecklistProposals.length !== 1 ? "s" : ""} pendiente{pendingChecklistProposals.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  )
}

