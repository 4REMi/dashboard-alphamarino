"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import type { SopRequest } from "@/lib/types"
import { fulfillSopRequest, dismissSopRequest } from "@/lib/actions/sops"
import { BookOpen, CheckCircle2, X, Clock } from "lucide-react"

interface Props {
  requests: SopRequest[]
  isAdmin: boolean
}

export function SopRequestInbox({ requests: initial, isAdmin }: Props) {
  const [requests, setRequests] = useState<SopRequest[]>(initial)
  const [isPending, startTransition] = useTransition()

  const pending   = requests.filter((r) => r.status === "pending")
  const fulfilled = requests.filter((r) => r.status === "fulfilled")

  function handleDismiss(id: string) {
    if (!confirm("¿Descartar esta solicitud?")) return
    startTransition(async () => {
      await dismissSopRequest(id)
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "dismissed" } : r))
    })
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Sin solicitudes de SOP pendientes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Pendientes ({pending.length})
          </h3>
          {pending.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              isPending={isPending}
              onDismiss={isAdmin ? () => handleDismiss(req.id) : undefined}
            />
          ))}
        </div>
      )}

      {fulfilled.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Completadas ({fulfilled.length})
          </h3>
          {fulfilled.map((req) => (
            <RequestCard key={req.id} req={req} isPending={false} completed />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestCard({
  req,
  isPending,
  onDismiss,
  completed = false,
}: {
  req: SopRequest
  isPending: boolean
  onDismiss?: () => void
  completed?: boolean
}) {
  const taskTitle = (req.task as { title?: string } | null)?.title
    ?? (req.task_set_task as { title?: string } | null)?.title
    ?? null
  const requesterName = (req.requester as { full_name?: string } | null)?.full_name ?? "Admin"

  return (
    <div className={`rounded-xl border bg-card px-4 py-3 flex items-start gap-3 ${completed ? "opacity-60" : ""}`}>
      <div className={`mt-0.5 flex-shrink-0 ${completed ? "text-success" : "text-amber-500"}`}>
        {completed ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0">
        {taskTitle && (
          <p className="text-xs text-muted-foreground mb-0.5">
            Tarea: <span className="font-medium text-foreground">{taskTitle}</span>
          </p>
        )}
        {req.note && (
          <p className="text-sm text-foreground">{req.note}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Solicitado por {requesterName} · {new Date(req.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
        </p>
      </div>

      {!completed && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/sops/new${req.task_set_task_id ? `?task_set_task_id=${req.task_set_task_id}` : ""}${req.task_id ? `?task_id=${req.task_id}` : ""}${req.id ? `&request_id=${req.id}` : ""}`}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Crear SOP
          </Link>
          {onDismiss && (
            <button
              onClick={onDismiss}
              disabled={isPending}
              className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
