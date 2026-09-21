"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronLeft, ChevronRight, Download, Link2, ArrowRight, X, Maximize2, Copy, Repeat2, Trash2, LayoutGrid, ImageIcon,
} from "lucide-react"
import type { ImageClone, AdClone, BrandBrainColor, BrandBrain } from "@/lib/types"
import { ImageCloneModal, type RecloneSource } from "@/components/ad-lab/image-clone-modal"
import { deleteImageClone } from "@/lib/actions/image-clone"
import { deleteAdClone } from "@/lib/actions/ad-clone"
import { cn } from "@/lib/utils"

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

const ALL_BRANDS_KEY = "__todas__"
const NO_BRAND_KEY = "__sin_marca__"

interface Props {
  clones:       CloneRich[]
  scriptClones: AdCloneRich[]
  // Todos los Brand Brains que existen, no solo los que ya tienen algún
  // creativo — la pantalla de marcas necesita mostrar también las que
  // todavía no tienen nada, no solo filtrar entre las que sí.
  allBrands:    Pick<BrandBrain, "id" | "name" | "logo_url" | "logo_square_url" | "initials" | "brand_colors">[]
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
  clone, onOpen, onReclone, onDelete,
}: { clone: CloneRich; onOpen: (clone: CloneRich, idx: number) => void; onReclone: (imageUrl: string, clone: CloneRich) => void; onDelete: (clone: CloneRich) => void }) {
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
        <button
          onClick={(e) => { e.stopPropagation(); onReclone(current, clone) }}
          className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/80 transition-colors"
          title="Re-clonar esta imagen"
        >
          <Repeat2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(clone) }}
          className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-destructive transition-colors"
          title="Eliminar"
        >
          <Trash2 className="w-3.5 h-3.5" />
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

function ScriptCard({ clone, onDelete }: { clone: AdCloneRich; onDelete: (clone: AdCloneRich) => void }) {
  const [copiedShare,  setCopiedShare]  = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)
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
    setCopiedShare(true)
    setTimeout(() => setCopiedShare(false), 1500)
  }

  async function copyScript(e: React.MouseEvent) {
    e.stopPropagation()
    const text = lines.map((l, i) => `${i + 1}. ${l.adapted}`).join("\n")
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopiedScript(true)
    setTimeout(() => setCopiedScript(false), 1500)
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
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-border bg-muted/30">
        <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">
          {ad?.page_name ?? "Anuncio"}
        </span>
        <button
          onClick={copyScript}
          className="inline-flex items-center gap-1 h-6 px-2.5 rounded-lg text-[11px] font-medium border border-border hover:bg-muted transition-colors flex-shrink-0"
        >
          {copiedScript
            ? <span className="text-emerald-500">✓</span>
            : <Copy className="w-3 h-3" />
          }
          {copiedScript ? "Copiado" : "Copiar guión"}
        </button>
        <button
          onClick={copyShare}
          className="inline-flex items-center gap-1 h-6 px-2.5 rounded-lg text-[11px] font-medium border border-border hover:bg-muted transition-colors flex-shrink-0"
        >
          {copiedShare
            ? <span className="text-emerald-500">✓</span>
            : <Link2 className="w-3 h-3" />
          }
          {copiedShare ? "Copiado" : "Compartir"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(clone) }}
          className="inline-flex items-center justify-center h-6 w-6 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
          title="Eliminar"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ── Brand Brains landing screen — mismo patrón que SOPs/Ofertas: primero
// una pantalla de tiles por marca (con conteo), clic para entrar a ver
// solo esa. A diferencia de esas dos secciones, aquí el ícono del tile es
// el logo real del Brand Brain (cuadrado si existe, si no el genérico, si
// no iniciales/color) — no un color derivado del nombre, porque cada
// marca ya tiene su propia identidad visual guardada.
function BrandTile({
  label, count, logoUrl, initials, color, onClick,
}: {
  label: string
  count: number
  logoUrl: string | null
  initials: string | null
  color: string | null
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all text-left"
    >
      <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-muted text-muted-foreground flex-shrink-0">
        {logoUrl ? (
          // eslint-disable-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="w-full h-full object-cover" />
        ) : initials ? (
          <span className="text-sm font-bold" style={{ color: color ?? undefined }}>{initials}</span>
        ) : (
          <ImageIcon className="w-5 h-5" />
        )}
      </div>
      <div>
        <p className="font-medium text-sm truncate max-w-[10rem]">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{count} creativo{count !== 1 ? "s" : ""}</p>
      </div>
    </button>
  )
}

// ── Main grid ─────────────────────────────────────────────────

