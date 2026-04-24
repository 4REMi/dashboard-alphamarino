"use client"

import { useState, useTransition } from "react"
import type { LabPhase, LabPhaseTask, PhaseSet, PhaseSetPhase } from "@/lib/types"
import { reviewPhase, promotePhase } from "@/lib/actions/lab"
import {
  CheckCircle2, XCircle, MessageSquare, ArrowUpRight,
  ChevronLeft, ChevronRight, LayoutList, Link2, Lock, Paperclip, BookOpen,
} from "lucide-react"
import { PanelHeader, EmptyPanel } from "@/components/lab/shared"
import { cn } from "@/lib/utils"

interface Props {
  initialPhases: LabPhase[]
  phaseSets: PhaseSet[]
}

const STATUS_LABEL: Record<LabPhase["status"], string> = {
  draft: "Borrador", submitted: "Pendiente", approved: "Aprobada", rejected: "Rechazada",
}
const STATUS_COLOR: Record<LabPhase["status"], string> = {
  draft: "text-muted-foreground", submitted: "text-amber-600",
  approved: "text-emerald-600", rejected: "text-destructive",
}

export function PhaseReviewPanel({ initialPhases, phaseSets }: Props) {
  const [phases, setPhases] = useState<LabPhase[]>(initialPhases)
  const [selectedId, setSelectedId] = useState<string | null>(phases[0]?.id ?? null)
  const [showPromote, setShowPromote] = useState(false)
  const selected = phases.find((p) => p.id === selectedId) ?? null

  function onReviewed(id: string, action: string, comment: string) {
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

  if (phases.length === 0) {
    return (
      <div
        className="flex border border-border rounded-xl overflow-hidden bg-card items-center justify-center"
        style={{ height: "calc(100vh - 220px)", minHeight: 480 }}
      >
        <EmptyPanel icon={LayoutList} text="Sin fases enviadas por el equipo aún." />
      </div>
    )
  }

  const pending  = phases.filter((p) => p.status === "submitted")
  const reviewed = phases.filter((p) => p.status === "approved" || p.status === "rejected")

  return (
    <>
      <div
        className="flex border border-border rounded-xl overflow-hidden bg-card"
        style={{ height: "calc(100vh - 220px)", minHeight: 480 }}
      >
        {/* ── PANEL 1: Phase list ─────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-border">
          <PanelHeader
            title="Fases del equipo"
            subtitle={`${pending.length} pendiente${pending.length !== 1 ? "s" : ""}`}
          />
          <div className="flex-1 overflow-y-auto">
            {pending.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pendientes</p>
                </div>
                {pending.map((p) => <PhaseListRow key={p.id} phase={p} isSelected={selectedId === p.id} onSelect={() => { setSelectedId(p.id); setShowPromote(false) }} />)}
              </>
            )}
            {reviewed.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Revisadas</p>
                </div>
                {reviewed.map((p) => <PhaseListRow key={p.id} phase={p} isSelected={selectedId === p.id} onSelect={() => { setSelectedId(p.id); setShowPromote(false) }} />)}
              </>
            )}
          </div>
        </div>

        {/* ── PANEL 2: Detail / Promote ───────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <>
              <PanelHeader title="Detalle" subtitle="Selecciona una fase" />
              <EmptyPanel icon={Link2} text="Selecciona una fase para revisarla" />
            </>
          ) : showPromote ? (
            <PhaseSetPicker
              phaseSets={phaseSets}
              phase={selected}
              onPromoted={() => { setShowPromote(false) }}
              onCancel={() => setShowPromote(false)}
            />
          ) : (
            <PhaseDetail
              phase={selected}
              onReviewed={(action, comment) => onReviewed(selected.id, action, comment)}
              onPromote={() => setShowPromote(true)}
            />
          )}
        </div>
      </div>
    </>
  )
}

// ── Phase list row ────────────────────────────────────────────────────────────

function PhaseListRow({ phase, isSelected, onSelect }: { phase: LabPhase; isSelected: boolean; onSelect: () => void }) {
  const author = (phase.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}
    >
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

// ── Phase detail ──────────────────────────────────────────────────────────────

function PhaseDetail({
  phase, onReviewed, onPromote,
}: {
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
        {/* Tasks read-only list */}
        {tasks.length === 0 ? (
          <EmptyPanel icon={LayoutList} text="Sin tareas" />
        ) : (
          tasks.map((task, i) => <TaskPreviewRow key={task.id} task={task} index={i} />)
        )}

        {/* Review history */}
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

      {/* Footer: review form or promote */}
      <div className="border-t border-border px-4 py-3 bg-muted/10 flex-shrink-0 space-y-2">
        {phase.status === "approved" ? (
          <button
            onClick={onPromote}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> Inyectar en Phase Set
          </button>
        ) : phase.status === "submitted" ? (
          <>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentario (obligatorio al rechazar)…"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => handleReview("comment")} disabled={isPending || !comment.trim()} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                <MessageSquare className="w-3 h-3" /> Comentar
              </button>
              <button onClick={() => handleReview("approve")} disabled={isPending} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 className="w-3 h-3" /> Aprobar
              </button>
              <button onClick={() => handleReview("reject")} disabled={isPending || !comment.trim()} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
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

function PhaseSetPicker({
  phaseSets, phase, onPromoted, onCancel,
}: {
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
      <PanelHeader
        title="Inyectar en Phase Set"
        subtitle={`Fase: ${phase.name}`}
      />
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
              <button
                key={ps.id}
                onClick={() => setSelectedId(ps.id)}
                className={`text-left rounded-xl border p-3 transition-all ${isSelected ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400" : "border-border hover:border-primary/40 hover:bg-muted/50"}`}
              >
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
              No hay Phase Sets en Operations Lab aún.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-3 bg-muted/10 flex-shrink-0 flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={isPending || !selectedId}
          className="text-sm px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Inyectando…" : "Confirmar inyección"}
        </button>
        <button onClick={onCancel} className="text-sm px-3 py-2 text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </>
  )
}
