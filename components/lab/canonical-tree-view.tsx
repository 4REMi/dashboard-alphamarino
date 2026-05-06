"use client"

import { useState, useTransition } from "react"
import type {
  CanonicalPhaseSet, CanonicalPhase, CanonicalTask,
  LabProposedTask, LabProposedChecklistAddition, Position, Sop,
} from "@/lib/types"
import {
  FolderKanban, ListChecks, Lock, Paperclip, BookOpen,
  Plus, UserCircle, ChevronRight, Pencil, Layers, Send, RotateCcw, Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { submitProposedTask, retractProposedTask, deleteProposedTask } from "@/lib/actions/lab"
import { ProposedTaskModal } from "@/components/lab/proposed-task-modal"
import { ProposedChecklistModal } from "@/components/lab/proposed-checklist-modal"
import { ProposedPhaseModal } from "@/components/lab/proposed-phase-modal"

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4">
      <p className="text-xs text-muted-foreground text-center">{text}</p>
    </div>
  )
}

interface Props {
  phaseSets: CanonicalPhaseSet[]
  myProposedTasks: LabProposedTask[]
  myProposedChecklists: LabProposedChecklistAddition[]
  positions: Position[]
  sops: Sop[]
}

export function CanonicalTreeView({
  phaseSets, myProposedTasks, myProposedChecklists, positions, sops,
}: Props) {
  const [selectedPsId, setSelectedPsId] = useState<string | null>(null)
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)
  const [proposingPhase, setProposingPhase] = useState<{
    phaseSet: { id: string; name: string }
    allPhases: CanonicalPhase[]
    defaultAfterPhaseId: string
  } | null>(null)
  const [proposingNewTask, setProposingNewTask] = useState<{
    phase: CanonicalPhase
    phaseSetName: string
    defaultAfterTaskId?: string
  } | null>(null)
  const [editingTaskProposal, setEditingTaskProposal] = useState<{
    task: CanonicalTask
    phase: CanonicalPhase
    phaseSetName: string
  } | null>(null)
  const [proposingChecklist, setProposingChecklist] = useState<{
    task: CanonicalTask
    phaseName: string
  } | null>(null)
  const [localProposedTasks, setLocalProposedTasks] = useState<LabProposedTask[]>(myProposedTasks)
  const [localProposedChecklists, setLocalProposedChecklists] = useState<LabProposedChecklistAddition[]>(myProposedChecklists)

  const selectedPs = phaseSets.find((ps) => ps.id === selectedPsId) ?? null
  const phases = selectedPs?.phases ?? []
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) ?? null
  const tasks = selectedPhase?.tasks ?? []

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
      <div
        className="flex border border-border rounded-xl overflow-hidden bg-card"
        style={{ height: "calc(100vh - 220px)", minHeight: 480 }}
      >
        {/* ── PANEL 1: Project Types / Phase Sets ────────────────────── */}
        <div className="w-56 flex-shrink-0 flex flex-col border-r border-border">
          <PanelHeader title="Tipos de Proyecto" subtitle={`${phaseSets.length} tipo${phaseSets.length !== 1 ? "s" : ""}`} />
          <div className="flex-1 overflow-y-auto">
            {phaseSets.map((ps) => {
              const isSelected = ps.id === selectedPsId
              return (
                <div
                  key={ps.id}
                  onClick={() => { setSelectedPsId(ps.id); setSelectedPhaseId(null) }}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors",
                    isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ps.project_type_name ?? ps.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {ps.phases.length} fase{ps.phases.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── PANEL 2: Phases ────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-border">
          <PanelHeader
            title={selectedPs ? selectedPs.name : "Fases"}
            subtitle={!selectedPs ? "Selecciona un tipo" : `${phases.length} fase${phases.length !== 1 ? "s" : ""}`}
          />
          <div className="flex-1 overflow-y-auto">
            {!selectedPs && <EmptyPanel text="Selecciona un tipo de proyecto" />}
            {selectedPs && phases.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-10 px-3">Sin fases configuradas.</p>
            )}
            {selectedPs && phases.map((phase, i) => {
              const isSelected = phase.id === selectedPhaseId
              const phaseProposals = localProposedTasks.filter(
                (pt) => pt.anchor_phase_set_phase_id === phase.id
              )
              const pendingCount = phaseProposals.filter(
                (pt) => pt.status === "draft" || pt.status === "submitted"
              ).length
              return (
                <div
                  key={phase.id}
                  onClick={() => setSelectedPhaseId(phase.id === selectedPhaseId ? null : phase.id)}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors",
                    isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"
                  )}
                >
                  <span className={cn(
                    "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {i + 1}
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
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {pendingCount > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
                        {pendingCount}
                      </span>
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
                      title="Proponer nueva fase después de esta"
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-all px-1.5 py-0.5 rounded hover:bg-primary/10"
                    >
                      <Layers className="w-3 h-3" />
                      Nueva fase
                    </button>
                    {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary" />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── PANEL 3: Tasks ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <PanelHeader
            title={selectedPhase ? selectedPhase.name : "Tareas"}
            subtitle={!selectedPhase ? "Selecciona una fase" : `${tasks.length} tarea${tasks.length !== 1 ? "s" : ""} plantilla`}
          />
          <div className="flex-1 overflow-y-auto">
            {!selectedPhase && <EmptyPanel text="Selecciona una fase" />}
            {selectedPhase && tasks.length === 0 && (
              <div className="flex flex-col items-center py-10 px-4 gap-3">
                <p className="text-xs text-muted-foreground text-center">Sin tareas en esta fase.</p>
                <button
                  onClick={() => setProposingNewTask({ phase: selectedPhase, phaseSetName: selectedPs!.name })}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 px-3 py-1.5 rounded-md border border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Proponer primera tarea
                </button>
              </div>
            )}
            {selectedPhase && tasks.map((task, i) => {
              const checklistProposals = localProposedChecklists.filter(
                (cp) => cp.anchor_task_set_task_id === task.id
              )
              return (
                <CanonicalTaskRow
                  key={task.id}
                  task={task}
                  index={i + 1}
                  checklistProposals={checklistProposals}
                  onProposeNewTask={() =>
                    setProposingNewTask({
                      phase: selectedPhase,
                      phaseSetName: selectedPs!.name,
                      defaultAfterTaskId: task.id,
                    })
                  }
                  onProposeEdit={() =>
                    setEditingTaskProposal({ task, phase: selectedPhase, phaseSetName: selectedPs!.name })
                  }
                  onProposeChecklist={() =>
                    setProposingChecklist({ task, phaseName: selectedPhase.name })
                  }
                />
              )
            })}

            {/* My task proposals for the selected phase */}
            {selectedPhase && (() => {
              const myProposals = localProposedTasks.filter(
                (pt) => pt.anchor_phase_set_phase_id === selectedPhase.id && pt.status !== "approved"
              )
              if (myProposals.length === 0) return null
              return (
                <div className="border-t border-dashed border-border mt-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
                    Mis propuestas de tarea
                  </p>
                  {myProposals.map((pt) => (
                    <ProposedTaskInlineRow
                      key={pt.id}
                      proposal={pt}
                      onSubmit={() => setLocalProposedTasks((prev) => prev.map((t) => t.id === pt.id ? { ...t, status: "submitted" } : t))}
                      onRetract={() => setLocalProposedTasks((prev) => prev.map((t) => t.id === pt.id ? { ...t, status: "draft" } : t))}
                      onDelete={() => setLocalProposedTasks((prev) => prev.filter((t) => t.id !== pt.id))}
                    />
                  ))}
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
          onCreated={() => setProposingPhase(null)}
        />
      )}

      {proposingNewTask && (
        <ProposedTaskModal
          phase={proposingNewTask.phase}
          phaseSetName={proposingNewTask.phaseSetName}
          positions={positions}
          sops={sops}
          defaultAfterTaskId={proposingNewTask.defaultAfterTaskId}
          onClose={() => setProposingNewTask(null)}
          onCreated={(task) => {
            setLocalProposedTasks((prev) => [task, ...prev])
            setProposingNewTask(null)
          }}
        />
      )}

      {editingTaskProposal && (
        <ProposedTaskModal
          phase={editingTaskProposal.phase}
          phaseSetName={editingTaskProposal.phaseSetName}
          positions={positions}
          sops={sops}
          existingTask={editingTaskProposal.task}
          onClose={() => setEditingTaskProposal(null)}
          onCreated={(task) => {
            setLocalProposedTasks((prev) => [task, ...prev])
            setEditingTaskProposal(null)
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

// ── Task row (column 3) ───────────────────────────────────────────────────────

function CanonicalTaskRow({
  task, index, checklistProposals, onProposeNewTask, onProposeEdit, onProposeChecklist,
}: {
  task: CanonicalTask
  index: number
  checklistProposals: LabProposedChecklistAddition[]
  onProposeNewTask: () => void
  onProposeEdit: () => void
  onProposeChecklist: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasChecklist = task.checklist_items.length > 0
  const blockingCount = task.checklist_items.filter((i) => i.is_blocking).length
  const pendingChecklistProposals = checklistProposals.filter(
    (cp) => cp.status === "draft" || cp.status === "submitted"
  )
  const canExpand = hasChecklist || pendingChecklistProposals.length > 0

  return (
    <div className="group border-b border-border/40 transition-colors hover:bg-muted/30">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
          {index}
        </span>

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
              <span className="max-w-[60px] truncate">{task.default_position_name}</span>
            </span>
          )}
          {canExpand && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={cn(
                "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors",
                blockingCount > 0 ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {blockingCount > 0 && <Lock className="w-2.5 h-2.5" />}
              <ListChecks className="w-2.5 h-2.5" />
              {task.checklist_items.length}
              <ChevronRight className={cn("w-2.5 h-2.5 transition-transform", expanded && "rotate-90")} />
            </button>
          )}
          {task.requires_deliverable && <Paperclip className="w-3 h-3 text-info" />}
          {task.sop_title && (
            <span title={task.sop_title} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
              <BookOpen className="w-2.5 h-2.5" />
              <span className="max-w-[60px] truncate">{task.sop_title}</span>
            </span>
          )}
          {pendingChecklistProposals.length > 0 && (
            <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-amber-500/15 text-amber-700">
              +{pendingChecklistProposals.length}
            </span>
          )}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
            <button
              onClick={onProposeNewTask}
              title="Proponer nueva tarea después de esta"
              className="flex items-center gap-0.5 text-[11px] text-primary hover:text-primary/80 px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors"
            >
              <Plus className="w-2.5 h-2.5" />
              Tarea
            </button>
            <button
              onClick={onProposeEdit}
              title="Proponer edición de esta tarea"
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
            >
              <Pencil className="w-2.5 h-2.5" />
              Editar
            </button>
            <button
              onClick={onProposeChecklist}
              title="Proponer ítems de checklist"
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
            >
              <ListChecks className="w-2.5 h-2.5" />
              Checklist
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="pl-9 pr-4 pb-2.5 space-y-1 border-t border-border/30 pt-1.5 bg-muted/10">
          {task.checklist_items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>
                {item.text}
              </span>
              {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
            </div>
          ))}
          {pendingChecklistProposals.length > 0 && (
            <p className="text-[10px] text-amber-700 font-medium pt-1 border-t border-dashed border-border/40 mt-1">
              {pendingChecklistProposals.length} propuesta{pendingChecklistProposals.length !== 1 ? "s" : ""} de checklist pendiente{pendingChecklistProposals.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Inline proposed task row (bottom of panel 3) ──────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", submitted: "En revisión", approved: "Aprobada", rejected: "Rechazada",
}
const STATUS_COLOR: Record<string, string> = {
  draft:     "text-muted-foreground bg-muted",
  submitted: "text-amber-700 bg-amber-500/15",
  approved:  "text-emerald-700 bg-emerald-500/15",
  rejected:  "text-destructive bg-destructive/10",
}

function ProposedTaskInlineRow({ proposal, onSubmit, onRetract, onDelete }: {
  proposal: LabProposedTask
  onSubmit: () => void
  onRetract: () => void
  onDelete: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    startTransition(async () => { await submitProposedTask(proposal.id); onSubmit() })
  }
  function handleRetract() {
    startTransition(async () => { await retractProposedTask(proposal.id); onRetract() })
  }
  function handleDelete() {
    startTransition(async () => { await deleteProposedTask(proposal.id); onDelete() })
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dashed border-border/40 bg-muted/20">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate text-muted-foreground">{proposal.title}</p>
          {(proposal as { anchor_task_set_task_id?: string | null }).anchor_task_set_task_id && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 flex-shrink-0">Edición</span>
          )}
        </div>
        {proposal.description && (
          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{proposal.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className={cn(
          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
          STATUS_COLOR[proposal.status] ?? STATUS_COLOR.draft
        )}>
          {STATUS_LABEL[proposal.status] ?? proposal.status}
        </span>
        {proposal.status === "draft" && (
          <>
            <button onClick={handleSubmit} disabled={isPending} title="Enviar a revisión"
              className="p-1 rounded text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors">
              <Send className="w-3 h-3" />
            </button>
            <button onClick={handleDelete} disabled={isPending} title="Eliminar borrador"
              className="p-1 rounded text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        )}
        {proposal.status === "submitted" && (
          <button onClick={handleRetract} disabled={isPending} title="Retirar"
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
        {proposal.status === "rejected" && (
          <button onClick={handleDelete} disabled={isPending} title="Descartar"
            className="p-1 rounded text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}
