"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Download, Link2, ArrowRight } from "lucide-react"
import type { ImageClone, BrandBrainColor } from "@/lib/types"

type BrainMeta = { id: string; name: string; logo_url?: string | null; brand_colors?: BrandBrainColor[] }
type AdMeta    = { id: string; page_name: string; cached_image_url?: string | null; image_url?: string | null }

type CloneRich = Omit<ImageClone, "brand_brain" | "saved_ad"> & {
  brand_brain?: BrainMeta | null
  saved_ad?:    AdMeta    | null
}

interface Props {
  clones: CloneRich[]
}

function CreativeCard({ clone }: { clone: CloneRich }) {
  const [idx, setIdx] = useState(0)
  const images = clone.generated_image_urls ?? []
  const total  = images.length
  const current = images[idx] ?? ""

  const brain  = clone.brand_brain
  const ad     = clone.saved_ad
  const adThumb = ad?.cached_image_url ?? ad?.image_url
  const primaryColor = brain?.brand_colors?.[0]?.hex

  function prev(e: React.MouseEvent) {
    e.stopPropagation()
    setIdx((i) => (i - 1 + total) % total)
  }
  function next(e: React.MouseEvent) {
    e.stopPropagation()
    setIdx((i) => (i + 1) % total)
  }

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/share/image-clone/${clone.share_token}`
    : `/share/image-clone/${clone.share_token}`

  async function copyShare(e: React.MouseEvent) {
    e.stopPropagation()
    await navigator.clipboard.writeText(shareUrl).catch(() => {})
  }

  return (
    <div className="break-inside-avoid mb-4 group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-150">
      {/* Image zone */}
      <div className="relative bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt="Creativo generado"
          className="w-full h-auto block"
          loading="lazy"
        />

        {/* Carousel controls — only when multiple images */}
        {total > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {/* Dots */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setIdx(i) }}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/50"}`}
                />
              ))}
            </div>
          </>
        )}

        {/* Action overlay — top-right on hover */}
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={current}
            download
            onClick={(e) => e.stopPropagation()}
            className="w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            title="Descargar"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={copyShare}
            className="w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            title="Copiar link"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border/60">
        {/* Source ad thumbnail */}
        {adThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={adThumb}
            alt={ad?.page_name ?? ""}
            className="w-6 h-6 rounded object-cover flex-shrink-0 opacity-70"
          />
        ) : (
          <div className="w-6 h-6 rounded bg-muted flex-shrink-0" />
        )}

        <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />

        {/* Brand brain identity */}
        {brain?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brain.logo_url}
            alt={brain.name}
            className="w-5 h-5 rounded-full object-cover flex-shrink-0"
          />
        ) : primaryColor ? (
          <span
            className="w-5 h-5 rounded-full flex-shrink-0 border border-border"
            style={{ background: primaryColor }}
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-primary/20 flex-shrink-0" />
        )}

        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {brain?.name ?? "Sin marca"}
        </span>

        {/* Image counter */}
        {total > 1 && (
          <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
            {idx + 1}/{total}
          </span>
        )}
      </div>
    </div>
  )
}

export function CreativesGrid({ clones }: Props) {
  if (clones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <span className="text-2xl">🎨</span>
        </div>
        <div>
          <p className="text-sm font-semibold">Sin creativos todavía</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Clona un anuncio desde Discovery o un Board para ver tus creativos aquí.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="columns-2 sm:columns-3 lg:columns-4 gap-3">
      {clones.map((clone) => (
        <CreativeCard key={clone.id} clone={clone} />
      ))}
    </div>
  )
}
