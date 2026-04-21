"use client"

import { useState, useTransition } from "react"
import { submitClientReview } from "@/lib/actions/client-review"
import type { ClientReviewStatus } from "@/lib/types"

interface ClientAsset {
  id: string
  format: string | null
  platform: string | null
  variant: string | null
  iteration: string | null
  hook: string | null
  copy: string | null
  cta: string | null
  asset_url: string | null
  client_status: ClientReviewStatus | null
  client_feedback: string | null
  format_meta: Record<string, unknown> | null
  concept_name: string | null
  concept_angle: string | null
}

export function ClientAssetReview({ asset }: { asset: ClientAsset }) {
  const [status, setStatus]           = useState<ClientReviewStatus | null>(asset.client_status)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback]       = useState("")
  const [isPending, startTransition]  = useTransition()

  const alreadyReviewed = status === "approved" || status === "changes_requested"

  function handleApprove() {
    startTransition(async () => {
      await submitClientReview(asset.id, "approved", null)
      setStatus("approved")
    })
  }

  function handleRequestChanges() {
    if (!showFeedback) { setShowFeedback(true); return }
    if (!feedback.trim()) return
    startTransition(async () => {
      await submitClientReview(asset.id, "changes_requested", feedback.trim())
      setStatus("changes_requested")
      setShowFeedback(false)
    })
  }

  const meta = asset.format_meta ?? {}
  const formatLabel = [asset.format, asset.platform].filter(Boolean).join(" · ")
  const variantLabel = [asset.variant, asset.iteration].filter(Boolean).join(" / ")

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">

      {/* Card header */}
      <div className="px-5 pt-5 pb-4 border-b bg-gradient-to-br from-white to-slate-50">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="space-y-0.5 min-w-0">
            {formatLabel && (
              <p className="text-sm font-semibold">{formatLabel}</p>
            )}
            {variantLabel && (
              <p className="text-xs text-muted-foreground">{variantLabel}</p>
            )}
          </div>
          {asset.asset_url && (
            <a
              href={asset.asset_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-700 font-medium border border-blue-200 rounded-full px-2.5 py-1 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              Ver asset →
            </a>
          )}
        </div>
        {(asset.concept_name || asset.concept_angle) && (
          <p className="text-xs text-muted-foreground">
            Concepto: {[asset.concept_name, asset.concept_angle].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {/* Copy */}
      <div className="px-5 py-4 space-y-3 flex-1">
        {asset.hook && (
          <CopyField label="Hook" value={asset.hook} emphasis />
        )}
        {asset.copy && (
          <CopyField label="Copy" value={asset.copy} />
        )}
        {asset.cta && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">CTA</p>
            <span className="inline-block text-xs font-medium border rounded-full px-3 py-1 bg-foreground text-background">
              {asset.cta}
            </span>
          </div>
        )}

        {/* Format-specific fields */}
        {typeof meta.vo_script === "string"          && <CopyField label="Guión (VO)"          value={meta.vo_script} />}
        {typeof meta.broll_notes === "string"        && <CopyField label="Escenas B-roll"       value={meta.broll_notes} />}
        {typeof meta.talent_brief === "string"       && <CopyField label="Brief del creator"    value={meta.talent_brief} />}
        {typeof meta.visual_description === "string" && <CopyField label="Dirección visual"     value={meta.visual_description} />}
        {typeof meta.slides_brief === "string"       && <CopyField label="Estructura de slides" value={meta.slides_brief} />}
      </div>

      {/* Action area */}
      <div className="px-5 pb-5 pt-1 border-t mt-2">
        {alreadyReviewed ? (
          <div className={`text-sm font-medium rounded-xl px-4 py-3 text-center ${
            status === "approved"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}>
            {status === "approved" ? "✅ Aprobado — gracias por tu confirmación" : "💬 Cambios enviados — te contactamos pronto"}
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            {showFeedback ? (
              <div className="space-y-2">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Describe los cambios que necesitas…"
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
        )}
      </div>
    </div>
  )
}

function CopyField({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm leading-relaxed ${emphasis ? "font-medium" : ""}`}>{value}</p>
    </div>
  )
}
