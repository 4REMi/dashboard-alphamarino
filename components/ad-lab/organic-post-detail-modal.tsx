"use client"

import { useState } from "react"
import type { SavedAd } from "@/lib/types"
import { X, ChevronLeft, ChevronRight, Heart, MessageCircle, ExternalLink, Wand2, Layers, FileText, ScanSearch, ImageIcon } from "lucide-react"
import { CloneModal } from "@/components/ad-lab/clone-modal"
import { ExtractScriptModal } from "@/components/ad-lab/extract-script-modal"
import { ConceptAnalysisModal } from "@/components/ad-lab/concept-analysis-modal"
import type { MetaAdResult } from "@/lib/types"
import { CarouselCloneModal } from "@/components/ad-lab/carousel-clone-modal"
import { ImageCloneModal } from "@/components/ad-lab/image-clone-modal"

interface Props {
  post: SavedAd
  onClose: () => void
}

function formatCount(n: number | null): string {
  if (n === null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * Shared carousel viewer + "Clonar imagen" entry point for a saved
 * organic post. Single-image/video posts render the same way, just
 * with one slide and no arrows — one component instead of a separate
 * viewer + picker (per the plan: bundle both into Phase 3).
 */
export function OrganicPostDetailModal({ post, onClose }: Props) {
  const slides = post.cached_carousel_image_urls?.length
    ? post.cached_carousel_image_urls
    : post.carousel_image_urls?.length
      ? post.carousel_image_urls
      : []
  const isCarousel = slides.length > 1
  const [slideIndex, setSlideIndex] = useState(0)
  const [showClone, setShowClone] = useState(false)
  const [showCarouselClone, setShowCarouselClone] = useState(false)
  const [showScriptClone, setShowScriptClone] = useState(false)
  const [showExtract, setShowExtract] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)

  const currentImageUrl = isCarousel
    ? slides[slideIndex]
    : (post.cached_image_url ?? post.image_url ?? null)
  const videoUrl = post.cached_video_url ?? post.video_url ?? null

  function prev() { setSlideIndex((i) => (i - 1 + slides.length) % slides.length) }
  function next() { setSlideIndex((i) => (i + 1) % slides.length) }

  // Video: mismas herramientas que un anuncio de Meta (clonar guion, extraer
  // script, analizar concepto). Antes solo había "Clonar imagen".
  if (showScriptClone && videoUrl) {
    const ad = {
      ad_archive_id: post.ad_archive_id ?? `saved:${post.id}`, page_id: post.page_id ?? null, page_name: post.page_name,
      snapshot: { body: { text: post.caption ?? "" }, cards: [{ video_hd_url: videoUrl, video_preview_image_url: currentImageUrl ?? undefined, original_image_url: currentImageUrl ?? undefined }] },
    } as unknown as MetaAdResult
    return <CloneModal ad={ad} savedAdId={post.id} onClose={() => setShowScriptClone(false)} />
  }
  if (showExtract && videoUrl) {
    return <ExtractScriptModal videoUrl={videoUrl} titulo={`@${post.page_name}`} onClose={() => setShowExtract(false)} />
  }
  if (showAnalysis) {
    return (
      <ConceptAnalysisModal
        open
        onClose={() => setShowAnalysis(false)}
        onClone={() => { setShowAnalysis(false); if (videoUrl) setShowScriptClone(true); else setShowClone(true) }}
        ad={{
          adArchiveId: post.ad_archive_id ?? `saved:${post.id}`, pageId: post.page_id ?? null, pageName: post.page_name,
          body: post.caption ?? null, title: null, caption: null, cta: null, linkUrl: post.post_url ?? null,
          videoUrl, imageUrl: currentImageUrl, isActive: false, startDate: null,
        }}
      />
    )
  }

  if (showCarouselClone) {
    return <CarouselCloneModal savedAdId={post.id} pageName={post.page_name} slides={slides} onClose={() => setShowCarouselClone(false)} />
  }

  if (showClone) {
    return (
      <ImageCloneModal
        savedAdSource={currentImageUrl ? { savedAdId: post.id, imageUrl: currentImageUrl, pageName: post.page_name } : undefined}
        onClose={() => setShowClone(false)}
      />
    )
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
        {/* Media */}
        <div className="relative md:w-1/2 bg-black flex items-center justify-center flex-shrink-0 aspect-[4/5] md:aspect-auto">
          {videoUrl ? (
            <video src={videoUrl} controls className="w-full h-full object-contain" poster={currentImageUrl ?? undefined} />
          ) : currentImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentImageUrl} alt={post.page_name} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Sin imagen</div>
          )}

          {isCarousel && (
            <>
              <button
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlideIndex(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === slideIndex ? "bg-white" : "bg-white/40"}`}
                  />
                ))}
              </div>
              <span className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
                {slideIndex + 1}/{slides.length}
              </span>
            </>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <p className="text-sm font-semibold truncate">@{post.page_name}</p>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {post.caption && (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{post.caption}</p>
            )}
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Heart className="w-4 h-4" /> {formatCount(post.likes_count)}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MessageCircle className="w-4 h-4" /> {formatCount(post.comments_count)}
              </span>
              {post.post_url && (
                <a
                  href={post.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline ml-auto"
                >
                  Ver en Instagram <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          <div className="px-5 py-4 border-t border-border flex-shrink-0 space-y-2">
            {videoUrl ? (
              <>
                <button
                  onClick={() => setShowScriptClone(true)}
                  title="Transcribe el video y adapta el guion a tu marca"
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Wand2 className="w-4 h-4" />
                  Clonar guion
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setShowExtract(true)} title="Extraer el guion original, sin adaptarlo"
                    className="h-9 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center justify-center gap-2 transition-colors">
                    <FileText className="w-4 h-4" />Extraer script
                  </button>
                  <button onClick={() => setShowAnalysis(true)} title="Ángulo, persona, dolor, gancho, estructura y cómo adaptarlo"
                    className="h-9 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center justify-center gap-2 transition-colors">
                    <ScanSearch className="w-4 h-4" />Analizar concepto
                  </button>
                </div>
                {currentImageUrl && (
                  <button onClick={() => setShowClone(true)} title="Clonar la portada del video como imagen estática"
                    className="w-full h-9 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center justify-center gap-1.5 transition-colors">
                    <ImageIcon className="w-3.5 h-3.5" />Clonar la portada como imagen
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowClone(true)}
                  disabled={!currentImageUrl}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Wand2 className="w-4 h-4" />
                  {isCarousel ? `Clonar esta slide (${slideIndex + 1}/${slides.length})` : "Clonar imagen"}
                </button>
                {currentImageUrl && (
                  <button onClick={() => setShowAnalysis(true)}
                    className="w-full h-9 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center justify-center gap-2 transition-colors">
                    <ScanSearch className="w-4 h-4" />Analizar concepto
                  </button>
                )}
              </>
            )}
            {isCarousel && (
              <button
                onClick={() => setShowCarouselClone(true)}
                className="mt-2 w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-primary/40 text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
              >
                <Layers className="w-4 h-4" />
                Clonar carrusel completo ({slides.length} slides)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
