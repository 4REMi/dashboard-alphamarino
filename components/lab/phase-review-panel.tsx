"use client"

import { useState, useTransition } from "react"
import type {
  LabPhase, LabPhaseTask, PhaseSet, PhaseSetPhase,
  LabProposedTask, LabProposedChecklistAddition, LabProposedChecklistItem,
  LabProposedPhase,
} from "@/lib/types"
import {
  reviewPhase, promotePhase,
  reviewProposedTask, injectProposedTask,
  reviewProposedChecklistAddition, injectProposedChecklistAddition,
  reviewProposedPhase, injectProposedPhase,
} from "@/lib/actions/lab"
import {
  CheckCircle2, XCircle, MessageSquare, ArrowUpRight,
  ChevronLeft, ChevronRight, LayoutList, Link2, Lock, Paperclip, BookOpen,
  ListChecks, UserCircle,
} from "lucide-react"
import { PanelHeader, EmptyPanel } from "@/components/lab/shared"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

type ProposalTab = "phases" | "tasks" | "checklists" | "new_phases"

interface Props {
  initialPhases: LabPhase[]
  phaseSets: PhaseSet[]
  initialProposedTasks: LabProposedTask[]
  initialProposedChecklists: LabProposedChecklistAddition[]
  initialProposedPhases: LabProposedPhase[]
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", submitted: "Pendiente", approved: "Aprobada", rejected: "Rechazada",
}
const STATUS_COLOR: Record<string, string> = {
  draft: "text-muted-foreground", submitted: "text-amber-600",
  approved: "text-emerald-600", rejected: "text-destructive",
}

