"use client"

import { useEffect, useState } from "react"
import type { MetaAdResult, AdBoard } from "@/lib/types"
import { saveAd, addAdToBoard } from "@/lib/actions/ad-lab"
import {
  X, ExternalLink, Bookmark, Check, Loader2,
  Calendar, Globe, Wand2, ChevronLeft, ChevronRight,
} from "lucide-react"

interface Props {
  ad: MetaAdResult | null
  boards: AdBoard[]
  onClose: () => void
}

function platformLabel(p: string) {
  const map: Record<string, string> = {
    FACEBOOK: "Facebook", INSTAGRAM: "Instagram", MESSENGER: "Messenger", AUDIENCE_NETWORK: "Audience Network",
  }
  return map[p.toUpperCase()] ?? p
}

function fmtDate(ts: number | null) {
  if (!ts) return "—"
  return new Date(ts * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

function fmtSpend(spend: { lower_bound: number; upper_bound: number } | null, currency: string | null) {
  if (!spend) return "—"
  const fmt = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: currency ?? "MXN", maximumFractionDigits: 0 })
  if (spend.lower_bound === spend.upper_bound) return fmt(spend.lower_bound)
  return `${fmt(spend.lower_bound)} – ${fmt(spend.upper_bound)}`
}

function brandColor(name: string): string {
  const colors = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export function AdDetailModal({ ad, boards, onClose }: Props) {
  const [cardIndex, setCardIndex] = useState(0)
  const [showBoardPicker, setShowBoardPicker] = useState(false)
  const [savedBoards, setSavedBoards] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  // Reset card index when ad changes
  useEffect(() => { setCardIndex(0); setSavedBoards(new Set()) }, [ad?.ad_archive_id])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  if (!ad) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap    = ad.snapshot as any
  const cards   = snap?.cards ?? []
  const card    = cards[cardIndex] ?? null

  // Also read from snapshot.videos[] for video-only ads (no cards)
  const videoItem = snap?.videos?.[0]
  const imageItem = snap?.images?.[0]

  const body    = snap?.body?.text || card?.body || null

  const videoUrl = card?.video_hd_url || card?.video_sd_url
    || videoItem?.video_hd_url || videoItem?.video_sd_url || null

  const thumbUrl = card?.video_preview_image_url
    || videoItem?.video_preview_image_url
    || card?.resized_image_url
    || card?.original_image_url
    || imageItem?.resized_image_url
    || imageItem?.original_image_url
    || null

  const color   = brandColor(ad.page_name)
  const initials = ad.page_name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)

  async function handleSaveToBoard(boardId: string) {
    if (!ad) return
    setSaving(true)
    try {
      const toDate = (ts: number | null) => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null
      const imageUrl = thumbUrl
      const savedVideoUrl = videoUrl

      const saved = await saveAd({
        ad_archive_id:     ad.ad_archive_id,
        page_id:           ad.page_id,
        page_name:         ad.page_name,
        body:              body,
        image_url:         imageUrl,
        video_url:         savedVideoUrl,
        snapshot_url:      ad.ad_library_url ?? null,
        start_date:        toDate(ad.start_date),
        end_date:          toDate(ad.end_date),
        status:            ad.is_active ? "active" : "inactive",
        platforms:         (ad.publisher_platform ?? []).map((p) => p.toLowerCase()),
        spend_lower:       ad.spend?.lower_bound ?? null,
        spend_upper:       ad.spend?.upper_bound ?? null,
        impressions_lower: null,
        impressions_upper: null,
        currency:          ad.currency || "MXN",
      })
      await addAdToBoard(boardId, saved.id)
      setSavedBoards((prev) => new Set([...prev, boardId]))
      setShowBoardPicker(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left: visual ── */}
        <div className="relative md:w-[45%] flex-shrink-0 bg-black min-h-64 md:min-h-0 flex items-center justify-center">
          {videoUrl ? (
            <video
              src={videoUrl}
              poster={thumbUrl ?? undefined}
              controls
              className="w-full h-full object-contain max-h-[70vh]"
            />
          ) : thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt={ad.page_name} className="w-full h-full object-contain" />
          ) : (
            <>
              <div className={`absolute inset-0 ${color} opacity-10`} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl font-black opacity-20 select-none">{initials}</span>
              </div>
            </>
          )}

          {/* Status badge */}
          <div className="absolute top-3 left-3">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/90 ${
              ad.is_active ? "text-emerald-700" : "text-slate-500"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ad.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
              {ad.is_active ? "Activo" : "Inactivo"}
            </span>
          </div>

          {/* Multi-card nav */}
          {cards.length > 1 && (
            <>
              <button
                onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
                disabled={cardIndex === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/70 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCardIndex((i) => Math.min(cards.length - 1, i + 1))}
                disabled={cardIndex === cards.length - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center disabled:opacity-30 hover:bg-black/70 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                {(cards as unknown[]).map((_: unknown, i: number) => (
                  <button
                    key={i}
                    onClick={() => setCardIndex(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === cardIndex ? "bg-white" : "bg-white/40"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Right: detail ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {ad.snapshot?.page_profile_picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ad.snapshot.page_profile_picture_url}
                  alt={ad.page_name}
                  className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-xs font-bold text-white">{initials}</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{ad.page_name}</p>
                {ad.snapshot?.page_like_count != null && (
                  <p className="text-xs text-muted-foreground">
                    {ad.snapshot.page_like_count.toLocaleString("es-MX")} seguidores
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="ml-3 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Ad copy */}
            {body && body !== "{{product.brand}}" && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Copy</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
              </div>
            )}

            {/* Card title / CTA */}
            {(card?.title || card?.cta_text) && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/60">
                {card?.title && <p className="text-xs font-semibold truncate">{card.title}</p>}
                {card?.cta_text && (
                  <span className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                    {card.cta_text}
                  </span>
                )}
              </div>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-3">
              <MetaItem label="Inicio" icon={Calendar}>
                {fmtDate(ad.start_date)}
              </MetaItem>
              <MetaItem label="Fin" icon={Calendar}>
                {ad.end_date ? fmtDate(ad.end_date) : "En curso"}
              </MetaItem>
              <MetaItem label="Plataformas" icon={Globe}>
                {(ad.publisher_platform ?? []).map(platformLabel).join(", ") || "—"}
              </MetaItem>
              <MetaItem label="Impresiones" icon={Globe}>
                {ad.impressions_with_index?.impressions_text ?? "—"}
              </MetaItem>
              {ad.spend && (
                <MetaItem label="Inversión estimada" icon={Globe} className="col-span-2">
                  {fmtSpend(ad.spend, ad.currency)}
                </MetaItem>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex-shrink-0 border-t border-border p-4 flex items-center gap-2">
            {/* Save to board */}
            <div className="relative flex-1">
              <button
                onClick={() => setShowBoardPicker((v) => !v)}
                disabled={saving}
                className={`w-full h-9 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  savedBoards.size > 0
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Bookmark className={`w-4 h-4 ${savedBoards.size > 0 ? "fill-primary" : ""}`} />
                }
                {savedBoards.size > 0 ? "Guardado" : "Guardar en board"}
              </button>

              {showBoardPicker && (
                <div className="absolute bottom-full left-0 mb-2 w-full bg-popover border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-semibold">Selecciona un board</p>
                  </div>
                  {boards.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">
                      No tienes boards.{" "}
                      <a href="/ad-lab/boards" className="text-primary underline">Crear uno →</a>
                    </div>
                  ) : (
                    <div className="py-1 max-h-48 overflow-y-auto">
                      {boards.map((board) => {
                        const saved = savedBoards.has(board.id)
                        return (
                          <button
                            key={board.id}
                            onClick={() => handleSaveToBoard(board.id)}
                            disabled={saved}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors disabled:opacity-60 text-left"
                          >
                            <div className="w-5 h-5 rounded bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground flex-shrink-0">
                              {board.name[0].toUpperCase()}
                            </div>
                            <span className="flex-1 truncate">{board.name}</span>
                            {saved && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                            <span className="text-[10px] text-muted-foreground">{board.ad_count ?? 0}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clone (placeholder) */}
            <button
              title="Clonar anuncio (próximamente)"
              className="h-9 px-4 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-2 transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              Clonar
            </button>

            {/* View in Ad Library */}
            {ad.ad_library_url && (
              <a
                href={ad.ad_library_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 w-9 flex-shrink-0 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Ver en Meta Ad Library"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaItem({
  label,
  children,
  className = "",
}: {
  label: string
  icon: React.ElementType
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl bg-muted/50 p-3 ${className}`}>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xs font-medium">{children}</p>
    </div>
  )
}
