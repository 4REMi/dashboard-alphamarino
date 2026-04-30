"use client"

import { useState, useTransition } from "react"
import type { SavedAd, AdBoard, MetaAdResult } from "@/lib/types"
import { removeAdFromBoard, deleteSavedAd } from "@/lib/actions/ad-lab"
import { ArrowLeft, FolderOpen, Trash2, ExternalLink, MoreHorizontal, Loader2, Play } from "lucide-react"
import { SiFacebook, SiInstagram, SiMessenger, SiMeta, SiThreads } from "@icons-pack/react-simple-icons"
import { AdDetailModal } from "@/components/ad-lab/ad-detail-modal"
import Link from "next/link"

interface Props {
  board: AdBoard
  initialAds: SavedAd[]
  boards: AdBoard[]
}

/**
 * Return the MetaAdResult to pass to AdDetailModal.
 * Prefers the full frozen snapshot stored at save time; falls back to
 * reconstructing from flat fields for ads saved before this change.
 */
function savedAdToResult(ad: SavedAd): MetaAdResult {
  // Use the frozen snapshot if available — includes landing page, CTA, all cards
  if (ad.ad_snapshot) {
    const snap = ad.ad_snapshot as MetaAdResult
    // Swap in cached media URLs so the modal always shows our own copies
    const thumbUrl = ad.cached_image_url ?? ad.image_url
    const videoUrl = ad.cached_video_url ?? ad.video_url
    if (thumbUrl || videoUrl) {
      const cards = snap.snapshot?.cards?.length
        ? snap.snapshot.cards.map((c, i) => i === 0 ? {
            ...c,
            resized_image_url:       thumbUrl ?? c.resized_image_url,
            original_image_url:      thumbUrl ?? c.original_image_url,
            video_hd_url:            videoUrl ?? c.video_hd_url,
            video_preview_image_url: thumbUrl ?? c.video_preview_image_url,
          } : c)
        : [{
            body: ad.body, title: null, link_url: null, cta_text: null,
            original_image_url: thumbUrl, resized_image_url: thumbUrl,
            video_hd_url: videoUrl, video_sd_url: null,
            video_preview_image_url: thumbUrl,
          }]
      return { ...snap, snapshot: { ...snap.snapshot, cards } }
    }
    return snap
  }

  // Fallback for ads saved before full snapshot storage was added
  const thumbUrl = ad.cached_image_url ?? ad.image_url
  const videoUrl = ad.cached_video_url ?? ad.video_url
  return {
    ad_archive_id:        ad.ad_archive_id,
    page_id:              ad.page_id,
    page_name:            ad.page_name,
    is_active:            ad.status === "active",
    start_date:           ad.start_date ? Math.floor(new Date(ad.start_date).getTime() / 1000) : null,
    end_date:             ad.end_date   ? Math.floor(new Date(ad.end_date).getTime()   / 1000) : null,
    start_date_formatted: ad.start_date,
    end_date_formatted:   ad.end_date,
    publisher_platform:   (ad.platforms ?? []).map((p) => p.toUpperCase()),
    spend:                ad.spend_lower != null
                            ? { lower_bound: ad.spend_lower, upper_bound: ad.spend_upper ?? ad.spend_lower }
                            : null,
    currency:             ad.currency || null,
    snapshot: {
      page_name: ad.page_name, page_profile_picture_url: null,
      body: ad.body ? { text: ad.body } : null,
      cards: [{
        body: ad.body, title: null, link_url: null, cta_text: null,
        original_image_url: thumbUrl, resized_image_url: thumbUrl,
        video_hd_url: videoUrl, video_sd_url: null, video_preview_image_url: thumbUrl,
      }],
      cta_text: null, display_format: null, link_url: null, page_like_count: null,
      images: [], videos: [],
    },
    impressions_with_index: null,
    ad_library_url:         ad.snapshot_url,
    total:                  0,
  }
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

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "2-digit" })
}

function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.toUpperCase()
  const cls = "w-3 h-3 text-white"
  if (p === "FACEBOOK")         return <SiFacebook className={cls} />
  if (p === "INSTAGRAM")        return <SiInstagram className={cls} />
  if (p === "MESSENGER")        return <SiMessenger className={cls} />
  if (p === "AUDIENCE_NETWORK") return <SiMeta className={cls} />
  if (p === "THREADS")          return <SiThreads className={cls} />
  return <span className="text-[7px] font-bold text-white">{platform.slice(0, 2).toUpperCase()}</span>
}

