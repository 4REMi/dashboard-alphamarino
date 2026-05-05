"use client"

import { useState, useTransition } from "react"
import type {
  CanonicalPhaseSet, CanonicalPhase, CanonicalTask,
  LabProposedTask, LabProposedChecklistAddition, Position, Sop,
} from "@/lib/types"
import {
  ChevronRight, ChevronDown, FolderKanban, Layers, ListChecks,
  Lock, Paperclip, BookOpen, Plus, UserCircle, Send, RotateCcw,
  CheckCircle2, XCircle, Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ProposedTaskModal } from "@/components/lab/proposed-task-modal"
import { ProposedChecklistModal } from "@/components/lab/proposed-checklist-modal"
import { submitProposedTask, retractProposedTask } from "@/lib/actions/lab"

const PROPOSAL_STATUS_COLOR: Record<string, string> = {
  draft:     "text-muted-foreground bg-muted",
  submitted: "text-amber-700 bg-amber-500/15",
  approved:  "text-emerald-700 bg-emerald-500/15",
  rejected:  "text-destructive bg-destructive/10",
}
const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", submitted: "En revisión", approved: "Aprobada", rejected: "Rechazada",
}

interface Props {
  phaseSets: CanonicalPhaseSet[]
  myProposedTasks: LabProposedTask[]
  myProposedChecklists: LabProposedChecklistAddition[]
  positions: Position[]
  sops: Sop[]
  isAdmin: boolean
}

