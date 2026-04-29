"use client"

import { useState, useRef, useEffect } from "react"
import type { MetaAdResult, AdBoard } from "@/lib/types"
import { Wand2, Bookmark, Check, Loader2, ExternalLink, Play } from "lucide-react"

interface Props {
  ad: MetaAdResult
  boards: AdBoard[]
  savingId: string | null
  onSaveToBoard: (ad: MetaAdResult, boardId: string) => Promise<void>
  onOpenDetail: (ad: MetaAdResult) => void
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

function daysAgo(ts: number | null): string {
  if (!ts) return "—"
  const diff = Math.floor((Date.now() / 1000 - ts) / 86400)
  if (diff === 0) return "hoy"
  if (diff === 1) return "ayer"
  if (diff < 30)  return `${diff}d`
  if (diff < 365) return `${Math.floor(diff / 30)}m`
  return `${Math.floor(diff / 365)}a`
}

function platformLabel(p: string) {
  const map: Record<string, string> = {
    FACEBOOK: "FB", INSTAGRAM: "IG", MESSENGER: "MS", AUDIENCE_NETWORK: "AN",
  }
  return map[p.toUpperCase()] ?? p.slice(0, 2).toUpperCase()
}

/** Resolve the best available thumbnail and video URL from the Apify snapshot.
 *  Apify returns media in three possible shapes:
 *    1. snapshot.cards[]  — carousel / single card ads
 *    2. snapshot.videos[] — video-only ads (no cards)
 *    3. snapshot.images[] — image-only ads (no cards)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveMedia(snapshot: any) {
  const card      = snapshot?.cards?.[0]
  const videoItem = snapshot?.videos?.[0]
  const imageItem = snapshot?.images?.[0]

  const videoUrl = card?.video_hd_url  || card?.video_sd_url
    || videoItem?.video_hd_url || videoItem?.video_sd_url
    || null

  const thumbUrl = card?.video_preview_image_url
    || videoItem?.video_preview_image_url
    || card?.resized_image_url
    || card?.original_image_url
    || imageItem?.resized_image_url
    || imageItem?.original_image_url
    || null

  return { videoUrl, thumbUrl }
}

export function AdCard({ ad, boards, savingId, onSaveToBoard, onOpenDetail }: Props) {
  const [showBoardPicker, setShowBoardPicker] = useState(false)
  const [savedBoards, setSavedBoards]         = useState<Set<string>>(new Set())
  const pickerRef = useRef<HTMLDivElement>(null)
  const isSaving  = savingId === ad.ad_archive_id
  const color     = brandColor(ad.page_name)
  const initials  = ad.page_name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)

  const body = ad.snapshot?.body?.text || ad.snapshot?.cards?.[0]?.body || null
  const { videoUrl, thumbUrl } = resolveMedia(ad.snapshot)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowBoardPicker(false)
      }
    }
    if (showBoardPicker) document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [showBoardPicker])

  async function handleSave(boardId: string) {
    await onSaveToBoard(ad, boardId)
    setSavedBoards((prev) => new Set([...prev, boardId]))
    setShowBoardPicker(false)
  }

  return (
    <div className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-150">

      {/* ── Thumbnail ── */}
      <div
        className="relative aspect-[4/5] bg-muted overflow-hidden cursor-pointer"
        onClick={() => onOpenDetail(ad)}
      >
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={ad.page_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            <div className={`absolute inset-0 ${color} opacity-10`} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl font-black opacity-20 select-none">{initials}</span>
            </div>
          </>
        )}

        {/* Hover dim */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors z-10 pointer-events-none" />

        {/* Play indicator for video ads */}
        {videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center group-hover:bg-black/70 transition-colors">
              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            </div>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2 left-2 z-20">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/90 ${
            ad.is_active ? "text-emerald-700" : "text-slate-500"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${ad.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
            {ad.is_active ? "Activo" : "Inactivo"}
          </span>
        </div>

        {/* Platform badges */}
        {(ad.publisher_platform ?? []).length > 0 && (
          <div className="absolute bottom-2 right-2 z-20 flex gap-1">
            {ad.publisher_platform.map((p) => (
              <span key={p} className="w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-[8px] font-bold">
                {platformLabel(p)}
              </span>
            ))}
          </div>
        )}

        {/* Clone FAB */}
        <button
          className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 -translate-y-1 group-hover:translate-y-0 transition-all duration-140 pointer-events-none group-hover:pointer-events-auto"
          title="Clonar anuncio (próximamente)"
          onClick={(e) => e.stopPropagation()}
        >
          <Wand2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="p-3">
        {/* Brand row */}
        <div className="flex items-center gap-2 mb-2">
          {ad.snapshot?.page_profile_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ad.snapshot.page_profile_picture_url}
              alt={ad.page_name}
              className="w-6 h-6 rounded-md object-cover flex-shrink-0"
            />
          ) : (
            <div className={`w-6 h-6 rounded-md ${color} flex items-center justify-center flex-shrink-0`}>
              <span className="text-[9px] font-bold text-white">{initials}</span>
            </div>
          )}
          <p className="text-xs font-semibold truncate flex-1">{ad.page_name}</p>
          <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
            {daysAgo(ad.start_date)}
          </span>
        </div>

        {/* Ad copy */}
        {body && body !== "{{product.brand}}" && (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 mb-3">
            {body}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 pt-2.5 mt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-mono">
              {ad.impressions_with_index?.impressions_text ?? "—"}
            </span>
            {ad.ad_library_url && (
              <a
                href={ad.ad_library_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Ver en Meta Ad Library"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Save to board */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowBoardPicker((v) => !v) }}
              disabled={isSaving}
              className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                savedBoards.size > 0
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {isSaving
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Bookmark className={`w-3 h-3 ${savedBoards.size > 0 ? "fill-primary" : ""}`} />
              }
              {savedBoards.size > 0 ? "Guardado" : "Guardar"}
            </button>

            {showBoardPicker && (
              <div className="absolute bottom-full right-0 mb-1 w-52 bg-popover border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-semibold">Guardar en board</p>
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
                          onClick={() => handleSave(board.id)}
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
        </div>
      </div>
    </div>
  )
}
