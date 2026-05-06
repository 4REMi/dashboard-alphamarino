"use client"

import { useState } from "react"
import type {
  CanonicalPhaseSet, CanonicalPhase, CanonicalTask,
  LabProposedTask, LabProposedChecklistAddition, Position, Sop,
} from "@/lib/types"
import {
  FolderKanban, ListChecks, Lock, Paperclip, BookOpen,
  Plus, UserCircle, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ProposedTaskModal } from "@/components/lab/proposed-task-modal"
import { ProposedChecklistModal } from "@/components/lab/proposed-checklist-modal"

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
  isAdmin: boolean
}

export function CanonicalTreeView({
  phaseSets, myProposedTasks, myProposedChecklists, positions, sops, isAdmin,
}: Props) {
  const [selectedPsId, setSelectedPsId] = useState<string | null>(null)
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)
  const [proposingTask, setProposingTask] = useState<{
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
            {selectedPs && phases.map((phase) => {
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
                    {!isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setProposingTask({ phase, phaseSetName: selectedPs.name })
                        }}
                        title="Proponer nueva tarea en esta fase"
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-all px-1.5 py-0.5 rounded hover:bg-primary/10"
                      >
                        <Plus className="w-3 h-3" />
                        Proponer
                      </button>
                    )}
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
              <p className="text-xs text-muted-foreground text-center py-10 px-3">Sin tareas en esta fase.</p>
            )}
            {selectedPhase && tasks.map((task) => {
              const checklistProposals = localProposedChecklists.filter(
                (cp) => cp.anchor_task_set_task_id === task.id
              )
              return (
                <CanonicalTaskRow
                  key={task.id}
                  task={task}
                  checklistProposals={checklistProposals}
                  isAdmin={isAdmin}
                  onProposeChecklist={() =>
                    setProposingChecklist({ task, phaseName: selectedPhase.name })
                  }
                />
              )
            })}

            {/* My task proposals for the selected phase */}
            {selectedPhase && (() => {
              const myProposals = localProposedTasks.filter(
                (pt) => pt.anchor_phase_set_phase_id === selectedPhase.id
              )
              if (myProposals.length === 0) return null
              return (
                <div className="border-t border-dashed border-border mt-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
                    Mis propuestas de tarea
                  </p>
                  {myProposals.map((pt) => (
                    <ProposedTaskInlineRow key={pt.id} proposal={pt} />
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
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

// ── Task row (column 3) ───────────────────────────────────────────────────────

function CanonicalTaskRow({
  task, checklistProposals, isAdmin, onProposeChecklist,
}: {
  task: CanonicalTask
  checklistProposals: LabProposedChecklistAddition[]
  isAdmin: boolean
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
        {canExpand ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
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
              <span className="max-w-[60px] truncate">{task.default_position_name}</span>
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
              <span className="max-w-[60px] truncate">{task.sop_title}</span>
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
              className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-[11px] text-primary hover:text-primary/80 transition-all px-1.5 py-0.5 rounded hover:bg-primary/10"
            >
              <Plus className="w-2.5 h-2.5" />
              Checklist
            </button>
          )}
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

function ProposedTaskInlineRow({ proposal }: { proposal: LabProposedTask }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dashed border-border/40">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-muted-foreground">{proposal.title}</p>
        {proposal.description && (
          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{proposal.description}</p>
        )}
      </div>
      <span className={cn(
        "text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0",
        STATUS_COLOR[proposal.status] ?? STATUS_COLOR.draft
      )}>
        {STATUS_LABEL[proposal.status] ?? proposal.status}
      </span>
    </div>
  )
}