export function CanonicalTreeView({
  phaseSets, myProposedTasks, myProposedChecklists, positions, sops, isAdmin,
}: Props) {
  const [expandedSets, setExpandedSets] = useState<Set<string>>(
    () => new Set(phaseSets.slice(0, 2).map((ps) => ps.id))
  )
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [proposingTask, setProposingTask] = useState<{
    phase: CanonicalPhase; phaseSetName: string
  } | null>(null)
  const [proposingChecklist, setProposingChecklist] = useState<{
    task: CanonicalTask; phaseName: string
  } | null>(null)
  const [localProposedTasks, setLocalProposedTasks] = useState<LabProposedTask[]>(myProposedTasks)
  const [localProposedChecklists, setLocalProposedChecklists] = useState<LabProposedChecklistAddition[]>(myProposedChecklists)

  function toggleSet(id: string) {
    setExpandedSets((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function togglePhase(id: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (phaseSets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderKanban className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Aún no hay Phase Sets configurados en Ops Lab.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {phaseSets.map((ps) => {
          const isExpanded = expandedSets.has(ps.id)
          return (
            <div key={ps.id} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Phase Set header */}
              <button
                onClick={() => toggleSet(ps.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <FolderKanban className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{ps.name}</span>
                  {ps.project_type_name && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">
                      {ps.project_type_name}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {ps.phases.length} fase{ps.phases.length !== 1 ? "s" : ""}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-border">
                  {ps.phases.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-6 py-3 italic">Sin fases.</p>
                  ) : (
                    ps.phases.map((phase) => (
                      <PhaseRow
                        key={phase.id}
                        phase={phase}
                        phaseSetName={ps.name}
                        isExpanded={expandedPhases.has(phase.id)}
                        onToggle={() => togglePhase(phase.id)}
                        proposedTasks={localProposedTasks.filter(
                          (pt) => pt.anchor_phase_set_phase_id === phase.id
                        )}
                        proposedChecklists={localProposedChecklists}
                        onProposeTask={() => setProposingTask({ phase, phaseSetName: ps.name })}
                        onProposeChecklist={(task) => setProposingChecklist({ task, phaseName: phase.name })}
                        onTaskProposalAdded={(t) => setLocalProposedTasks((prev) => [t, ...prev])}
                        onTaskProposalRetracted={(id) =>
                          setLocalProposedTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: "draft" } : t))
                        }
                        onTaskProposalSubmitted={(id) =>
                          setLocalProposedTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: "submitted" } : t))
                        }
                        isAdmin={isAdmin}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {proposingTask && (
        <ProposedTaskModal
          phase={proposingTask.phase}
          phaseSetName={proposingTask.phaseSetName}
          positions={positions}
          sops={sops}
          onClose={() => setProposingTask(null)}
          onCreated={(task) => {
            setLocalProposedTasks((prev) => [task, ...prev])
            setProposingTask(null)
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

// ── Phase row ─────────────────────────────────────────────────────────────────

function PhaseRow({
  phase, phaseSetName, isExpanded, onToggle,
  proposedTasks, proposedChecklists,
  onProposeTask, onProposeChecklist, onTaskProposalAdded,
  onTaskProposalRetracted, onTaskProposalSubmitted, isAdmin,
}: {
  phase: CanonicalPhase
  phaseSetName: string
  isExpanded: boolean
  onToggle: () => void
  proposedTasks: LabProposedTask[]
  proposedChecklists: LabProposedChecklistAddition[]
  onProposeTask: () => void
  onProposeChecklist: (task: CanonicalTask) => void
  onTaskProposalAdded: (t: LabProposedTask) => void
  onTaskProposalRetracted: (id: string) => void
  onTaskProposalSubmitted: (id: string) => void
  isAdmin: boolean
}) {
  void phaseSetName
  void onTaskProposalAdded

  const pendingTaskProposals = proposedTasks.filter((pt) => pt.status === "submitted" || pt.status === "draft")

  return (
    <div className="border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <Layers className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate">{phase.name}</span>
          {phase.description && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">— {phase.description}</span>
          )}
        </button>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {phase.tasks.length} tarea{phase.tasks.length !== 1 ? "s" : ""}
        </span>
        {pendingTaskProposals.length > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 flex-shrink-0">
            {pendingTaskProposals.length} propuesta{pendingTaskProposals.length !== 1 ? "s" : ""}
          </span>
        )}
        {!isAdmin && (
          <button
            onClick={onProposeTask}
            title="Proponer nueva tarea en esta fase"
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors flex-shrink-0 px-1.5 py-0.5 rounded hover:bg-primary/10"
          >
            <Plus className="w-3 h-3" />
            Proponer tarea
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="pl-8 pr-4 pb-2 space-y-0.5">
          {phase.tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-1.5 px-2">Sin tareas en esta fase.</p>
          ) : (
            phase.tasks.map((task) => {
              const checklistProposals = proposedChecklists.filter(
                (pc) => pc.anchor_task_set_task_id === task.id
              )
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  checklistProposals={checklistProposals}
                  onProposeChecklist={() => onProposeChecklist(task)}
                  onChecklistProposalRetracted={(id) => {
                    void id
                    void onTaskProposalRetracted
                  }}
                  onChecklistProposalSubmitted={(id) => {
                    void id
                    void onTaskProposalSubmitted
                  }}
                  isAdmin={isAdmin}
                />
              )
            })
          )}

          {/* My pending task proposals for this phase */}
          {proposedTasks.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                Mis propuestas de tarea
              </p>
              {proposedTasks.map((pt) => (
                <ProposedTaskRow
                  key={pt.id}
                  proposal={pt}
                  onRetract={() => onTaskProposalRetracted(pt.id)}
                  onSubmit={() => onTaskProposalSubmitted(pt.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task, checklistProposals, onProposeChecklist, isAdmin,
}: {
  task: CanonicalTask
  checklistProposals: LabProposedChecklistAddition[]
  onProposeChecklist: () => void
  onChecklistProposalRetracted: (id: string) => void
  onChecklistProposalSubmitted: (id: string) => void
  isAdmin: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasChecklist = task.checklist_items.length > 0
  const blockingCount = task.checklist_items.filter((i) => i.is_blocking).length
  const pendingChecklistProposals = checklistProposals.filter(
    (cp) => cp.status === "draft" || cp.status === "submitted"
  )

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-2 px-3 py-2">
        {(hasChecklist || pendingChecklistProposals.length > 0) ? (
          <button onClick={() => setExpanded(!expanded)} className="flex-shrink-0">
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-3 h-3 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {task.default_position_name && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              <UserCircle className="w-2.5 h-2.5" />
              <span className="hidden sm:inline max-w-[60px] truncate">{task.default_position_name}</span>
            </span>
          )}
          {hasChecklist && (
            <span className={cn(
              "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              blockingCount > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            )}>
              {blockingCount > 0 && <Lock className="w-2.5 h-2.5" />}
              <ListChecks className="w-2.5 h-2.5" />
              {task.checklist_items.length}
            </span>
          )}
          {task.requires_deliverable && <Paperclip className="w-3 h-3 text-info" />}
          {task.sop_title && (
            <span title={task.sop_title} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
              <BookOpen className="w-2.5 h-2.5" />
              <span className="hidden sm:inline max-w-[60px] truncate">{task.sop_title}</span>
            </span>
          )}
          {pendingChecklistProposals.length > 0 && (
            <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-amber-500/15 text-amber-700">
              +{pendingChecklistProposals.length}
            </span>
          )}
          {!isAdmin && (
            <button
              onClick={onProposeChecklist}
              title="Proponer ítems de checklist"
              className="flex items-center gap-0.5 text-[11px] text-primary hover:text-primary/80 transition-colors px-1.5 py-0.5 rounded hover:bg-primary/10"
            >
              <Plus className="w-2.5 h-2.5" />
              Checklist
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2 space-y-0.5 border-t border-border/30 pt-1.5">
          {task.checklist_items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 text-xs text-muted-foreground pl-4">
              <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>
                {item.text}
              </span>
              {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Proposed task inline row ──────────────────────────────────────────────────

function ProposedTaskRow({
  proposal, onRetract, onSubmit,
}: {
  proposal: LabProposedTask
  onRetract: () => void
  onSubmit: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    startTransition(async () => { await submitProposedTask(proposal.id); onSubmit() })
  }
  function handleRetract() {
    startTransition(async () => { await retractProposedTask(proposal.id); onRetract() })
  }

  const statusColor = PROPOSAL_STATUS_COLOR[proposal.status] ?? "text-muted-foreground bg-muted"
  const statusLabel = PROPOSAL_STATUS_LABEL[proposal.status] ?? proposal.status

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{proposal.title}</p>
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", statusColor)}>
            {statusLabel}
          </span>
        </div>
        {proposal.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{proposal.description}</p>
        )}
        {proposal.default_position && (
          <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
            <UserCircle className="w-2.5 h-2.5" />
            {(proposal.default_position as { name?: string }).name}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {proposal.status === "draft" && (
          <>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              title="Enviar a revisión"
              className="p-1 rounded text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
            >
              <Send className="w-3 h-3" />
            </button>
          </>
        )}
        {proposal.status === "submitted" && (
          <button
            onClick={handleRetract}
            disabled={isPending}
            title="Retirar"
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
        {proposal.status === "approved" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
        {proposal.status === "rejected" && <XCircle className="w-3.5 h-3.5 text-destructive" />}
        {proposal.status === "submitted" && <Clock className="w-3.5 h-3.5 text-amber-600" />}
      </div>
    </div>
  )
}
