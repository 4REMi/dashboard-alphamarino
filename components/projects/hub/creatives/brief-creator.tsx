"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Brain, Sparkles, Link2, Copy, Check,
  Loader2, ExternalLink, Play, Image as ImageIcon,
} from "lucide-react"
import type { CreativeConcept, BrandBrain, CreativeBrief } from "@/lib/types"
import { createBrief, generateBriefContent } from "@/lib/actions/creatives"

interface SavedAdRef {
  id: string
  page_name: string | null
  body: string | null
  cached_image_url: string | null
  image_url: string | null
  cached_video_url: string | null
  video_url: string | null
  format: string | null
}

interface BoardRef {
  id: string
  name: string
  ad_count: number
  preview_ads?: { cached_image_url: string | null; image_url: string | null }[]
}

interface Props {
  concept: CreativeConcept
  projectId: string
  brandBrains: BrandBrain[]
  savedAds: SavedAdRef[]
  boards: BoardRef[]
  onClose: () => void
  onCreated: (brief: CreativeBrief) => void
}

function isVideoAd(ad: SavedAdRef) {
  return ad.format === "video" || !!ad.video_url || !!ad.cached_video_url
}

function getThumb(ad: SavedAdRef) {
  return ad.cached_image_url || ad.image_url || null
}

