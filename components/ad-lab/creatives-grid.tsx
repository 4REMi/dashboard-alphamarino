"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronLeft, ChevronRight, Download, Link2, ArrowRight, X, Maximize2,
} from "lucide-react"
import type { ImageClone, AdClone, BrandBrainColor } from "@/lib/types"

type BrainMeta = { id: string; name: string; logo_url?: string | null; brand_colors?: BrandBrainColor[] }
type AdMeta    = { id: string; page_name: string; cached_image_url?: string | null; image_url?: string | null }

export type CloneRich = Omit<ImageClone, "brand_brain" | "saved_ad"> & {
  brand_brain?: BrainMeta | null
  saved_ad?:    AdMeta    | null
}

export type AdCloneRich = Omit<AdClone, "brand_brain" | "saved_ad"> & {
  brand_brain?: BrainMeta | null
  saved_ad?:    AdMeta    | null
}

interface Props {
  clones:       CloneRich[]
  scriptClones: AdCloneRich[]
}

// ── Lightbox ──────────────────────────────────────────────────

function Lightbox({
  clone, imgIdx: initialIdx, onClose,
}: { clone: CloneRich; imgIdx: number; onClose: () => void }) {
  const [idx, setIdx]   = useState(initialIdx)
  const [copied, setCopied] = useState(false)
  const images  = clone.generated_image_urls ?? []
  const total   = images.length
  const current = images[idx] ?? ""
  const brain   = clone.brand_brain
  const primaryColor = brain?.brand_colors?.[0]?.hex

  const prev = useCallback(() => setIdx((i) => (i - 1 + total) % total), [total])
  const next = useCallback(() => setIdx((i) => (i + 1) % total), [total])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")      onClose()
      if (e.key === "ArrowLeft"  && total > 1) prev()
      if (e.key === "ArrowRight" && total > 1) next()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, prev, next, total])

  async function copyShare() {
    const url = `${window.location.origin}/share/image-clone/${clone.share_token}`
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" onClick={onClose}>
      <div className="absolute inset-0 bg-black/90" />

      {/* Top bar */}
      <div
        className="relative z-10 flex items-center justify-between px-5 py-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          {brain?.logo_url
            ? <img src={brain.logo_url} alt="" className="w-7 h-7 rounded-full object-cover ring-1 ring-white/20" /> // eslint-disable-line @next/next/no-img-element
            : <span className="w-7 h-7 rounded-full ring-1 ring-white/20 flex-shrink-0" style={{ background: primaryColor ?? "#6366f1" }} />
          }
          <span className="text-sm font-medium text-white">{brain?.name ?? "Sin marca"}</span>
          {total > 1 && (
            <span className="text-xs text-white/50 tabular-nums">{idx + 1} / {total}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={current}
            download
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Descargar
          </a>
          <button
            onClick={copyShare}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" />
            {copied ? "Copiado" : "Copiar link"}
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="relative flex-1 flex items-center justify-center p-6 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt=""
          className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
        />
        {total > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Image clone card ──────────────────────────────────────────

function CreativeCard({
  clone, onOpen,
}: { clone: CloneRich; onOpen: (clone: CloneRich, idx: number) => void }) {
  const [idx, setIdx]       = useState(0)
  const [copied, setCopied] = useState(false)
  const images       = clone.generated_image_urls ?? []
  const total        = images.length
  const current      = images[idx] ?? ""
  const brain        = clone.brand_brain
  const ad           = clone.saved_ad
  const adThumb      = ad?.cached_image_url ?? ad?.image_url
  const primaryColor = brain?.brand_colors?.[0]?.hex

  function prev(e: React.MouseEvent) { e.stopPropagation(); setIdx((i) => (i - 1 + total) % total) }
  function next(e: React.MouseEvent) { e.stopPropagation(); setIdx((i) => (i + 1) % total) }

  async function copyShare(e: React.MouseEvent) {
    e.stopPropagation()
    const url = `${window.location.origin}/share/image-clone/${clone.share_token}`
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!current) return null

  return (
    <div
      className="break-inside-avoid mb-3 group relative overflow-hidden rounded-lg cursor-pointer"
      onClick={() => onOpen(clone, idx)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current} alt="" className="w-full h-auto block" loading="lazy" />

      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200" />

      {/* Top-right actions */}
      <div className="absolute top-2.5 right-2.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <a
          href={current} download onClick={(e) => e.stopPropagation()}
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
          {copied ? <span className="text-[9px] font-bold text-green-400">✓</span> : <Link2 className="w-3.5 h-3.5" />}
        </button>
        <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center" title="Ver ampliado">
          <Maximize2 className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Bottom overlay */}
      <div className="absolute bottom-0 inset-x-0 px-3 py-2.5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {adThumb
          ? <img src={adThumb} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0 ring-1 ring-white/20" /> // eslint-disable-line @next/next/no-img-element
          : <div className="w-6 h-6 rounded bg-white/20 flex-shrink-0" />
        }
        <ArrowRight className="w-3 h-3 text-white/70 flex-shrink-0" />
        {brain?.logo_url
          ? <img src={brain.logo_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0 ring-1 ring-white/20" /> // eslint-disable-line @next/next/no-img-element
          : <span className="w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-white/20" style={{ background: primaryColor ?? "#6366f1" }} />
        }
        <span className="text-xs font-medium text-white truncate flex-1 min-w-0 drop-shadow">
          {brain?.name ?? "Sin marca"}
        </span>
        {total > 1 && <span className="text-[10px] text-white/70 flex-shrink-0 tabular-nums">{idx + 1}/{total}</span>}
      </div>

      {/* Carousel arrows */}
      {total > 1 && (
        <>
          <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}

// ── Script clone card ─────────────────────────────────────────

function ScriptCard({ clone }: { clone: AdCloneRich }) {
  const [copied, setCopied] = useState(false)
  const brain        = clone.brand_brain
  const ad           = clone.saved_ad
  const primaryColor = brain?.brand_colors?.[0]?.hex
  const lines        = clone.adapted_lines ?? []
  const preview      = lines.slice(0, 3)
  const remaining    = lines.length - preview.length

  async function copyShare(e: React.MouseEvent) {
    e.stopPropagation()
    const url = `${window.location.origin}/share/clone/${clone.share_token}`
    await navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        {brain?.logo_url
          ? <img src={brain.logo_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" /> // eslint-disable-line @next/next/no-img-element
          : <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: primaryColor ?? "#6366f1" }} />
        }
        <span className="text-sm font-semibold truncate flex-1 min-w-0">{brain?.name ?? "Sin marca"}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{lines.length} líneas</span>
      </div>

      {/* Lines preview */}
      <div className="flex-1 px-4 py-3 space-y-2">
        {preview.map((line, i) => (
          <p key={i} className="text-xs text-foreground leading-relaxed line-clamp-2">
            <span className="text-[10px] font-bold text-muted-foreground mr-1.5 tabular-nums">{i + 1}.</span>
            {line.adapted}
          </p>
        ))}
        {remaining > 0 && (
          <p className="text-[10px] text-muted-foreground">+{remaining} líneas más</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30">
        <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">
          {ad?.page_name ?? "Anuncio"}
        </span>
        <button
          onClick={copyShare}
          className="inline-flex items-center gap-1 h-6 px-2.5 rounded-lg text-[11px] font-medium border border-border hover:bg-muted transition-colors flex-shrink-0 ml-2"
        >
          {copied ? <span className="text-emerald-500">✓</span> : <Link2 className="w-3 h-3" />}
          {copied ? "Copiado" : "Compartir"}
        </button>
      </div>
    </div>
  )
}

// ── Main grid ─────────────────────────────────────────────────

export function CreativesGrid({ clones, scriptClones }: Props) {
  const [tab, setTab]               = useState<"estaticos" | "guiones">("estaticos")
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null)
  const [lightbox, setLightbox]     = useState<{ clone: CloneRich; imgIdx: number } | null>(null)

  const validClones  = clones.filter((c) => (c.generated_image_urls?.length ?? 0) > 0)
  const validScripts = scriptClones.filter((c) => (c.adapted_lines?.length ?? 0) > 0)

  function dedupBrains(items: Array<{ brand_brain?: BrainMeta | null }>) {
    return Array.from(
      items.reduce((map, c) => {
        const b = c.brand_brain
        if (b && !map.has(b.id)) map.set(b.id, b)
        return map
      }, new Map<string, BrainMeta>()).values()
    )
  }

  const brands = tab === "estaticos" ? dedupBrains(validClones) : dedupBrains(validScripts)

  const filteredClones  = selectedBrainId ? validClones.filter((c)  => c.brand_brain?.id === selectedBrainId) : validClones
  const filteredScripts = selectedBrainId ? validScripts.filter((c) => c.brand_brain?.id === selectedBrainId) : validScripts

  function switchTab(t: "estaticos" | "guiones") {
    setTab(t)
    setSelectedBrainId(null)
  }

  const isEmpty    = tab === "estaticos" ? validClones.length === 0  : validScripts.length === 0
  const noResults  = tab === "estaticos" ? filteredClones.length === 0 : filteredScripts.length === 0

  return (
    <>
      {lightbox && (
        <Lightbox clone={lightbox.clone} imgIdx={lightbox.imgIdx} onClose={() => setLightbox(null)} />
      )}

      <div className="space-y-5">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: "estaticos", label: "Estáticos", count: validClones.length  },
            { key: "guiones",   label: "Guiones",   count: validScripts.length },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-full ${
                tab === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-2xl">
              {tab === "estaticos" ? "🎨" : "📝"}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {tab === "estaticos" ? "Sin estáticos todavía" : "Sin guiones adaptados todavía"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                {tab === "estaticos"
                  ? "Clona un anuncio de imagen desde Discovery o un Board para ver tus estáticos aquí."
                  : "Clona un anuncio de video desde Discovery o un Board para ver tus guiones adaptados aquí."
                }
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Brand filter */}
            {brands.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedBrainId(null)}
                  className={`flex items-center gap-2 h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
                    !selectedBrainId
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  Todas
                </button>
                {brands.map((brain) => {
                  const isActive = selectedBrainId === brain.id
                  const colors   = brain.brand_colors?.slice(0, 3) ?? []
                  return (
                    <button
                      key={brain.id}
                      onClick={() => setSelectedBrainId(isActive ? null : brain.id)}
                      className={`flex items-center gap-2 h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
                        isActive
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                      }`}
                    >
                      {colors.length > 0 ? (
                        <span className="flex gap-0.5">
                          {colors.map((c, i) => (
                            <span key={i} className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-black/10" style={{ background: c.hex }} />
                          ))}
                        </span>
                      ) : brain.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={brain.logo_url} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-3 h-3 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                      )}
                      {brain.name}
                    </button>
                  )
                })}
              </div>
            )}

            {noResults ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
                <p className="text-sm font-semibold">Sin resultados para esta marca</p>
                <button onClick={() => setSelectedBrainId(null)} className="text-xs text-primary underline">Ver todas</button>
              </div>
            ) : tab === "estaticos" ? (
              <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3">
                {filteredClones.map((clone) => (
                  <CreativeCard
                    key={clone.id}
                    clone={clone}
                    onOpen={(c, i) => setLightbox({ clone: c, imgIdx: i })}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredScripts.map((clone) => (
                  <ScriptCard key={clone.id} clone={clone} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
