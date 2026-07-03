"use client"

import { useState, useTransition } from "react"
import { submitClientReview } from "@/lib/actions/client-review"
import type { ClientReviewStatus } from "@/lib/types"

interface ClientAsset {
  id: string
  format: string | null
  platform: string | null
  asset_url: string | null
  file_path: string | null
  thumbnail_path: string | null
  file_type: string | null
  client_status: ClientReviewStatus | null
  client_feedback: string | null
  concept_name: string | null
  concept_angle: string | null
}

function detectAssetType(url: string): "image" | "video" | "external" {
  try {
    const path = new URL(url).pathname.toLowerCase().split("?")[0]
    if (/\.(jpg|jpeg|png|webp|gif|avif|svg)$/.test(path)) return "image"
    if (/\.(mp4|mov|webm|m4v|ogg)$/.test(path))           return "video"
  } catch {
    // fall through
  }
  return "external"
}

export function ClientAssetReview({ asset }: { asset: ClientAsset }) {
  const [status, setStatus]             = useState<ClientReviewStatus | null>(asset.client_status)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback]         = useState("")
  const [isPending, startTransition]    = useTransition()

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

  const formatLabel = [asset.format, asset.platform].filter(Boolean).join(" · ")
  const mediaUrl = asset.file_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${asset.file_path}`
    : asset.asset_url
  const assetType = asset.file_type === "video" ? "video"
    : asset.file_type === "image" ? "image"
    : mediaUrl ? detectAssetType(mediaUrl) : null

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">

      {/* ── Card header ── */}
      <div className="px-5 sm:px-6 pt-5 pb-4 border-b bg-gradient-to-br from-white to-slate-50 flex items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          {formatLabel && <p className="text-sm font-semibold">{formatLabel}</p>}
          {(asset.concept_name || asset.concept_angle) && (
            <p className="text-xs text-muted-foreground pt-0.5">
              {[asset.concept_name, asset.concept_angle].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {mediaUrl && (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-700 font-medium border border-blue-200 rounded-full px-3 py-1.5 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            {assetType === "image" ? "Tamaño completo ↗" : assetType === "video" ? "Ver original ↗" : "Ver asset →"}
          </a>
        )}
      </div>

      {/* ── Media preview ── */}
      {mediaUrl && assetType === "image" && (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-slate-50 border-b overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt={formatLabel || "Asset preview"}
            className="w-full max-h-[420px] object-contain"
          />
        </a>
      )}

      {mediaUrl && assetType === "video" && (
        <div className="bg-black border-b flex justify-center">
          <video
            controls
            preload="metadata"
            className="max-w-full max-h-[420px]"
            style={{ display: "block" }}
          >
            <source src={mediaUrl} />
            Tu navegador no soporta reproducción de video.
          </video>
        </div>
      )}

      {/* ── Action bar ── */}
      <div className="px-5 sm:px-6 py-4 border-t bg-white">
        {alreadyReviewed ? (
          <div className={`text-sm font-medium rounded-xl px-4 py-3 text-center ${
            status === "approved"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}>
            {status === "approved"
              ? "✅ Aprobado — gracias por tu confirmación"
              : "💬 Cambios enviados — te contactamos pronto"}
            {status === "changes_requested" && asset.client_feedback && (
              <p className="text-xs mt-1.5 opacity-75 font-normal">&quot;{asset.client_feedback}&quot;</p>
            )}
          </div>
        ) : showFeedback ? (
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
    </div>
  )
}
