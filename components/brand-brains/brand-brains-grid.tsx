"use client"

import { useState } from "react"
import type { BrandBrain } from "@/lib/types"
import { deleteBrandBrain } from "@/lib/actions/brand-brains"
import { BrandBrainModal } from "@/components/brand-brains/brand-brain-modal"
import { Brain, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import Link from "next/link"

interface Props {
  brains: BrandBrain[]
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

export function BrandBrainsGrid({ brains: initialBrains }: Props) {
  const [brains, setBrains]     = useState(initialBrains)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]   = useState<BrandBrain | null>(null)
  const [menuId, setMenuId]     = useState<string | null>(null)

  function handleSaved(brain: BrandBrain) {
    setBrains((prev) => {
      const idx = prev.findIndex((b) => b.id === brain.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = brain
        return next
      }
      return [brain, ...prev]
    })
    setShowModal(false)
    setEditing(null)
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este Brand Brain? Esta acción no se puede deshacer.")) return
    await deleteBrandBrain(id)
    setBrains((prev) => prev.filter((b) => b.id !== id))
  }

  return (
    <>
      {(showModal || editing) && (
        <BrandBrainModal
          brain={editing ?? undefined}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSaved={handleSaved}
        />
      )}

      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Brain className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Brand Brains</h1>
                <p className="text-sm text-muted-foreground">Contexto completo de cada marca</p>
              </div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo Brand Brain
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {brains.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Brain className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">Sin Brand Brains todavía</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Agrega el contexto completo de una marca para usarlo en creativos, briefs y Paid Media.
                </p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Crear primer Brand Brain
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {brains.map((brain) => {
                const color    = brandColor(brain.name)
                const initials = brain.initials || brain.name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                return (
                  <div
                    key={brain.id}
                    className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-150"
                  >
                    {/* Color bar from brand colors */}
                    <div className="h-1.5 flex">
                      {(brain.brand_colors?.length ? brain.brand_colors : [{ hex: "#e2e8f0" }]).map((c, i) => (
                        <div key={i} className="flex-1" style={{ background: c.hex }} />
                      ))}
                    </div>

                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Logo / initials */}
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${!brain.logo_url ? color : ""}`}>
                          {brain.logo_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={brain.logo_url} alt={brain.name} className="w-full h-full object-cover" />
                            : <span className="text-sm font-bold text-white">{initials}</span>
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/brand-brains/${brain.id}`}
                            className="text-sm font-bold hover:text-primary transition-colors block truncate"
                          >
                            {brain.name}
                          </Link>
                          {brain.industry && (
                            <p className="text-xs text-muted-foreground mt-0.5">{brain.industry}</p>
                          )}
                        </div>

                        {/* Menu */}
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuId((v) => v === brain.id ? null : brain.id) }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {menuId === brain.id && (
                            <div
                              className="absolute right-0 top-full mt-1 w-36 bg-popover border border-border rounded-xl shadow-lg z-20 overflow-hidden py-1"
                              onMouseLeave={() => setMenuId(null)}
                            >
                              <button
                                onClick={() => { setEditing(brain); setMenuId(null) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                Editar
                              </button>
                              <button
                                onClick={() => { handleDelete(brain.id); setMenuId(null) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {brain.usps?.slice(0, 2).map((usp, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground truncate max-w-[140px]">
                            {usp}
                          </span>
                        ))}
                        {(brain.usps?.length ?? 0) > 2 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            +{brain.usps.length - 2}
                          </span>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {brain.language === "es" ? "Español" : brain.language === "en" ? "English" : brain.language}
                        </span>
                        <Link
                          href={`/brand-brains/${brain.id}`}
                          className="text-[10px] text-primary font-medium hover:underline"
                        >
                          Ver detalle →
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