export function CreativesGrid({ clones, scriptClones, allBrands }: Props) {
  const [tab, setTab]               = useState<"estaticos" | "guiones">("estaticos")
  // null = pantalla de marcas. ALL_BRANDS_KEY = todas juntas (como antes).
  // NO_BRAND_KEY = los que no tienen ningún Brand Brain asignado.
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null)
  const [lightbox, setLightbox]     = useState<{ clone: CloneRich; imgIdx: number } | null>(null)
  const [recloneSource, setRecloneSource] = useState<RecloneSource | null>(null)
  const [imageClones, setImageClones]   = useState<CloneRich[]>(clones)
  const [scripts, setScripts]           = useState<AdCloneRich[]>(scriptClones)

  function handleReclone(imageUrl: string, clone: CloneRich) {
    if (!clone.saved_ad?.id) return
    setRecloneSource({
      imageUrl,
      pageName:      clone.saved_ad.page_name,
      savedAdId:     clone.saved_ad.id,
      parentCloneId: clone.id,
    })
  }

  function handleDeleteImageClone(clone: CloneRich) {
    if (!confirm("¿Eliminar este estático? No se puede deshacer.")) return
    setImageClones((prev) => prev.filter((c) => c.id !== clone.id))
    if (lightbox?.clone.id === clone.id) setLightbox(null)
    deleteImageClone(clone.id).catch((err) => alert(`No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`))
  }

  function handleDeleteScript(clone: AdCloneRich) {
    if (!confirm("¿Eliminar este guión adaptado? No se puede deshacer.")) return
    setScripts((prev) => prev.filter((c) => c.id !== clone.id))
    deleteAdClone(clone.id).catch((err) => alert(`No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`))
  }

  const validClones  = imageClones.filter((c) => (c.generated_image_urls?.length ?? 0) > 0)
  const validScripts = scripts.filter((c) => (c.adapted_lines?.length ?? 0) > 0)

  const activeItems: Array<{ brand_brain?: BrainMeta | null }> = tab === "estaticos" ? validClones : validScripts

  // Conteo por marca para el tab activo — incluye marcas con 0 (vienen de
  // allBrands, no solo de los items existentes) y un bucket "Sin marca"
  // para lo que no tiene brand_brain asignado en absoluto.
  const countByBrainId = new Map<string, number>()
  let unbrandedCount = 0
  for (const item of activeItems) {
    if (item.brand_brain?.id) countByBrainId.set(item.brand_brain.id, (countByBrainId.get(item.brand_brain.id) ?? 0) + 1)
    else unbrandedCount++
  }

  const filteredClones  = !selectedBrainId || selectedBrainId === ALL_BRANDS_KEY
    ? validClones
    : selectedBrainId === NO_BRAND_KEY
      ? validClones.filter((c) => !c.brand_brain?.id)
      : validClones.filter((c) => c.brand_brain?.id === selectedBrainId)
  const filteredScripts = !selectedBrainId || selectedBrainId === ALL_BRANDS_KEY
    ? validScripts
    : selectedBrainId === NO_BRAND_KEY
      ? validScripts.filter((c) => !c.brand_brain?.id)
      : validScripts.filter((c) => c.brand_brain?.id === selectedBrainId)

  function switchTab(t: "estaticos" | "guiones") {
    setTab(t)
    setSelectedBrainId(null)
  }

  const isEmpty    = tab === "estaticos" ? validClones.length === 0  : validScripts.length === 0
  const noResults  = tab === "estaticos" ? filteredClones.length === 0 : filteredScripts.length === 0
  const selectedBrandName = selectedBrainId && selectedBrainId !== ALL_BRANDS_KEY && selectedBrainId !== NO_BRAND_KEY
    ? allBrands.find((b) => b.id === selectedBrainId)?.name
    : null

  return (
    <>
      {lightbox && (
        <Lightbox clone={lightbox.clone} imgIdx={lightbox.imgIdx} onClose={() => setLightbox(null)} />
      )}
      {recloneSource && (
        <ImageCloneModal
          recloneSource={recloneSource}
          onClose={() => setRecloneSource(null)}
        />
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
          {selectedBrainId !== null && (
            <button
              onClick={() => setSelectedBrainId(null)}
              className="ml-auto flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" /> Marcas
            </button>
          )}
        </div>

        {isEmpty && allBrands.length === 0 ? (
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
        ) : selectedBrainId === null ? (
          // ── Pantalla de marcas ──
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <BrandTile
              label="Todas"
              count={activeItems.length}
              logoUrl={null}
              initials={null}
              color={null}
              onClick={() => setSelectedBrainId(ALL_BRANDS_KEY)}
            />
            {allBrands.map((brain) => (
              <BrandTile
                key={brain.id}
                label={brain.name}
                count={countByBrainId.get(brain.id) ?? 0}
                logoUrl={brain.logo_square_url ?? brain.logo_url ?? null}
                initials={brain.initials}
                color={brain.brand_colors?.[0]?.hex ?? null}
                onClick={() => setSelectedBrainId(brain.id)}
              />
            ))}
            {unbrandedCount > 0 && (
              <BrandTile
                label="Sin marca"
                count={unbrandedCount}
                logoUrl={null}
                initials={null}
                color={null}
                onClick={() => setSelectedBrainId(NO_BRAND_KEY)}
              />
            )}
          </div>
        ) : (
          <>
            {selectedBrandName && (
              <p className="text-sm font-semibold">{selectedBrandName}</p>
            )}

            {noResults ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
                <p className="text-sm font-semibold">Sin resultados para esta marca</p>
                <button onClick={() => setSelectedBrainId(null)} className="text-xs text-primary underline">← Marcas</button>
              </div>
            ) : tab === "estaticos" ? (
              <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3">
                {filteredClones.map((clone) => (
                  <CreativeCard
                    key={clone.id}
                    clone={clone}
                    onOpen={(c, i) => setLightbox({ clone: c, imgIdx: i })}
                    onReclone={handleReclone}
                    onDelete={handleDeleteImageClone}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredScripts.map((clone) => (
                  <ScriptCard key={clone.id} clone={clone} onDelete={handleDeleteScript} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
