"use client"

import { useState, useTransition } from "react"
import type { LabPhase, LabPhaseTask, PhaseSet } from "@/lib/types"
import { reviewPhase, promotePhase } from "@/lib/actions/lab"
import { CheckCircle2, XCircle, MessageSquare, ArrowUpRight } from "lucide-react"

interface Props {
  initialPhases: LabPhase[]
  phaseSets: PhaseSet[]
}

export function PhaseReviewPanel({ initialPhases, phaseSets }: Props) {
  const [phases, setPhases] = useState<LabPhase[]>(initialPhases)
  const [selectedId, setSelectedId] = useState<string | null>(phases[0]?.id ?? null)
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

  const pending   = phases.filter((p) => p.status === "submitted")
  const reviewed  = phases.filter((p) => p.status === "approved" || p.status === "rejected")

  if (phases.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Sin fases enviadas por el equipo aún.
      </div>
    )
  }

  const statusColor = (s: LabPhase["status"]) =>
    s === "approved" ? "text-emerald-600" : s === "rejected" ? "text-destructive" : "text-amber-600"
  const statusLabel = (s: LabPhase["status"]) =>
    s === "submitted" ? "Pendiente" : s === "approved" ? "Aprobada" : "Rechazada"

  function PhaseListItem({ p }: { p: LabPhase }) {
    const author = (p.author as { full_name?: string } | null)?.full_name ?? "Empleado"
    return (
      <button
        onClick={() => setSelectedId(p.id)}
        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${selectedId === p.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
      >
        <div className="truncate font-medium">{p.name}</div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{author}</span>
          <span className={`text-[10px] font-semibold flex-shrink-0 ${statusColor(p.status)}`}>
            {statusLabel(p.status)}
          </span>
        </div>
      </button>
    )
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* List */}
      <div className="w-56 flex-shrink-0 space-y-3">
        {pending.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Pendientes ({pending.length})
            </p>
            {pending.map((p) => <PhaseListItem key={p.id} p={p} />)}
          </div>
        )}
        {reviewed.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Revisadas
            </p>
            {reviewed.map((p) => <PhaseListItem key={p.id} p={p} />)}
          </div>
        )}
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Selecciona una fase.
          </div>
        ) : (
          <PhaseDetail
            phase={selected}
            phaseSets={phaseSets}
            onReviewed={(action, comment) => onReviewed(selected.id, action, comment)}
          />
        )}
      </div>
    </div>
  )
}

// ── Detail ────────────────────────────────────────────────────────────────────

function PhaseDetail({
  phase, phaseSets, onReviewed,
}: {
  phase: LabPhase
  phaseSets: PhaseSet[]
  onReviewed: (action: string, comment: string) => void
}) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()
  const [showPromote, setShowPromote] = useState(false)
  const [targetId, setTargetId] = useState("")

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

  function handlePromote() {
    if (!targetId) return
    startTransition(async () => {
      await promotePhase(phase.id, targetId)
      setShowPromote(false)
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{phase.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Por {author} · {new Date(phase.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
          </p>
          {phase.description && (
            <p className="text-sm text-muted-foreground mt-1">{phase.description}</p>
          )}
        </div>
        {phase.status === "approved" && (
          <button
            onClick={() => setShowPromote(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex-shrink-0"
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> Inyectar en Phase Set
          </button>
        )}
      </div>

      {/* Promote panel */}
      {showPromote && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <p className="text-sm font-medium text-emerald-900">¿A qué Phase Set agregar esta fase?</p>
          <p className="text-xs text-emerald-700">La fase se añadirá al final del Phase Set seleccionado.</p>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded border border-emerald-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Selecciona un Phase Set…</option>
            {phaseSets.map((ps) => (
              <option key={ps.id} value={ps.id}>{ps.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={handlePromote}
              disabled={isPending || !targetId}
              className="text-sm px-4 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Inyectando…" : "Confirmar"}
            </button>
            <button onClick={() => setShowPromote(false)} className="text-sm px-3 py-1.5 text-muted-foreground hover:text-foreground">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tareas ({tasks.length})
        </p>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin tareas.</p>
        ) : (
          <div className="rounded-lg border border-border p-3 space-y-0.5">
            {tasks.map((t) => (
              <p key={t.id} className="text-sm py-0.5 text-muted-foreground">· {t.title}</p>
            ))}
          </div>
        )}
      </div>

      {/* Review timeline */}
      {reviews.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Historial</p>
          {reviews.map((r) => (
            <div key={r.id} className={`flex gap-2.5 text-sm ${r.action === "approve" ? "text-emerald-700" : r.action === "reject" ? "text-destructive" : "text-foreground"}`}>
              {r.action === "approve" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
               r.action === "reject"  ? <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
               <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />}
              <div>
                <span className="font-medium">
                  {(r.reviewer as { full_name?: string } | null)?.full_name ?? "Admin"}
                </span>
                {r.comment && <span className="text-muted-foreground"> — {r.comment}</span>}
                <span className="text-xs text-muted-foreground ml-1">
                  {new Date(r.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review form — only if still pending */}
      {phase.status === "submitted" && (
        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agregar revisión</p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentario (obligatorio al rechazar)…"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleReview("comment")}
              disabled={isPending || !comment.trim()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <MessageSquare className="w-3 h-3" /> Comentar
            </button>
            <button
              onClick={() => handleReview("approve")}
              disabled={isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" /> Aprobar
            </button>
            <button
              onClick={() => handleReview("reject")}
              disabled={isPending || !comment.trim()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              <XCircle className="w-3 h-3" /> Rechazar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
