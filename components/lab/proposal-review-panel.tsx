"use client"

import { useState, useTransition } from "react"
import type { LabProposal, LabProposalPhase, LabProposalTask, PhaseSet } from "@/lib/types"
import { reviewProposal, promoteProposal } from "@/lib/actions/lab"
import { CheckCircle2, XCircle, MessageSquare, ChevronDown, ArrowUpRight } from "lucide-react"

interface Props {
  initialProposals: LabProposal[]
  phaseSets: PhaseSet[]
}

export function ProposalReviewPanel({ initialProposals, phaseSets }: Props) {
  const [proposals, setProposals] = useState<LabProposal[]>(initialProposals)
  const [selectedId, setSelectedId] = useState<string | null>(proposals[0]?.id ?? null)
  const selected = proposals.find((p) => p.id === selectedId) ?? null

  function onReviewed(id: string, action: string, comment: string) {
    setProposals((prev) => prev.map((p) => {
      if (p.id !== id) return p
      const newStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : p.status
      const newReview = { id: crypto.randomUUID(), proposal_id: id, reviewer_id: "", action: action as "comment" | "approve" | "reject", comment: comment || null, created_at: new Date().toISOString() }
      return { ...p, status: newStatus as typeof p.status, reviews: [...(p.reviews ?? []), newReview] }
    }))
  }

  function onPromoted(id: string) {
    setProposals((prev) => prev.map((p) => p.id === id ? { ...p, status: "approved" } : p))
  }

  if (proposals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Sin propuestas enviadas por el equipo aún.
      </div>
    )
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* List */}
      <div className="w-56 flex-shrink-0 space-y-1">
        {proposals.map((p) => {
          const author = (p.author as { full_name?: string } | null)?.full_name ?? "Empleado"
          const statusColor = p.status === "approved" ? "text-emerald-600" : p.status === "rejected" ? "text-destructive" : "text-amber-600"
          return (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${selectedId === p.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
            >
              <div className="truncate font-medium">{p.title}</div>
              <div className="flex items-center justify-between gap-1 mt-0.5">
                <span className="text-xs text-muted-foreground truncate">{author}</span>
                <span className={`text-[10px] font-semibold flex-shrink-0 ${statusColor}`}>
                  {p.status === "submitted" ? "Pendiente" : p.status === "approved" ? "Aprobada" : "Rechazada"}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Selecciona una propuesta.
          </div>
        ) : (
          <ProposalDetail
            proposal={selected}
            phaseSets={phaseSets}
            onReviewed={(action, comment) => onReviewed(selected.id, action, comment)}
            onPromoted={() => onPromoted(selected.id)}
          />
        )}
      </div>
    </div>
  )
}

// ── Detail ────────────────────────────────────────────────────────────────────

function ProposalDetail({
  proposal, phaseSets, onReviewed, onPromoted,
}: {
  proposal: LabProposal
  phaseSets: PhaseSet[]
  onReviewed: (action: string, comment: string) => void
  onPromoted: () => void
}) {
  const [comment, setComment] = useState("")
  const [isPending, startTransition] = useTransition()
  const [showPromote, setShowPromote] = useState(false)
  const [promoteMode, setPromoteMode] = useState<"new" | "replace">("new")
  const [targetId, setTargetId] = useState<string>("")

  const author = (proposal.author as { full_name?: string } | null)?.full_name ?? "Empleado"
  const reviews = [...(proposal.reviews ?? [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  function handleReview(action: "comment" | "approve" | "reject") {
    if (action !== "comment" && !comment.trim() && action === "reject") {
      alert("Por favor agrega un comentario al rechazar.")
      return
    }
    startTransition(async () => {
      await reviewProposal(proposal.id, action, comment)
      onReviewed(action, comment)
      setComment("")
    })
  }

  function handlePromote() {
    startTransition(async () => {
      await promoteProposal(proposal.id, promoteMode, promoteMode === "replace" ? targetId : undefined)
      onPromoted()
      setShowPromote(false)
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{proposal.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Por {author} · {new Date(proposal.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
          </p>
          {proposal.description && (
            <p className="text-sm text-muted-foreground mt-1">{proposal.description}</p>
          )}
        </div>
        {proposal.status === "approved" && (
          <button
            onClick={() => setShowPromote(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> Promover a Operations Lab
          </button>
        )}
      </div>

      {/* Promote modal */}
      {showPromote && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <p className="text-sm font-medium text-emerald-900">¿Cómo promover esta propuesta?</p>
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="radio" checked={promoteMode === "new"} onChange={() => setPromoteMode("new")} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-900">Crear como nuevo template</p>
                <p className="text-xs text-emerald-700">Genera un Phase Set nuevo sin tocar los existentes.</p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="radio" checked={promoteMode === "replace"} onChange={() => setPromoteMode("replace")} className="mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-900">Reemplazar uno existente</p>
                <p className="text-xs text-emerald-700 mb-1.5">⚠ Elimina el template seleccionado.</p>
                {promoteMode === "replace" && (
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
                )}
              </div>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePromote}
              disabled={isPending || (promoteMode === "replace" && !targetId)}
              className="text-sm px-4 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Promoviendo…" : "Confirmar"}
            </button>
            <button onClick={() => setShowPromote(false)} className="text-sm px-3 py-1.5 text-muted-foreground hover:text-foreground">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Content preview */}
      <div className="space-y-2">
        {(proposal.phases ?? []).map((phase) => (
          <PhasePreview key={phase.id} phase={phase} />
        ))}
        {(proposal.loose_tasks ?? []).length > 0 && (
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Tareas sin fase</p>
            {(proposal.loose_tasks ?? []).map((t) => (
              <p key={t.id} className="text-sm py-0.5">· {t.title}</p>
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

      {/* Review form */}
      {proposal.status !== "approved" && (
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

function PhasePreview({ phase }: { phase: LabProposalPhase }) {
  const [open, setOpen] = useState(true)
  const tasks = (phase.tasks ?? []) as LabProposalTask[]
  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="text-sm font-medium flex-1">{phase.name}</span>
        <span className="text-xs text-muted-foreground">{tasks.length} tareas</span>
      </button>
      {open && tasks.length > 0 && (
        <div className="px-3 pb-2 space-y-0.5 border-t border-border/50">
          {tasks.map((t) => (
            <p key={t.id} className="text-sm py-1 text-muted-foreground">· {t.title}</p>
          ))}
        </div>
      )}
    </div>
  )
}