export function BoardDetail({ board, initialAds, boards }: Props) {
  const [ads, setAds]           = useState(initialAds)
  const [menuId, setMenuId]     = useState<string | null>(null)
  const [detailAd, setDetailAd] = useState<MetaAdResult | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRemove(ad: SavedAd) {
    startTransition(async () => {
      await removeAdFromBoard(board.id, ad.id)
      setAds((prev) => prev.filter((a) => a.id !== ad.id))
    })
  }

  function handleDelete(ad: SavedAd) {
    if (!confirm("¿Eliminar este anuncio de todos los boards?")) return
    startTransition(async () => {
      await deleteSavedAd(ad.id)
      setAds((prev) => prev.filter((a) => a.id !== ad.id))
    })
  }

  return (
    <>
      {detailAd && (
        <AdDetailModal
          ad={detailAd}
          boards={boards}
          onClose={() => setDetailAd(null)}
        />
      )}
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/ad-lab/boards"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <FolderOpen className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{board.name}</h1>
            {board.description && (
              <p className="text-sm text-muted-foreground">{board.description}</p>
            )}
          </div>
          {isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {ads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <FolderOpen className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Board vacío</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Guarda anuncios desde Discovery para verlos aquí.
              </p>
            </div>
            <Link
              href="/ad-lab/discovery"
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Ir a Discovery
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              {ads.length} anuncio{ads.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {ads.map((ad) => {
                const color    = brandColor(ad.page_name)
                const initials = ad.page_name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                const thumbUrl = ad.cached_image_url ?? ad.image_url
                const videoUrl = ad.cached_video_url ?? ad.video_url
                const isActive = ad.status === "active"

                return (
                  <div
                    key={ad.id}
                    className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-150"
                  >
                    {/* ── Thumbnail ── */}
                    <div
                      className="relative aspect-[4/5] bg-muted overflow-hidden cursor-pointer"
                      onClick={() => setDetailAd(savedAdToResult(ad))}
                    >
                      {thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbUrl} alt={ad.page_name} className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <div className={`absolute inset-0 ${color} opacity-10`} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-4xl font-black opacity-20 select-none">{initials}</span>
                          </div>
                        </>
                      )}

                      {/* Hover dim — pointer-events-none so nothing intercepts clicks */}
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
                          isActive ? "text-emerald-700" : "text-slate-500"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {isActive ? "Activo" : "Inactivo"}
                        </span>
                      </div>

                      {/* Platform icons */}
                      {(ad.platforms ?? []).length > 0 && (
                        <div className="absolute bottom-2 right-2 z-20 flex gap-1">
                          {ad.platforms.map((p) => (
                            <span key={p} className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                              <PlatformIcon platform={p} />
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action menu */}
                      <div className="absolute top-2 right-2 z-20">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuId((v) => v === ad.id ? null : ad.id) }}
                          className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        {menuId === ad.id && (
                          <div
                            className="absolute right-0 top-full mt-1 w-44 bg-popover border border-border rounded-xl shadow-lg z-30 overflow-hidden py-1"
                            onMouseLeave={() => setMenuId(null)}
                          >
                            <button
                              onClick={() => { handleRemove(ad); setMenuId(null) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                            >
                              <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
                              Quitar del board
                            </button>
                            <button
                              onClick={() => { handleDelete(ad); setMenuId(null) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar anuncio
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Body ── */}
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-6 h-6 rounded-md ${color} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-[9px] font-bold text-white">{initials}</span>
                        </div>
                        <p className="text-xs font-semibold truncate flex-1">{ad.page_name}</p>
                        <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
                          {fmtDate(ad.start_date)}
                        </span>
                      </div>

                      {ad.body && ad.body !== "{{product.brand}}" && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 mb-3">
                          {ad.body}
                        </p>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between border-t border-border/50 pt-2.5 mt-1">
                        <div className="flex items-center gap-1.5">
                          {(ad.platforms ?? []).slice(0, 3).map((p) => (
                            <span key={p} className="w-4 h-4 rounded-full bg-muted flex items-center justify-center">
                              <PlatformIcon platform={p} />
                            </span>
                          ))}
                        </div>
                        {ad.snapshot_url && (
                          <a
                            href={ad.snapshot_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                            title="Ver en Ad Library"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Ad Library
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