export function PhaseReviewPanel({
  initialPhases, phaseSets, initialProposedTasks, initialProposedChecklists, initialProposedPhases,
}: Props) {
  const [tab, setTab] = useState<ProposalTab>("phases")
  const [phases, setPhases] = useState<LabPhase[]>(initialPhases)
  const [proposedTasks, setProposedTasks] = useState<LabProposedTask[]>(initialProposedTasks)
  const [proposedChecklists, setProposedChecklists] = useState<LabProposedChecklistAddition[]>(initialProposedChecklists)
  const [proposedPhases, setProposedPhases] = useState<LabProposedPhase[]>(initialProposedPhases)

  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(phases[0]?.id ?? null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(proposedTasks[0]?.id ?? null)
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(proposedChecklists[0]?.id ?? null)
  const [selectedNewPhaseId, setSelectedNewPhaseId] = useState<string | null>(proposedPhases[0]?.id ?? null)
  const [showPromote, setShowPromote] = useState(false)
  const toast = useToast()

  function showSuccess(msg: string) { toast(msg, "success") }

  const pendingPhases    = phases.filter((p) => p.status === "submitted")
  const reviewedPhases   = phases.filter((p) => p.status === "approved" || p.status === "rejected")
  const pendingTasks     = proposedTasks.filter((t) => t.status === "submitted")
  const reviewedTasks    = proposedTasks.filter((t) => t.status === "approved" || t.status === "rejected")
  const pendingChecklists  = proposedChecklists.filter((c) => c.status === "submitted")
  const reviewedChecklists = proposedChecklists.filter((c) => c.status === "approved" || c.status === "rejected")
  const pendingNewPhases   = proposedPhases.filter((p) => p.status === "submitted")
  const reviewedNewPhases  = proposedPhases.filter((p) => p.status === "approved" || p.status === "rejected")

  const tabBadge = (count: number) => count > 0 ? (
    <span className="ml-1.5 text-[10px] font-semibold bg-amber-500/15 text-amber-600 rounded-full px-1.5 py-0.5">{count}</span>
  ) : null

  const selectedPhase    = phases.find((p) => p.id === selectedPhaseId) ?? null
  const selectedTask     = proposedTasks.find((t) => t.id === selectedTaskId) ?? null
  const selectedChecklist = proposedChecklists.find((c) => c.id === selectedChecklistId) ?? null
  const selectedNewPhase  = proposedPhases.find((p) => p.id === selectedNewPhaseId) ?? null

  function onPhaseReviewed(id: string, action: string, comment: string) {
    setPhases((prev) => prev.map((p) => {
      if (p.id !== id) return p
      const newStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : p.status
      const newReview = {
        id: crypto.randomUUID(), phase_id: id, reviewer_id: "", reviewer: null,
        action: action as "comment" | "approve" | "reject",
        comment: comment || null, created_at: new Date().toISOString(),
      }
      return { ...p, status: newStatus as typeof p.status, reviews: [...(p.reviews ?? []), newReview] }
    }))
  }

  function onTaskReviewed(id: string, action: string) {
    setProposedTasks((prev) => prev.map((t) =>
      t.id !== id ? t : { ...t, status: action === "approve" ? "approved" : "rejected" }
    ))
  }

  function onTaskInjected(id: string) {
    setProposedTasks((prev) => prev.map((t) =>
      t.id !== id ? t : { ...t, status: "approved" }
    ))
    showSuccess("Tarea publicada en el árbol canónico")
  }

  function onChecklistReviewed(id: string, action: string) {
    setProposedChecklists((prev) => prev.map((c) =>
      c.id !== id ? c : { ...c, status: action === "approve" ? "approved" : "rejected" }
    ))
  }

  function onChecklistInjected(id: string) {
    setProposedChecklists((prev) => prev.map((c) =>
      c.id !== id ? c : { ...c, status: "approved" }
    ))
    showSuccess("Checklist publicado en el árbol canónico")
  }

  function onNewPhaseReviewed(id: string, action: string) {
    setProposedPhases((prev) => prev.map((p) =>
      p.id !== id ? p : { ...p, status: action === "approve" ? "approved" : "rejected" }
    ))
  }

  function onNewPhaseInjected(id: string) {
    setProposedPhases((prev) => prev.map((p) =>
      p.id !== id ? p : { ...p, status: "approved" }
    ))
    showSuccess("Fase publicada en el árbol canónico")
  }

  const emptyAll = phases.length === 0 && proposedTasks.length === 0 && proposedChecklists.length === 0 && proposedPhases.length === 0

  if (emptyAll) {
    return (
      <div className="flex border border-border rounded-xl overflow-hidden bg-card items-center justify-center"
        style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        <EmptyPanel icon={LayoutList} text="Sin propuestas enviadas por el equipo aún." />
      </div>
    )
  }

  return (
    <div className="space-y-2">
    <div className="flex border border-border rounded-xl overflow-hidden bg-card"
      style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>

      {/* ── Panel 1: proposal list ─────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-border">
        {/* Tabs */}
        <div className="flex border-b border-border flex-shrink-0">
          {(["phases", "tasks", "checklists", "new_phases"] as ProposalTab[]).map((t) => {
            const count = t === "phases" ? pendingPhases.length : t === "tasks" ? pendingTasks.length : t === "checklists" ? pendingChecklists.length : pendingNewPhases.length
            const label = t === "phases" ? "Fases" : t === "tasks" ? "Tareas" : t === "checklists" ? "Checklist" : "Nuevas fases"
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium transition-colors border-b-2",
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}{tabBadge(count)}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "phases" && (
            <>
              {pendingPhases.length > 0 && (
                <>
                  <SectionHeader label="Pendientes" />
                  {pendingPhases.map((p) => (
                    <PhaseListRow key={p.id} phase={p}
                      isSelected={selectedPhaseId === p.id}
                      onSelect={() => { setSelectedPhaseId(p.id); setShowPromote(false) }} />
                  ))}
                </>
              )}
              {reviewedPhases.length > 0 && (
                <>
                  <SectionHeader label="Revisadas" />
                  {reviewedPhases.map((p) => (
                    <PhaseListRow key={p.id} phase={p}
                      isSelected={selectedPhaseId === p.id}
                      onSelect={() => { setSelectedPhaseId(p.id); setShowPromote(false) }} />
                  ))}
                </>
              )}
              {phases.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">Sin fases enviadas.</p>
              )}
            </>
          )}

          {tab === "tasks" && (
            <>
              {pendingTasks.length > 0 && (
                <>
                  <SectionHeader label="Pendientes" />
                  {pendingTasks.map((t) => (
                    <ProposedTaskListRow key={t.id} task={t}
                      isSelected={selectedTaskId === t.id}
                      onSelect={() => setSelectedTaskId(t.id)} />
                  ))}
                </>
              )}
              {reviewedTasks.length > 0 && (
                <>
                  <SectionHeader label="Revisadas" />
                  {reviewedTasks.map((t) => (
                    <ProposedTaskListRow key={t.id} task={t}
                      isSelected={selectedTaskId === t.id}
                      onSelect={() => setSelectedTaskId(t.id)} />
                  ))}
                </>
              )}
              {proposedTasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">Sin tareas propuestas.</p>
              )}
            </>
          )}

          {tab === "checklists" && (
            <>
              {pendingChecklists.length > 0 && (
                <>
                  <SectionHeader label="Pendientes" />
                  {pendingChecklists.map((c) => (
                    <ProposedChecklistListRow key={c.id} addition={c}
                      isSelected={selectedChecklistId === c.id}
                      onSelect={() => setSelectedChecklistId(c.id)} />
                  ))}
                </>
              )}
              {reviewedChecklists.length > 0 && (
                <>
                  <SectionHeader label="Revisadas" />
                  {reviewedChecklists.map((c) => (
                    <ProposedChecklistListRow key={c.id} addition={c}
                      isSelected={selectedChecklistId === c.id}
                      onSelect={() => setSelectedChecklistId(c.id)} />
                  ))}
                </>
              )}
              {proposedChecklists.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">Sin checklist propuestas.</p>
              )}
            </>
          )}

          {tab === "new_phases" && (
            <>
              {pendingNewPhases.length > 0 && (
                <>
                  <SectionHeader label="Pendientes" />
                  {pendingNewPhases.map((p) => (
                    <ProposedPhaseListRow key={p.id} phase={p}
                      isSelected={selectedNewPhaseId === p.id}
                      onSelect={() => setSelectedNewPhaseId(p.id)} />
                  ))}
                </>
              )}
              {reviewedNewPhases.length > 0 && (
                <>
                  <SectionHeader label="Revisadas" />
                  {reviewedNewPhases.map((p) => (
                    <ProposedPhaseListRow key={p.id} phase={p}
                      isSelected={selectedNewPhaseId === p.id}
                      onSelect={() => setSelectedNewPhaseId(p.id)} />
                  ))}
                </>
              )}
              {proposedPhases.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">Sin nuevas fases propuestas.</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Panel 2: detail ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {tab === "phases" && (
          !selectedPhase ? (
            <>
              <PanelHeader title="Detalle" subtitle="Selecciona una fase" />
              <EmptyPanel icon={Link2} text="Selecciona una fase para revisarla" />
            </>
          ) : showPromote ? (
            <PhaseSetPicker phaseSets={phaseSets} phase={selectedPhase}
              onPromoted={() => setShowPromote(false)} onCancel={() => setShowPromote(false)} />
          ) : (
            <PhaseDetail phase={selectedPhase}
              onReviewed={(action, comment) => onPhaseReviewed(selectedPhase.id, action, comment)}
              onPromote={() => setShowPromote(true)} />
          )
        )}

        {tab === "tasks" && (
          !selectedTask ? (
            <>
              <PanelHeader title="Tarea propuesta" subtitle="Selecciona una propuesta" />
              <EmptyPanel icon={Link2} text="Selecciona una tarea propuesta" />
            </>
          ) : (
            <ProposedTaskDetail task={selectedTask}
              onReviewed={(action) => onTaskReviewed(selectedTask.id, action)}
              onInjected={() => onTaskInjected(selectedTask.id)} />
          )
        )}

        {tab === "checklists" && (
          !selectedChecklist ? (
            <>
              <PanelHeader title="Checklist propuesto" subtitle="Selecciona una propuesta" />
              <EmptyPanel icon={Link2} text="Selecciona una propuesta de checklist" />
            </>
          ) : (
            <ProposedChecklistDetail addition={selectedChecklist}
              onReviewed={(action) => onChecklistReviewed(selectedChecklist.id, action)}
              onInjected={() => onChecklistInjected(selectedChecklist.id)} />
          )
        )}

        {tab === "new_phases" && (
          !selectedNewPhase ? (
            <>
              <PanelHeader title="Nueva fase propuesta" subtitle="Selecciona una propuesta" />
              <EmptyPanel icon={Link2} text="Selecciona una nueva fase propuesta" />
            </>
          ) : (
            <ProposedNewPhaseDetail phase={selectedNewPhase}
              onReviewed={(action) => onNewPhaseReviewed(selectedNewPhase.id, action)}
              onInjected={() => onNewPhaseInjected(selectedNewPhase.id)} />
          )
        )}
      </div>
    </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  )
}

