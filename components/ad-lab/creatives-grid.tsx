"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Download, Link2, ArrowRight } from "lucide-react"
import type { ImageClone, BrandBrainColor } from "@/lib/types"

type BrainMeta = { id: string; name: string; logo_url?: string | null; brand_colors?: BrandBrainColor[] }
type AdMeta    = { id: string; page_name: string; cached_image_url?: string | null; image_url?: string | null }

export type CloneRich = Omit<ImageClone, "brand_brain" | "saved_ad"> & {
  brand_brain?: BrainMeta | null
  saved_ad?:    AdMeta    | null
}

interface Props {
  clones: CloneRich[]
}

function CreativeCard({ clone }: { clone: CloneRich }) {
  const [idx, setIdx]       = useState(0)
  const [copied, setCopied] = useState(false)

  const images  = clone.generated_image_urls ?? []
  const total   = images.length
  const current = images[idx] ?? ""

  const brain        = clone.brand_brain
  const ad           = clone.saved_ad
  const adThumb      = ad?.cached_image_url ?? ad?.image_url
  const primaryColor = brain?.brand_colors?.[0]?.hex

  function prev(e: React.MouseEvent) {
    e.stopPropagation()
    setIdx((i) => (i - 1 + total) % total)
  }
  function next(e: React.MouseEvent) {
    e.stopPropagation()
    setIdx((i) => (i + 1) % total)
  }

  async function copyShare(e: React.MouseEvent) {
    e.stopPropagation()
    const url = `${window.location.origin}/share/image-clone/${clone.share_token}`
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!current) return null

  return (
    <div className="break-inside-avoid mb-3 group relative overflow-hidden rounded-lg cursor-pointer">
      {/* The image IS the card */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current}
        alt=""
        className="w-full h-auto block"
        loading="lazy"
      />

      {/* Full overlay on hover */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200" />

      {/* Top-right actions — appear on hover */}
      <div className="absolute top-2.5 right-2.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <a
          href={current}
          download
          onClick={(e) => e.stopPropagation()}
          className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/80 transition-colors"
          title="Descargar"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
        <button
          onClick={copyShare}
          className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/80 transition-colors"
          title="Copiar link"
        >
          {copied
            ? <span className="text-[9px] font-bold text-green-400">✓</span>
            : <Link2 className="w-3.5 h-3.5" />
          }
        </button>
      </div>

      {/* Bottom overlay: brand context — appears on hover */}
      <div className="absolute bottom-0 inset-x-0 px-3 py-2.5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {/* Source ad thumb */}
        {adThumb
          ? <img src={adThumb} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0 ring-1 ring-white/20" /> // eslint-disable-line @next/next/no-img-element
          : <div className="w-6 h-6 rounded bg-white/20 flex-shrink-0" />
        }
        <ArrowRight className="w-3 h-3 text-white/70 flex-shrink-0" />
        {/* Brand brain identity */}
        {brain?.logo_url
          ? <img src={brain.logo_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0 ring-1 ring-white/20" /> // eslint-disable-line @next/next/no-img-element
          : <span className="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-white/20" style={{ background: primaryColor ?? "#6366f1" }} />
        }
        <span className="text-xs font-medium text-white truncate flex-1 min-w-0 drop-shadow">
          {brain?.name ?? "Sin marca"}
        </span>
        {total > 1 && (
          <span className="text-[10px] text-white/70 flex-shrink-0 tabular-nums">
            {idx + 1}/{total}
          </span>
        )}
      </div>

      {/* Carousel arrows — center sides, hover only */}
      {total > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}

export function CreativesGrid({ clones }: Props) {
  const validClones = clones.filter((c) => c.generated_image_urls?.length > 0)

  if (validClones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-2xl">🎨</div>
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
    <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3">
      {validClones.map((clone) => (
        <CreativeCard key={clone.id} clone={clone} />
      ))}
    </div>
  )
}
