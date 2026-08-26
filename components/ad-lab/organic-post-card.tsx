"use client"

import { useState, useRef, useEffect } from "react"
import type { InstagramPostResult, AdBoard } from "@/lib/types"
import { Bookmark, Check, Loader2, ExternalLink, Play, Heart, MessageCircle, Layers } from "lucide-react"

interface Props {
  post: InstagramPostResult
  boards: AdBoard[]
  savingId: string | null
  onSaveToBoard: (post: InstagramPostResult, boardId: string) => Promise<void>
  onOpenDetail: (post: InstagramPostResult) => void
}

function daysAgo(iso: string | null | undefined): string {
  if (!iso) return "—"
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diff <= 0) return "hoy"
  if (diff === 1) return "ayer"
  if (diff < 30)  return `${diff}d`
  if (diff < 365) return `${Math.floor(diff / 30)}m`
  return `${Math.floor(diff / 365)}a`
}

function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function OrganicPostCard({ post, boards, savingId, onSaveToBoard, onOpenDetail }: Props) {
  const [showBoardPicker, setShowBoardPicker] = useState(false)
  const [savedBoards, setSavedBoards]         = useState<Set<string>>(new Set())
  const pickerRef = useRef<HTMLDivElement>(null)
  const isSaving  = savingId === post.shortCode
  const isCarousel = post.type === "Sidecar" && (post.images?.length ?? 0) > 1
  const isVideo    = post.type === "Video" && !!post.videoUrl
  const thumbUrl   = post.images?.[0] ?? post.displayUrl ?? null

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowBoardPicker(false)
    }
    if (showBoardPicker) document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [showBoardPicker])

  async function handleSave(boardId: string) {
    try {
      await onSaveToBoard(post, boardId)
      setSavedBoards((prev) => new Set([...prev, boardId]))
      setShowBoardPicker(false)
    } catch {
      // error is surfaced by the parent (discovery-shell) — keep the
      // picker open so the user can retry without re-searching.
    }
  }

  return (
    <div className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-150">
      <div
        className="relative aspect-[4/5] bg-muted overflow-hidden cursor-pointer"
        onClick={() => onOpenDetail(post)}
      >
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt={post.ownerUsername ?? ""} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
            <Layers className="w-8 h-8" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors z-10 pointer-events-none" />

        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center group-hover:bg-black/70 transition-colors">
              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            </div>
          </div>
        )}

        {isCarousel && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-white/90 text-[10px] font-semibold px-2 py-0.5 rounded-full text-slate-700">
            <Layers className="w-2.5 h-2.5" />
            {post.images?.length}
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold truncate flex-1">@{post.ownerUsername ?? "—"}</p>
          <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{daysAgo(post.timestamp)}</span>
        </div>

        {post.caption && (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 mb-3">{post.caption}</p>
        )}

        <div className="flex items-center justify-between border-t border-border/50 pt-2.5 mt-1">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
              <Heart className="w-3 h-3" /> {formatCount(post.likesCount)}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
              <MessageCircle className="w-3 h-3" /> {formatCount(post.commentsCount)}
            </span>
            {post.url && (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Ver en Instagram"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="relative" ref={pickerRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowBoardPicker((v) => !v) }}
              disabled={isSaving}
              className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
                savedBoards.size > 0 ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bookmark className={`w-3 h-3 ${savedBoards.size > 0 ? "fill-primary" : ""}`} />}
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