function PhaseListRow({ phase, isSelected, onSelect }: { phase: LabPhase; isSelected: boolean; onSelect: () => void }) {
  const author = (phase.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  return (
    <div onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{phase.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{author}</p>
          <span className={`text-[10px] font-semibold flex-shrink-0 ${STATUS_COLOR[phase.status]}`}>
            {STATUS_LABEL[phase.status]}
          </span>
        </div>
      </div>
      {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
    </div>
  )
}

function ProposedTaskListRow({ task, isSelected, onSelect }: { task: LabProposedTask; isSelected: boolean; onSelect: () => void }) {
  const author = (task.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  const phaseName = (task.anchor_phase as { name?: string } | null)?.name ?? "Fase desconocida"
  return (
    <div onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{task.title}</p>
          {task.anchor_task_set_task_id && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 flex-shrink-0">Edición</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{author} · {phaseName}</p>
          <span className={`text-[10px] font-semibold flex-shrink-0 ${STATUS_COLOR[task.status]}`}>
            {STATUS_LABEL[task.status]}
          </span>
        </div>
      </div>
      {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
    </div>
  )
}

function ProposedChecklistListRow({ addition, isSelected, onSelect }: {
  addition: LabProposedChecklistAddition; isSelected: boolean; onSelect: () => void
}) {
  const author = (addition.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  const taskTitle = (addition.anchor_task as { title?: string } | null)?.title ?? "Tarea desconocida"
  return (
    <div onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{taskTitle}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{author} · {(addition.items ?? []).length} ítem{(addition.items ?? []).length !== 1 ? "s" : ""}</p>
          <span className={`text-[10px] font-semibold flex-shrink-0 ${STATUS_COLOR[addition.status]}`}>
            {STATUS_LABEL[addition.status]}
          </span>
        </div>
      </div>
      {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
    </div>
  )
}

// ── Phase detail (existing logic) ─────────────────────────────────────────────

function PhaseDetail({ phase, onReviewed, onPromote }: {
  phase: LabPhase
  onReviewed: (action: string, comment: string) => void
  onPromote: () => void
}) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()

  const author = (phase.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  const tasks = [...(phase.tasks ?? [])].sort((a, b) => a.task_order - b.task_order) as LabPhaseTask[]
  const reviews = [...(phase.reviews ?? [])].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  function handleReview(action: "comment" | "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      alert("Por favor agrega un comentario al rechazar.")
      return
    }
    startTransition(async () => {
      await reviewPhase(phase.id, action, comment)
      onReviewed(action, comment)
      setComment("")
    })
  }

  return (
    <>
      <PanelHeader
        title={phase.name}
        subtitle={`Por ${author} · ${new Date(phase.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}`}
      />
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <EmptyPanel icon={LayoutList} text="Sin tareas" />
        ) : (
          tasks.map((task, i) => <TaskPreviewRow key={task.id} task={task} index={i} />)
        )}
        {reviews.length > 0 && (
          <div className="border-t border-border px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Historial</p>
            {reviews.map((r) => (
              <div key={r.id} className={`flex gap-2.5 text-sm ${r.action === "approve" ? "text-emerald-700" : r.action === "reject" ? "text-destructive" : "text-foreground"}`}>
                {r.action === "approve" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
                 r.action === "reject"  ? <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
                 <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />}
                <div>
                  <span className="font-medium">{(r.reviewer as { full_name?: string } | null)?.full_name ?? "Admin"}</span>
                  {r.comment && <span className="text-muted-foreground"> — {r.comment}</span>}
                  <span className="text-xs text-muted-foreground ml-1">
                    {new Date(r.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border px-4 py-3 bg-muted/10 flex-shrink-0 space-y-2">
        {phase.status === "approved" ? (
          <button onClick={onPromote}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
            <ArrowUpRight className="w-3.5 h-3.5" /> Publicar en árbol canónico
          </button>
        ) : phase.status === "submitted" ? (
          <>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Comentario (obligatorio al rechazar)…" rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
            <div className="flex gap-2">
              <button onClick={() => handleReview("comment")} disabled={isPending || !comment.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                <MessageSquare className="w-3 h-3" /> Comentar
              </button>
              <button onClick={() => handleReview("approve")} disabled={isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 className="w-3 h-3" /> Aprobar
              </button>
              <button onClick={() => handleReview("reject")} disabled={isPending || !comment.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                <XCircle className="w-3 h-3" /> Rechazar
              </button>
            </div>
          </>
        ) : (
          <p className={`text-xs font-medium ${STATUS_COLOR[phase.status]}`}>{STATUS_LABEL[phase.status]}</p>
        )}
      </div>
    </>
  )
}

// ── Proposed task detail ──────────────────────────────────────────────────────

function ProposedTaskDetail({ task, onReviewed, onInjected }: {
  task: LabProposedTask
  onReviewed: (action: string) => void
  onInjected: () => void
}) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()

  const author = (task.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  const phaseName = (task.anchor_phase as { name?: string } | null)?.name ?? "Fase desconocida"
  const sopTitle = (task.sop as { title?: string } | null)?.title ?? null
  const positionName = (task.default_position as { name?: string } | null)?.name ?? null

  function handleReview(action: "comment" | "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      alert("Por favor agrega un comentario al rechazar.")
      return
    }
    startTransition(async () => {
      await reviewProposedTask(task.id, action, comment)
      onReviewed(action)
      setComment("")
    })
  }

  function handleInject() {
    startTransition(async () => {
      await injectProposedTask(task.id)
      onInjected()
    })
  }

  const items = task.checklist_items ?? []

  return (
    <>
      <PanelHeader
        title={task.title}
        subtitle={task.anchor_task_set_task_id ? `Por ${author} · Fase: ${phaseName} · (Edición de tarea)` : `Por ${author} · Fase: ${phaseName}`}
      />
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {task.description && (
          <p className="text-sm text-muted-foreground">{task.description}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {positionName && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
              <UserCircle className="w-3 h-3" /> {positionName}
            </span>
          )}
          {task.requires_deliverable && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-info/10 text-info">
              <Paperclip className="w-3 h-3" /> Requiere entregable
            </span>
          )}
          {sopTitle && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/10 text-primary">
              <BookOpen className="w-3 h-3" /> {sopTitle}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <ListChecks className="w-3.5 h-3.5" /> Checklist propuesto
            </p>
            <div className="rounded-lg border border-border/50 divide-y divide-border/30">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className={cn("flex-1 min-w-0 truncate", item.is_blocking && "font-medium")}>{item.text}</span>
                  {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        )}
        {(task.reviews ?? []).length > 0 && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Historial</p>
            {[...(task.reviews ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((r) => (
              <div key={r.id} className={`flex gap-2 text-sm ${r.action === "approve" ? "text-emerald-700" : r.action === "reject" ? "text-destructive" : "text-foreground"}`}>
                {r.action === "approve" ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> :
                 r.action === "reject"  ? <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> :
                 <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />}
                <div>
                  <span className="font-medium">{(r.reviewer as { full_name?: string } | null)?.full_name ?? "Admin"}</span>
                  {r.comment && <span className="text-muted-foreground"> — {r.comment}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border px-4 py-3 bg-muted/10 flex-shrink-0 space-y-2">
        {task.status === "approved" ? (
          <button onClick={handleInject} disabled={isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            <ArrowUpRight className="w-3.5 h-3.5" /> {isPending ? "Publicando…" : "Publicar en árbol"}
          </button>
        ) : task.status === "submitted" ? (
          <>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Comentario (obligatorio al rechazar)…" rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
            <div className="flex gap-2">
              <button onClick={() => handleReview("comment")} disabled={isPending || !comment.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                <MessageSquare className="w-3 h-3" /> Comentar
              </button>
              <button onClick={() => handleReview("approve")} disabled={isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 className="w-3 h-3" /> Aprobar
              </button>
              <button onClick={() => handleReview("reject")} disabled={isPending || !comment.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                <XCircle className="w-3 h-3" /> Rechazar
              </button>
            </div>
          </>
        ) : (
          <p className={`text-xs font-medium ${STATUS_COLOR[task.status]}`}>{STATUS_LABEL[task.status]}</p>
        )}
      </div>
    </>
  )
}

// ── Proposed checklist detail ─────────────────────────────────────────────────

function ProposedChecklistDetail({ addition, onReviewed, onInjected }: {
  addition: LabProposedChecklistAddition
  onReviewed: (action: string) => void
  onInjected: () => void
}) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()

  const author = (addition.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  const taskTitle = (addition.anchor_task as { title?: string } | null)?.title ?? "Tarea desconocida"
  const items = (addition.items ?? []) as LabProposedChecklistItem[]

  function handleReview(action: "comment" | "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      alert("Por favor agrega un comentario al rechazar.")
      return
    }
    startTransition(async () => {
      await reviewProposedChecklistAddition(addition.id, action, comment)
      onReviewed(action)
      setComment("")
    })
  }

  function handleInject() {
    startTransition(async () => {
      await injectProposedChecklistAddition(addition.id)
      onInjected()
    })
  }

  return (
    <>
      <PanelHeader title={taskTitle} subtitle={`Checklist por ${author}`} />
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
            <ListChecks className="w-3.5 h-3.5" /> Ítems propuestos
          </p>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sin ítems.</p>
          ) : (
            <div className="rounded-lg border border-border/50 divide-y divide-border/30">
              {items.sort((a, b) => a.item_order - b.item_order).map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className={cn("flex-1 min-w-0 truncate", item.is_blocking && "font-medium")}>{item.text}</span>
                  {item.is_blocking && (
                    <span className="flex items-center gap-0.5 text-[10px] text-destructive">
                      <Lock className="w-2.5 h-2.5" /> Bloquea
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {(addition.reviews ?? []).length > 0 && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Historial</p>
            {[...(addition.reviews ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((r) => (
              <div key={r.id} className={`flex gap-2 text-sm ${r.action === "approve" ? "text-emerald-700" : r.action === "reject" ? "text-destructive" : "text-foreground"}`}>
                {r.action === "approve" ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> :
                 r.action === "reject"  ? <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> :
                 <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />}
                <div>
                  <span className="font-medium">{(r.reviewer as { full_name?: string } | null)?.full_name ?? "Admin"}</span>
                  {r.comment && <span className="text-muted-foreground"> — {r.comment}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border px-4 py-3 bg-muted/10 flex-shrink-0 space-y-2">
        {addition.status === "approved" ? (
          <button onClick={handleInject} disabled={isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            <ArrowUpRight className="w-3.5 h-3.5" /> {isPending ? "Publicando…" : "Agregar a checklist canónico"}
          </button>
        ) : addition.status === "submitted" ? (
          <>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Comentario (obligatorio al rechazar)…" rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
            <div className="flex gap-2">
              <button onClick={() => handleReview("comment")} disabled={isPending || !comment.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                <MessageSquare className="w-3 h-3" /> Comentar
              </button>
              <button onClick={() => handleReview("approve")} disabled={isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 className="w-3 h-3" /> Aprobar
              </button>
              <button onClick={() => handleReview("reject")} disabled={isPending || !comment.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                <XCircle className="w-3 h-3" /> Rechazar
              </button>
            </div>
          </>
        ) : (
          <p className={`text-xs font-medium ${STATUS_COLOR[addition.status]}`}>{STATUS_LABEL[addition.status]}</p>
        )}
      </div>
    </>
  )
}

// ── Proposed phase list row ───────────────────────────────────────────────────

function ProposedPhaseListRow({ phase, isSelected, onSelect }: { phase: LabProposedPhase; isSelected: boolean; onSelect: () => void }) {
  const author = (phase.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  return (
    <div onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{phase.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{author}</p>
          <span className={`text-[10px] font-semibold flex-shrink-0 ${STATUS_COLOR[phase.status]}`}>
            {STATUS_LABEL[phase.status]}
          </span>
        </div>
      </div>
      {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
    </div>
  )
}

// ── Proposed new phase detail ─────────────────────────────────────────────────

function ProposedNewPhaseDetail({ phase, onReviewed, onInjected }: { phase: LabProposedPhase; onReviewed: (action: string) => void; onInjected: () => void }) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()
  const author = (phase.author as { full_name?: string } | null)?.full_name ?? "Empleado"

  function handleReview(action: "approve" | "reject") {
    if (action === "reject" && !comment.trim()) { alert("Por favor agrega un comentario al rechazar."); return }
    startTransition(async () => {
      await reviewProposedPhase(phase.id, action, comment)
      onReviewed(action)
      setComment("")
    })
  }

  function handleInject() {
    startTransition(async () => {
      await injectProposedPhase(phase.id)
      onInjected()
    })
  }

  return (
    <>
      <PanelHeader title={phase.name} subtitle={`Por ${author} · Nueva fase para el árbol canónico`} />
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {phase.description && <p className="text-sm text-muted-foreground">{phase.description}</p>}
        {phase.position_after_phase_id && (
          <p className="text-xs text-muted-foreground">Insertar después de la fase seleccionada.</p>
        )}
      </div>
      <div className="border-t border-border px-4 py-3 bg-muted/10 flex-shrink-0 space-y-2">
        {phase.status === "approved" ? (
          <button onClick={handleInject} disabled={isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            <ArrowUpRight className="w-3.5 h-3.5" /> {isPending ? "Publicando…" : "Publicar en árbol canónico"}
          </button>
        ) : phase.status === "submitted" ? (
          <>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Comentario (obligatorio al rechazar)…" rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
            <div className="flex gap-2">
              <button onClick={() => handleReview("approve")} disabled={isPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 className="w-3 h-3" /> Aprobar
              </button>
              <button onClick={() => handleReview("reject")} disabled={isPending || !comment.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                <XCircle className="w-3 h-3" /> Rechazar
              </button>
            </div>
          </>
        ) : (
          <p className={`text-xs font-medium ${STATUS_COLOR[phase.status]}`}>{STATUS_LABEL[phase.status]}</p>
        )}
      </div>
    </>
  )
}

// ── Task preview row (read-only) ──────────────────────────────────────────────

function TaskPreviewRow({ task, index }: { task: LabPhaseTask; index: number }) {
  const checklistItems = task.checklist_items ?? []
  const sopName = (task.sop as { title?: string } | null)?.title ?? null
  const positionName = (task.default_position as { name?: string } | null)?.name ?? null

  return (
    <div className="group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>}
        </div>
        {positionName && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
            <UserCircle className="w-2.5 h-2.5" />{positionName}
          </span>
        )}
        {checklistItems.length > 0 && (
          <span className={cn(
            "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0",
            checklistItems.some((i) => i.is_blocking) ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}>
            {checklistItems.some((i) => i.is_blocking) && <Lock className="w-2.5 h-2.5" />}
            {checklistItems.length}
          </span>
        )}
        {task.requires_deliverable && <Paperclip className="w-3.5 h-3.5 text-info flex-shrink-0" />}
        {sopName && (
          <span title={sopName} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-primary/10 text-primary">
            <BookOpen className="w-3 h-3" />
            <span className="hidden sm:inline max-w-[80px] truncate">{sopName}</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ── Phase Set card picker ─────────────────────────────────────────────────────

function PhaseSetPicker({ phaseSets, phase, onPromoted, onCancel }: {
  phaseSets: PhaseSet[]
  phase: LabPhase
  onPromoted: () => void
  onCancel: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    if (!selectedId) return
    startTransition(async () => {
      await promotePhase(phase.id, selectedId)
      onPromoted()
    })
  }

  return (
    <>
      <PanelHeader title="Publicar en árbol canónico" subtitle={`Fase: ${phase.name}`} />
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={onCancel} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-xs text-muted-foreground">La fase se agregará al final del Phase Set seleccionado.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {phaseSets.map((ps) => {
            const psPhases = [...(ps.phases ?? [])].sort((a: PhaseSetPhase, b: PhaseSetPhase) => a.phase_order - b.phase_order)
            const isSelected = selectedId === ps.id
            return (
              <button key={ps.id} onClick={() => setSelectedId(ps.id)}
                className={`text-left rounded-xl border p-3 transition-all ${isSelected ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400" : "border-border hover:border-primary/40 hover:bg-muted/50"}`}>
                <p className="text-sm font-semibold truncate">{ps.name}</p>
                <div className="mt-2 space-y-0.5 min-h-[2rem]">
                  {psPhases.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin fases aún</p>
                  ) : (
                    psPhases.slice(0, 5).map((ph: PhaseSetPhase) => (
                      <p key={ph.id} className="text-xs text-muted-foreground truncate">· {ph.name}</p>
                    ))
                  )}
                  {psPhases.length > 5 && <p className="text-xs text-muted-foreground">+{psPhases.length - 5} más</p>}
                </div>
                {isSelected && <p className="text-xs text-emerald-700 font-medium mt-2">↓ Se agregará aquí</p>}
              </button>
            )
          })}
          {phaseSets.length === 0 && (
            <p className="col-span-2 text-sm text-muted-foreground text-center py-8">
              No hay Phase Sets en Ops Lab aún.
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-border px-4 py-3 bg-muted/10 flex-shrink-0 flex gap-2">
        <button onClick={handleConfirm} disabled={isPending || !selectedId}
          className="text-sm px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {isPending ? "Publicando…" : "Confirmar publicación"}
        </button>
        <button onClick={onCancel} className="text-sm px-3 py-2 text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </>
  )
}
