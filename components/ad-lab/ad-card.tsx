"use client"

import { useState, useRef, useEffect } from "react"
import type { MetaAdResult, AdBoard } from "@/lib/types"
import { Wand2, Bookmark, Check, Loader2, ExternalLink } from "lucide-react"

interface Props {
  ad: MetaAdResult
  boards: AdBoard[]
  savingId: string | null
  onSaveToBoard: (ad: MetaAdResult, boardId: string) => Promise<void>
}

// Deterministic color from page name
function brandColor(name: string): string {
  const colors = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return "—"
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return "hoy"
  if (diff === 1) return "ayer"
  if (diff < 30) return `${diff}d`
  if (diff < 365) return `${Math.floor(diff / 30)}m`
  return `${Math.floor(diff / 365)}a`
}

function platformLabel(platform: string): string {
  if (platform === "facebook")  return "FB"
  if (platform === "instagram") return "IG"
  if (platform === "messenger") return "MS"
  return platform.slice(0, 2).toUpperCase()
}

export function AdCard({ ad, boards, savingId, onSaveToBoard }: Props) {
  const [showBoardPicker, setShowBoardPicker] = useState(false)
  const [savedBoards, setSavedBoards] = useState<Set<string>>(new Set())
  const pickerRef = useRef<HTMLDivElement>(null)
  const isSaving = savingId === ad.id
  const color = brandColor(ad.page_name)
  const initials = ad.page_name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)
  const body = ad.ad_creative_bodies?.[0] ?? null

  // Close picker on outside click
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
      <div className="relative aspect-[4/5] bg-muted overflow-hidden">
        {/* Colored brand placeholder */}
        <div className={`absolute inset-0 ${color} opacity-10`} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-4xl font-black opacity-20 select-none`}>{initials}</span>
        </div>

        {/* Snapshot link overlay (shows on hover) */}
        {ad.snapshot_url && (
          <a
            href={ad.snapshot_url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-white bg-black/60 px-3 py-1.5 rounded-full">
              <ExternalLink className="w-3 h-3" />
              Ver anuncio
            </span>
          </a>
        )}

        {/* Status badge */}
        <div className="absolute top-2 left-2 z-20">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            ad.is_active
              ? "bg-white/90 text-emerald-700"
              : "bg-white/90 text-slate-500"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${ad.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
            {ad.is_active ? "Activo" : "Inactivo"}
          </span>
        </div>

        {/* Platforms */}
        {(ad.publisher_platforms ?? []).length > 0 && (
          <div className="absolute bottom-2 right-2 z-20 flex gap-1">
            {ad.publisher_platforms.map((p) => (
              <span key={p} className="w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-[8px] font-bold">
                {platformLabel(p)}
              </span>
            ))}
          </div>
        )}

        {/* Clone FAB — appears on hover */}
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
          <div className={`w-6 h-6 rounded-md ${color} flex items-center justify-center flex-shrink-0`}>
            <span className="text-[9px] font-bold text-white">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{ad.page_name}</p>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
            {daysAgo(ad.ad_delivery_start_time)}
          </span>
        </div>

        {/* Ad copy */}
        {body && (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 mb-3">
            {body}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 pt-2.5 mt-1">
          {/* Impressions */}
          <div className="text-[10px] text-muted-foreground font-mono">
            {ad.impressions
              ? `${Number(ad.impressions.lower_bound).toLocaleString()}+ imp.`
              : "—"
            }
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
              title="Guardar en board"
            >
              {isSaving
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Bookmark className={`w-3 h-3 ${savedBoards.size > 0 ? "fill-primary" : ""}`} />
              }
              {savedBoards.size > 0 ? "Guardado" : "Guardar"}
            </button>

            {/* Board picker dropdown */}
            {showBoardPicker && (
              <div className="absolute bottom-full right-0 mb-1 w-52 bg-popover border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-semibold">Guardar en board</p>
                </div>
                {boards.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    No tienes boards. Crea uno en{" "}
                    <a href="/ad-lab/boards" className="text-primary underline">Ad Lab → Boards</a>.
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
                          <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-muted-foreground">
                            {board.name[0].toUpperCase()}
                          </div>
                          <span className="flex-1 truncate">{board.name}</span>
                          {saved && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {board.ad_count ?? 0}
                          </span>
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
