"use client"

import { useState, useTransition } from "react"
import { submitBriefClientReview } from "@/lib/actions/client-review"
import type { AdCloneLine, ClientReviewStatus } from "@/lib/types"

interface ClientScript {
  briefId:         string
  lines:           AdCloneLine[]
  client_status:   ClientReviewStatus | null
  client_feedback: string | null
}

export function ClientScriptReview({ script }: { script: ClientScript }) {
  const [status, setStatus]             = useState<ClientReviewStatus | null>(script.client_status)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback]         = useState("")
  const [isPending, startTransition]    = useTransition()

  const alreadyReviewed = status === "approved" || status === "changes_requested"

  function handleApprove() {
    startTransition(async () => {
      await submitBriefClientReview(script.briefId, "approved", null)
      setStatus("approved")
    })
  }

  function handleRequestChanges() {
    if (!showFeedback) { setShowFeedback(true); return }
    if (!feedback.trim()) return
    startTransition(async () => {
      await submitBriefClientReview(script.briefId, "changes_requested", feedback.trim())
      setStatus("changes_requested")
      setShowFeedback(false)
    })
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
      {/* ── Header ── */}
      <div className="px-5 sm:px-6 pt-5 pb-4 border-b bg-gradient-to-br from-white to-slate-50">
        <p className="text-sm font-semibold text-slate-900">Guión adaptado</p>
        <p className="text-xs text-muted-foreground pt-0.5">Revisa las líneas y aprueba o pide cambios antes de producción.</p>
      </div>

      {/* ── Script lines ── */}
      <div className="divide-y">
        {script.lines.map((line, i) => (
          <div key={i} className="px-5 sm:px-6 py-3 flex gap-3">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">
              {i + 1}
            </span>
            <div className="min-w-0">
              {line.speaker && (
                <span className="text-[10px] font-bold text-primary mr-1.5">[{line.speaker}]</span>
              )}
              <span className="text-sm text-slate-800 leading-relaxed">{line.adapted}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Action bar ── */}
      <div className="px-5 sm:px-6 py-4 border-t bg-white">
        {alreadyReviewed ? (
          <div className={`text-sm font-medium rounded-xl px-4 py-3 text-center ${
            status === "approved"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}>
            {status === "approved"
              ? "✅ Guión aprobado — gracias por tu confirmación"
              : "💬 Cambios enviados — te contactamos pronto"}
            {status === "changes_requested" && script.client_feedback && (
              <p className="text-xs mt-1.5 opacity-75 font-normal">&quot;{script.client_feedback}&quot;</p>
            )}
          </div>
        ) : showFeedback ? (
          <div className="space-y-2">
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe los cambios que necesitas en el guión…"
              rows={3}
              className="w-full text-sm border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowFeedback(false)}
                className="flex-1 text-sm border rounded-xl py-2.5 text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRequestChanges}
                disabled={isPending || !feedback.trim()}
                className="flex-1 text-sm bg-amber-500 text-white rounded-xl py-2.5 font-medium hover:bg-amber-600 disabled:opacity-40 transition-colors"
              >
                {isPending ? "Enviando…" : "Enviar cambios"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleRequestChanges}
              disabled={isPending}
              className="flex-1 text-sm border rounded-xl py-2.5 text-muted-foreground hover:bg-muted transition-colors"
            >
              💬 Pedir cambios
            </button>
            <button
              onClick={handleApprove}
              disabled={isPending}
              className="flex-1 text-sm bg-emerald-500 text-white rounded-xl py-2.5 font-medium hover:bg-emerald-600 disabled:opacity-40 transition-colors"
            >
              ✅ Aprobar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
