"use client"

import { useState, useTransition } from "react"
import type {
  LabPhase, LabPhaseTask, PhaseSet, PhaseSetPhase, CanonicalPhaseSet, CanonicalTask,
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
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { PositionedTaskContext, PositionedPhaseContext, TaskEditDiff, ChecklistBeforeAfter } from "@/components/lab/proposal-context"

type ProposalTab = "phases" | "tasks" | "checklists" | "new_phases"

interface Props {
  initialPhases: LabPhase[]
  phaseSets: PhaseSet[]
  initialProposedTasks: LabProposedTask[]
  initialProposedChecklists: LabProposedChecklistAddition[]
  initialProposedPhases: LabProposedPhase[]
  canonicalTree: CanonicalPhaseSet[]
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", submitted: "Pendiente", approved: "Aprobada", rejected: "Rechazada",
}
const STATUS_STYLE: Record<string, string> = {
  draft: "text-muted-foreground bg-muted border-border",
  submitted: "text-amber-700 bg-amber-50 border-amber-200",
  approved: "text-emerald-700 bg-emerald-50 border-emerald-200",
  rejected: "text-destructive bg-destructive/10 border-destructive/20",
}

export function PhaseReviewPanel({
  initialPhases, phaseSets, initialProposedTasks, initialProposedChecklists, initialProposedPhases, canonicalTree,
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
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const toast = useToast()

  function handleDismiss(id: string) {
    setDismissedIds((prev) => new Set([...prev, id]))
  }

  function showSuccess(msg: string) { toast(msg, "success") }

  const pendingPhases    = phases.filter((p) => p.status === "submitted")
  const reviewedPhases   = phases.filter((p) => (p.status === "approved" || p.status === "rejected") && !dismissedIds.has(p.id))
  const pendingTasks     = proposedTasks.filter((t) => t.status === "submitted")
  const reviewedTasks    = proposedTasks.filter((t) => (t.status === "approved" || t.status === "rejected") && !dismissedIds.has(t.id))
  const pendingChecklists  = proposedChecklists.filter((c) => c.status === "submitted")
  const reviewedChecklists = proposedChecklists.filter((c) => (c.status === "approved" || c.status === "rejected") && !dismissedIds.has(c.id))
  const pendingNewPhases   = proposedPhases.filter((p) => p.status === "submitted")
  const reviewedNewPhases  = proposedPhases.filter((p) => (p.status === "approved" || p.status === "rejected") && !dismissedIds.has(p.id))

  const tabBadge = (count: number) => count > 0 ? (
    <span className="ml-1.5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{count}</span>
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
      <div className="flex rounded-xl border border-border bg-card shadow-sm items-center justify-center"
        style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <LayoutList className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Sin propuestas enviadas por el equipo aún.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
    <div className="flex rounded-xl border border-border bg-card shadow-sm overflow-hidden"
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
                    <ListRow key={p.id} isSelected={selectedPhaseId === p.id}
                      onSelect={() => { setSelectedPhaseId(p.id); setShowPromote(false) }}
                      title={p.name}
                      subtitle={(p.author as { full_name?: string } | null)?.full_name ?? "Empleado"}
                      status={p.status} />
                  ))}
                </>
              )}
              {reviewedPhases.length > 0 && (
                <>
                  <SectionHeader label="Revisadas" />
                  {reviewedPhases.map((p) => (
                    <ListRow key={p.id} isSelected={selectedPhaseId === p.id}
                      onSelect={() => { setSelectedPhaseId(p.id); setShowPromote(false) }}
                      title={p.name}
                      subtitle={(p.author as { full_name?: string } | null)?.full_name ?? "Empleado"}
                      status={p.status} />
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
                    <ListRow key={t.id} isSelected={selectedTaskId === t.id}
                      onSelect={() => setSelectedTaskId(t.id)}
                      title={t.title}
                      subtitle={`${(t.author as { full_name?: string } | null)?.full_name ?? "Empleado"} · ${(t.anchor_phase as { name?: string } | null)?.name ?? "Fase"}`}
                      status={t.status}
                      badge={t.anchor_task_set_task_id ? "Edición" : undefined} />
                  ))}
                </>
              )}
              {reviewedTasks.length > 0 && (
                <>
                  <SectionHeader label="Revisadas" />
                  {reviewedTasks.map((t) => (
                    <ListRow key={t.id} isSelected={selectedTaskId === t.id}
                      onSelect={() => setSelectedTaskId(t.id)}
                      title={t.title}
                      subtitle={`${(t.author as { full_name?: string } | null)?.full_name ?? "Empleado"} · ${(t.anchor_phase as { name?: string } | null)?.name ?? "Fase"}`}
                      status={t.status}
                      badge={t.anchor_task_set_task_id ? "Edición" : undefined} />
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
                    <ListRow key={c.id} isSelected={selectedChecklistId === c.id}
                      onSelect={() => setSelectedChecklistId(c.id)}
                      title={(c.anchor_task as { title?: string } | null)?.title ?? "Tarea desconocida"}
                      subtitle={`${(c.author as { full_name?: string } | null)?.full_name ?? "Empleado"} · ${(c.items ?? []).length} ítem${(c.items ?? []).length !== 1 ? "s" : ""}`}
                      status={c.status} />
                  ))}
                </>
              )}
              {reviewedChecklists.length > 0 && (
                <>
                  <SectionHeader label="Revisadas" />
                  {reviewedChecklists.map((c) => (
                    <ListRow key={c.id} isSelected={selectedChecklistId === c.id}
                      onSelect={() => setSelectedChecklistId(c.id)}
                      title={(c.anchor_task as { title?: string } | null)?.title ?? "Tarea desconocida"}
                      subtitle={`${(c.author as { full_name?: string } | null)?.full_name ?? "Empleado"} · ${(c.items ?? []).length} ítem${(c.items ?? []).length !== 1 ? "s" : ""}`}
                      status={c.status} />
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
                    <ListRow key={p.id} isSelected={selectedNewPhaseId === p.id}
                      onSelect={() => setSelectedNewPhaseId(p.id)}
                      title={p.name}
                      subtitle={(p.author as { full_name?: string } | null)?.full_name ?? "Empleado"}
                      status={p.status} />
                  ))}
                </>
              )}
              {reviewedNewPhases.length > 0 && (
                <>
                  <SectionHeader label="Revisadas" />
                  {reviewedNewPhases.map((p) => (
                    <ListRow key={p.id} isSelected={selectedNewPhaseId === p.id}
                      onSelect={() => setSelectedNewPhaseId(p.id)}
                      title={p.name}
                      subtitle={(p.author as { full_name?: string } | null)?.full_name ?? "Empleado"}
                      status={p.status} />
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
            <EmptyDetail text="Selecciona una fase para revisarla" />
          ) : showPromote ? (
            <PhaseSetPicker phaseSets={phaseSets} phase={selectedPhase}
              onPromoted={() => setShowPromote(false)} onCancel={() => setShowPromote(false)} />
          ) : (
            <PhaseDetail phase={selectedPhase}
              onReviewed={(action, comment) => onPhaseReviewed(selectedPhase.id, action, comment)}
              onPromote={() => setShowPromote(true)}
              onDismiss={() => handleDismiss(selectedPhase.id)} />
          )
        )}

        {tab === "tasks" && (
          !selectedTask ? (
            <EmptyDetail text="Selecciona una tarea propuesta" />
          ) : (
            <ProposedTaskDetail task={selectedTask} canonicalTree={canonicalTree}
              onReviewed={(action) => onTaskReviewed(selectedTask.id, action)}
              onInjected={() => onTaskInjected(selectedTask.id)}
              onDismiss={() => handleDismiss(selectedTask.id)} />
          )
        )}

        {tab === "checklists" && (
          !selectedChecklist ? (
            <EmptyDetail text="Selecciona una propuesta de checklist" />
          ) : (
            <ProposedChecklistDetail addition={selectedChecklist} canonicalTree={canonicalTree}
              onReviewed={(action) => onChecklistReviewed(selectedChecklist.id, action)}
              onInjected={() => onChecklistInjected(selectedChecklist.id)}
              onDismiss={() => handleDismiss(selectedChecklist.id)} />
          )
        )}

        {tab === "new_phases" && (
          !selectedNewPhase ? (
            <EmptyDetail text="Selecciona una nueva fase propuesta" />
          ) : (
            <ProposedNewPhaseDetail phase={selectedNewPhase} canonicalTree={canonicalTree}
              onReviewed={(action) => onNewPhaseReviewed(selectedNewPhase.id, action)}
              onInjected={() => onNewPhaseInjected(selectedNewPhase.id)}
              onDismiss={() => handleDismiss(selectedNewPhase.id)} />
          )
        )}
      </div>
    </div>
    </div>
  )
}