export function BriefCreator({
  concept, projectId, brandBrains, savedAds, boards, onClose, onCreated,
}: Props) {
  const [selectedBrainId, setSelectedBrainId] = useState("")
  const [selectedAdIds, setSelectedAdIds] = useState<string[]>([])
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([])
  const [generatedBrief, setGeneratedBrief] = useState<CreativeBrief | null>(null)
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const selectedBrain = brandBrains.find((b) => b.id === selectedBrainId)

  function handleGenerate() {
    if (!selectedBrainId) return
    startTransition(async () => {
      const brief = await createBrief(projectId, concept.id, selectedBrainId, selectedAdIds, selectedBoardIds, concept.brand_line_id ?? undefined)
      setGeneratedBrief(brief)
      await generateBriefContent(brief.id)
    })
  }

  function handleCopyLink() {
    if (!generatedBrief) return
    const url = `${window.location.origin}/share/brief/${generatedBrief.share_token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function toggleAd(id: string) {
    setSelectedAdIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }
  function toggleBoard(id: string) {
    setSelectedBoardIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const videoAds = savedAds.filter(isVideoAd)
  const imageAds = savedAds.filter((a) => !isVideoAd(a))

  if (generatedBrief) {
    const shareUrl = `${window.location.origin}/share/brief/${generatedBrief.share_token}`
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">Brief creado</p>
              <p className="text-xs text-muted-foreground">Comparte el link con tu editor o diseñador</p>
            </div>
            <div className="w-full flex items-center gap-1.5 p-2 rounded-lg bg-muted/50 border">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 text-xs bg-transparent border-0 outline-none truncate"
              />
              <Button size="sm" variant="ghost" onClick={handleCopyLink} className="h-7 px-2 flex-shrink-0">
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </Button>
              <a href={`/share/brief/${generatedBrief.share_token}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="h-7 px-2">
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            </div>
            <Button className="w-full" onClick={() => { onCreated(generatedBrief); onClose() }}>
              Listo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Brief — {concept.name ?? concept.angle_type ?? "Concepto"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">

          {/* ── Brand Brain selector ── */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Brand Brain</p>
            {brandBrains.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                No hay Brand Brains. Crea uno en Ad Lab.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {brandBrains.map((brain) => (
                  <button
                    key={brain.id}
                    type="button"
                    onClick={() => setSelectedBrainId(brain.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all",
                      selectedBrainId === brain.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary font-medium"
                        : "border-border hover:border-primary/30"
                    )}
                  >
                    <Brain className="w-3.5 h-3.5 text-primary/60" />
                    {brain.name}
                    {brain.industry && <span className="text-xs text-muted-foreground">· {brain.industry}</span>}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Video references ── */}
          {videoAds.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Videos de referencia <span className="font-normal">(opcional — se tropicalizará el guión)</span>
              </p>

              {/* Inline video preview */}
              {previewVideoId && (() => {
                const ad = videoAds.find((a) => a.id === previewVideoId)
                const src = ad?.cached_video_url || ad?.video_url
                if (!ad || !src) return null
                return (
                  <div className="mb-3 rounded-xl overflow-hidden border bg-black relative">
                    <video
                      controls
                      autoPlay
                      preload="metadata"
                      poster={getThumb(ad) || undefined}
                      className="w-full max-h-[280px] object-contain"
                      style={{ display: "block" }}
                    >
                      <source src={src} />
                    </video>
                    <button
                      type="button"
                      onClick={() => setPreviewVideoId(null)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <span className="text-xs font-bold">✕</span>
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
                      <p className="text-xs text-white font-medium">{ad.page_name ?? "Video"}</p>
                    </div>
                  </div>
                )
              })()}

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                {videoAds.map((ad) => {
                  const thumb = getThumb(ad)
                  const selected = selectedAdIds.includes(ad.id)
                  const hasVideo = !!(ad.cached_video_url || ad.video_url)
                  return (
                    <div
                      key={ad.id}
                      className={cn(
                        "group relative rounded-xl overflow-hidden border-2 transition-all aspect-[9/16]",
                        selected ? "border-primary ring-1 ring-primary" : "border-transparent hover:border-primary/30"
                      )}
                    >
                      {/* Thumbnail — click to select */}
                      <button
                        type="button"
                        onClick={() => toggleAd(ad.id)}
                        className="w-full h-full"
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <Play className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
                      </button>

                      {/* Play preview button */}
                      {hasVideo && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPreviewVideoId(previewVideoId === ad.id ? null : ad.id) }}
                          className={cn(
                            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all",
                            previewVideoId === ad.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-white/90 text-gray-800 hover:bg-white hover:scale-110"
                          )}
                        >
                          <Play className="w-3.5 h-3.5 ml-0.5" />
                        </button>
                      )}

                      {/* Name label */}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6 pointer-events-none">
                        <p className="text-[10px] text-white/90 truncate text-center font-medium">
                          {ad.page_name ?? "Video"}
                        </p>
                      </div>

                      {/* Selection checkmark */}
                      {selected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center pointer-events-none">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Image references ── */}
          {imageAds.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Imágenes de referencia <span className="font-normal">(opcional)</span>
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                {imageAds.map((ad) => {
                  const thumb = getThumb(ad)
                  const selected = selectedAdIds.includes(ad.id)
                  return (
                    <button
                      key={ad.id}
                      type="button"
                      onClick={() => toggleAd(ad.id)}
                      className={cn(
                        "group relative rounded-xl overflow-hidden border-2 transition-all aspect-square",
                        selected ? "border-primary ring-1 ring-primary" : "border-transparent hover:border-primary/30"
                      )}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                        <p className="text-[10px] text-white/90 truncate font-medium">
                          {ad.page_name ?? "Imagen"}
                        </p>
                      </div>
                      {selected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Boards ── */}
          {boards.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Boards <span className="font-normal">(opcional)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {boards.map((board) => {
                  const selected = selectedBoardIds.includes(board.id)
                  const previews = board.preview_ads?.slice(0, 3) ?? []
                  return (
                    <button
                      key={board.id}
                      type="button"
                      onClick={() => toggleBoard(board.id)}
                      className={cn(
                        "rounded-xl border-2 p-3 text-left transition-all",
                        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      )}
                    >
                      {previews.length > 0 && (
                        <div className="flex gap-1 mb-2">
                          {previews.map((p, i) => {
                            const src = p.cached_image_url || p.image_url
                            return src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={src} alt="" className="w-8 h-8 rounded object-cover" />
                            ) : null
                          })}
                        </div>
                      )}
                      <p className="text-sm font-medium truncate">{board.name}</p>
                      <p className="text-xs text-muted-foreground">{board.ad_count} ads</p>
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          <div className="flex items-center gap-2 mr-auto text-xs text-muted-foreground">
            {selectedBrain && <span className="font-medium text-foreground">{selectedBrain.name}</span>}
            {selectedAdIds.length > 0 && <span>· {selectedAdIds.length} ref</span>}
            {selectedBoardIds.length > 0 && <span>· {selectedBoardIds.length} board{selectedBoardIds.length !== 1 ? "s" : ""}</span>}
          </div>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={!selectedBrainId || isPending}>
            {isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{selectedAdIds.some(id => videoAds.find(a => a.id === id)) ? "Generando y tropicalizando…" : "Generando…"}</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Generar Brief</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