// ── Shared UI helpers ───────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-5 py-2 bg-muted/30 border-b border-border">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  )
}

function EmptyDetail({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-6">
      <Link2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function ListRow({ isSelected, onSelect, title, subtitle, status, badge }: {
  isSelected: boolean; onSelect: () => void; title: string; subtitle: string; status: string; badge?: string
}) {
  return (
    <div onClick={onSelect}
      className={cn(
        "flex items-center gap-2 px-5 py-3 cursor-pointer border-b border-border transition-colors",
        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/40"
      )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{title}</p>
          {badge && (
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 flex-shrink-0">{badge}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          <span className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0",
            STATUS_STYLE[status] ?? STATUS_STYLE.draft
          )}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
      </div>
      {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
    </div>
  )
}

function DetailHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-5 py-4 border-b border-border flex-shrink-0">
      <h3 className="font-semibold text-sm truncate">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  )
}

function ReviewHistory({ reviews }: { reviews: Array<{ id: string; action: string; comment: string | null; created_at: string; reviewer?: unknown }> }) {
  if (reviews.length === 0) return null
  const sorted = [...reviews].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Historial</p>
      {sorted.map((r) => (
        <div key={r.id} className={cn("flex gap-2.5 text-sm",
          r.action === "approve" ? "text-emerald-700" : r.action === "reject" ? "text-destructive" : "text-foreground"
        )}>
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
  )
}

function ReviewActions({ status, onReview, onInject, onDismiss, isPending, comment, setComment, injectLabel }: {
  status: string
  onReview: (action: "comment" | "approve" | "reject") => void
  onInject?: () => void
  onDismiss: () => void
  isPending: boolean
  comment: string
  setComment: (v: string) => void
  injectLabel: string
}) {
  return (
    <div className="border-t border-border px-5 py-4 bg-muted/10 flex-shrink-0 space-y-3">
      {status === "approved" && onInject ? (
        <Button onClick={onInject} disabled={isPending} size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
          {isPending ? "Publicando…" : injectLabel}
        </Button>
      ) : status === "submitted" ? (
        <>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="Comentario (obligatorio al rechazar)…" rows={2}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onReview("comment")} disabled={isPending || !comment.trim()}>
              <MessageSquare className="w-3 h-3 mr-1.5" /> Comentar
            </Button>
            <Button size="sm" onClick={() => onReview("approve")} disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="w-3 h-3 mr-1.5" /> Aprobar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onReview("reject")} disabled={isPending || !comment.trim()}>
              <XCircle className="w-3 h-3 mr-1.5" /> Rechazar
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <span className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
            STATUS_STYLE[status] ?? STATUS_STYLE.draft
          )}>
            {STATUS_LABEL[status] ?? status}
          </span>
          {status === "rejected" && (
            <button onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground underline">
              Archivar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Phase detail ─────────────────────────────────────────────────────────────

function PhaseDetail({ phase, onReviewed, onPromote, onDismiss }: {
  phase: LabPhase
  onReviewed: (action: string, comment: string) => void
  onPromote: () => void
  onDismiss: () => void
}) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const author = (phase.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  const tasks = [...(phase.tasks ?? [])].sort((a, b) => a.task_order - b.task_order) as LabPhaseTask[]
  const reviews = phase.reviews ?? []

  function handleReview(action: "comment" | "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      toast("Agrega un comentario al rechazar.", "error")
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
      <DetailHeader
        title={phase.name}
        subtitle={[
          `Por ${author}`,
          phase.source_phase_set?.project_type_name ?? phase.source_phase_set?.name,
          new Date(phase.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long" }),
        ].filter(Boolean).join(" · ")}
      />
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <LayoutList className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Sin tareas</p>
          </div>
        ) : (
          tasks.map((task, i) => <TaskPreviewRow key={task.id} task={task} index={i} />)
        )}
        {reviews.length > 0 && (
          <div className="px-5 py-3">
            <ReviewHistory reviews={reviews} />
          </div>
        )}
      </div>
      <ReviewActions
        status={phase.status}
        onReview={handleReview}
        onInject={phase.status === "approved" ? onPromote : undefined}
        onDismiss={onDismiss}
        isPending={isPending}
        comment={comment}
        setComment={setComment}
        injectLabel="Publicar en árbol canónico"
      />
    </>
  )
}

// ── Proposed task detail ─────────────────────────────────────────────────────

function ProposedTaskDetail({ task, canonicalTree, onReviewed, onInjected, onDismiss }: {
  task: LabProposedTask
  canonicalTree: CanonicalPhaseSet[]
  onReviewed: (action: string) => void
  onInjected: () => void
  onDismiss: () => void
}) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const author = (task.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  const isEdit = !!task.anchor_task_set_task_id

  let phaseSetName: string | null = null
  let anchorPhaseTasks: CanonicalTask[] = []
  let phaseName = (task.anchor_phase as { name?: string } | null)?.name ?? "Fase desconocida"
  for (const ps of canonicalTree) {
    const ph = ps.phases.find((p) => p.id === task.anchor_phase_set_phase_id)
    if (ph) { anchorPhaseTasks = ph.tasks; phaseName = ph.name; phaseSetName = ps.project_type_name ?? ps.name; break }
  }
  const anchorTasks = anchorPhaseTasks.map((t) => ({ id: t.id, title: t.title }))
  const originalTask = isEdit ? anchorPhaseTasks.find((t) => t.id === task.anchor_task_set_task_id) ?? null : null
  const afterIndex = task.position_after_task_id ? anchorTasks.findIndex((t) => t.id === task.position_after_task_id) : -1

  function handleReview(action: "comment" | "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      toast("Agrega un comentario al rechazar.", "error")
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
  const subtitleParts = [`Por ${author}`, phaseSetName ? `${phaseSetName} · ${phaseName}` : phaseName]
  if (isEdit) subtitleParts.push("Edición de tarea existente")

  return (
    <>
      <DetailHeader title={task.title} subtitle={subtitleParts.join(" · ")} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {task.description && !isEdit && (
          <p className="text-sm text-muted-foreground">{task.description}</p>
        )}
        {!isEdit && (
          <div className="flex flex-wrap gap-2">
            {task.default_position?.name && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                <UserCircle className="w-3 h-3" /> {task.default_position.name}
              </span>
            )}
            {task.requires_deliverable && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700">
                <Paperclip className="w-3 h-3" /> Requiere entregable
              </span>
            )}
            {task.sop?.title && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs text-primary">
                <BookOpen className="w-3 h-3" /> {task.sop.title}
              </span>
            )}
          </div>
        )}

        {anchorTasks.length > 0 && (
          <PositionedTaskContext
            anchorTasks={anchorTasks}
            afterIndex={afterIndex}
            isEdit={isEdit}
            editTaskId={task.anchor_task_set_task_id}
            proposedTitle={task.title}
          />
        )}
        {anchorTasks.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {task.position_after_task_id ? "Se insertará después de una tarea existente." : "Se insertará al final."}
          </p>
        )}

        {isEdit && originalTask && <TaskEditDiff original={originalTask} proposed={task} />}

        {!isEdit && items.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <ListChecks className="w-3.5 h-3.5" /> Checklist propuesto
            </p>
            <div className="rounded-lg border border-border divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className={cn("flex-1 min-w-0 truncate", item.is_blocking && "font-medium")}>{item.text}</span>
                  {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        )}
        <ReviewHistory reviews={task.reviews ?? []} />
      </div>
      <ReviewActions
        status={task.status}
        onReview={handleReview}
        onInject={task.status === "approved" ? handleInject : undefined}
        onDismiss={onDismiss}
        isPending={isPending}
        comment={comment}
        setComment={setComment}
        injectLabel="Publicar en árbol"
      />
    </>
  )
}

// ── Proposed checklist detail ────────────────────────────────────────────────

function ProposedChecklistDetail({ addition, canonicalTree, onReviewed, onInjected, onDismiss }: {
  addition: LabProposedChecklistAddition
  canonicalTree: CanonicalPhaseSet[]
  onReviewed: (action: string) => void
  onInjected: () => void
  onDismiss: () => void
}) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const author = (addition.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  const taskTitle = (addition.anchor_task as { title?: string } | null)?.title ?? "Tarea desconocida"
  const items = ((addition.items ?? []) as LabProposedChecklistItem[]).slice().sort((a, b) => a.item_order - b.item_order)

  let anchorItems: { id: string; text: string; is_blocking: boolean }[] = []
  let phaseName: string | null = null
  let phaseSetName: string | null = null
  for (const ps of canonicalTree) {
    for (const ph of ps.phases) {
      const t = ph.tasks.find((t) => t.id === addition.anchor_task_set_task_id)
      if (t) { anchorItems = t.checklist_items; phaseName = ph.name; phaseSetName = ps.project_type_name ?? ps.name; break }
    }
    if (phaseName) break
  }

  function handleReview(action: "comment" | "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      toast("Agrega un comentario al rechazar.", "error")
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

  const subtitle = phaseName ? `Por ${author} · ${phaseSetName ? `${phaseSetName} · ` : ""}${phaseName}` : `Checklist por ${author}`

  return (
    <>
      <DetailHeader title={taskTitle} subtitle={subtitle} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <ChecklistBeforeAfter anchorItems={anchorItems} proposedItems={items} />
        <ReviewHistory reviews={addition.reviews ?? []} />
      </div>
      <ReviewActions
        status={addition.status}
        onReview={handleReview}
        onInject={addition.status === "approved" ? handleInject : undefined}
        onDismiss={onDismiss}
        isPending={isPending}
        comment={comment}
        setComment={setComment}
        injectLabel="Agregar a checklist canónico"
      />
    </>
  )
}

// ── Proposed new phase detail ────────────────────────────────────────────────

function ProposedNewPhaseDetail({ phase, canonicalTree, onReviewed, onInjected, onDismiss }: {
  phase: LabProposedPhase
  canonicalTree: CanonicalPhaseSet[]
  onReviewed: (action: string) => void
  onInjected: () => void
  onDismiss: () => void
}) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const author = (phase.author as { full_name?: string } | null)?.full_name ?? "Empleado"

  const ps = canonicalTree.find((p) => p.id === phase.phase_set_id)
  const orderedPhases = ps ? [...ps.phases].sort((a, b) => a.phase_order - b.phase_order) : []
  const afterIndex = phase.position_after_phase_id
    ? orderedPhases.findIndex((p) => p.id === phase.position_after_phase_id)
    : -1
  const phaseSetLabel = ps ? (ps.project_type_name ?? ps.name) : (phase.phase_set?.name ?? "Tipo de proyecto desconocido")

  function handleReview(action: "comment" | "approve" | "reject") {
    if (action === "reject" && !comment.trim()) { toast("Agrega un comentario al rechazar.", "error"); return }
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
      <DetailHeader title={phase.name} subtitle={`Por ${author} · ${phaseSetLabel} · Nueva fase`} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {phase.description && <p className="text-sm text-muted-foreground">{phase.description}</p>}
        {ps ? (
          <PositionedPhaseContext orderedPhases={orderedPhases} afterIndex={afterIndex} proposedName={phase.name} />
        ) : (
          <p className="text-xs text-muted-foreground p-3 border border-border rounded-lg">Tipo de proyecto no encontrado.</p>
        )}
        <p className="text-xs text-muted-foreground">
          {phase.position_after_phase_id
            ? `Se insertará después de "${orderedPhases[afterIndex]?.name ?? "la fase seleccionada"}".`
            : "Se insertará al principio."}
        </p>
      </div>
      <ReviewActions
        status={phase.status}
        onReview={handleReview}
        onInject={phase.status === "approved" ? handleInject : undefined}
        onDismiss={onDismiss}
        isPending={isPending}
        comment={comment}
        setComment={setComment}
        injectLabel="Publicar en árbol canónico"
      />
    </>
  )
}

// ── Task preview row (read-only) ─────────────────────────────────────────────

function TaskPreviewRow({ task, index }: { task: LabPhaseTask; index: number }) {
  const checklistItems = task.checklist_items ?? []
  const sopName = (task.sop as { title?: string } | null)?.title ?? null
  const positionName = (task.default_position as { name?: string } | null)?.name ?? null

  return (
    <div className="border-b border-border hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-2 px-5 py-3">
        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>}
        </div>
        {positionName && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground flex-shrink-0">
            <UserCircle className="w-2.5 h-2.5" />{positionName}
          </span>
        )}
        {checklistItems.length > 0 && (
          <span className={cn(
            "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold flex-shrink-0",
            checklistItems.some((i) => i.is_blocking) ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-border bg-muted text-muted-foreground"
          )}>
            {checklistItems.some((i) => i.is_blocking) && <Lock className="w-2.5 h-2.5" />}
            {checklistItems.length}
          </span>
        )}
        {task.requires_deliverable && <Paperclip className="w-3.5 h-3.5 text-info flex-shrink-0" />}
        {sopName && (
          <span title={sopName} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary flex-shrink-0">
            <BookOpen className="w-3 h-3" />
            <span className="hidden sm:inline max-w-[80px] truncate">{sopName}</span>
          </span>
        )}
      </div>

      {checklistItems.length > 0 && (
        <div className="pl-12 pr-5 pb-3 -mt-1">
          <div className="rounded-lg border border-border/50 divide-y divide-border/30 bg-muted/10">
            {checklistItems.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
                <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>{item.text}</span>
                {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Phase Set card picker ────────────────────────────────────────────────────

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
      <DetailHeader title="Publicar en árbol canónico" subtitle={`Fase: ${phase.name}`} />
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={onCancel} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
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
                className={cn(
                  "text-left rounded-xl border p-4 transition-all shadow-sm",
                  isSelected
                    ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400 shadow-md"
                    : "border-border hover:border-primary/40 hover:bg-muted/50 hover:shadow-md"
                )}>
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
      <div className="border-t border-border px-5 py-4 bg-muted/10 flex-shrink-0 flex gap-2">
        <Button onClick={handleConfirm} disabled={isPending || !selectedId}
          className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {isPending ? "Publicando…" : "Confirmar publicación"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </>
  )
}
