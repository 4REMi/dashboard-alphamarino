"use client"

import { useState, useTransition, useRef } from "react"
import type { BrandBrain, BrandBrainAsset, BrandLine } from "@/lib/types"
import { deleteBrandBrain, addBrandBrainAsset, deleteBrandBrainAsset, createBrandLine, updateBrandLine, deleteBrandLine } from "@/lib/actions/brand-brains"
import { BrandBrainModal } from "@/components/brand-brains/brand-brain-modal"
import {
  ArrowLeft, Brain, Pencil, Trash2, Upload, X,
  Loader2, Image as ImageIcon, Film, Download, Plus, Package,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface Props {
  brain: BrandBrain
  canEdit: boolean
  initialLines?: BrandLine[]
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  )
}

function TagList({ items }: { items: string[] }) {
  if (!items?.length) return <p className="text-xs text-muted-foreground">—</p>
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  )
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

const LINE_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#10b981"]

export function BrandBrainDetail({ brain: initialBrain, canEdit, initialLines = [] }: Props) {
  const [brain, setBrain]       = useState(initialBrain)
  const [assets, setAssets]     = useState<BrandBrainAsset[]>(initialBrain.assets ?? [])
  const [lines, setLines]       = useState<BrandLine[]>(initialLines)
  const [editingLine, setEditingLine] = useState<BrandLine | null>(null)
  const [showNewLine, setShowNewLine] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router       = useRouter()

  const color    = brandColor(brain.name)
  const initials = brain.initials || brain.name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)

  function handleSaved(updated: BrandBrain) {
    setBrain({ ...updated, assets })
    setShowEdit(false)
  }

  function handleExport() {
    const payload = {
      name:               brain.name,
      industry:           brain.industry,
      language:           brain.language,
      tone_of_voice:      brain.tone_of_voice,
      description:        brain.description,
      target_audience:    brain.target_audience,
      usps:               brain.usps,
      key_benefits:       brain.key_benefits,
      pain_points:        brain.pain_points,
      key_features:       brain.key_features,
      ctas:               brain.ctas,
      additional_context: brain.additional_context,
      brand_colors:       brain.brand_colors,
      logo_url:           brain.logo_url,
      logo_square_url:    brain.logo_square_url,
      logo_horizontal_url: brain.logo_horizontal_url,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `${brain.name.replace(/\s+/g, "-").toLowerCase()}-brain.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar este Brand Brain permanentemente?")) return
    await deleteBrandBrain(brain.id)
    router.push("/brand-brains")
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    startTransition(async () => {
      for (const file of files) {
        const fd = new FormData()
        fd.set("file", file)
        const asset = await addBrandBrainAsset(brain.id, fd)
        setAssets((prev) => [...prev, asset])
      }
    })
    e.target.value = ""
  }

  async function handleDeleteAsset(asset: BrandBrainAsset) {
    if (!confirm("¿Eliminar este asset?")) return
    await deleteBrandBrainAsset(asset.id, brain.id)
    setAssets((prev) => prev.filter((a) => a.id !== asset.id))
  }

  return (
    <>
      {showEdit && (
        <BrandBrainModal brain={brain} onClose={() => setShowEdit(false)} onSaved={handleSaved} />
      )}

      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href="/brand-brains"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">{brain.name}</h1>
              {brain.industry && <p className="text-sm text-muted-foreground">{brain.industry}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Exportar como JSON"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar
              </button>
              {canEdit && (
                <>
                  <button
                    onClick={() => setShowEdit(true)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={handleDelete}
                    className="h-8 px-3 rounded-lg border border-destructive/30 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">

            {/* Left col: identity */}
            <div className="space-y-6">
              {/* Logo + colors */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 ${!brain.logo_url ? color : ""}`}>
                    {brain.logo_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={brain.logo_url} alt={brain.name} className="w-full h-full object-cover" />
                      : <span className="text-lg font-bold text-white">{initials}</span>
                    }
                  </div>
                  <div>
                    <p className="font-bold">{brain.name}</p>
                    {brain.initials && <p className="text-xs text-muted-foreground font-mono">{brain.initials}</p>}
                  </div>
                </div>

                {(brain.brand_colors?.length > 0) && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Colores</p>
                    <div className="space-y-1.5">
                      {brain.brand_colors.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md border border-border/50 flex-shrink-0" style={{ background: c.hex }} />
                          <span className="text-xs font-mono">{c.hex}</span>
                          <span className="text-xs text-muted-foreground">{c.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t border-border/50">
                  {brain.language && <span>{brain.language === "es" ? "Español" : brain.language === "en" ? "English" : brain.language}</span>}
                </div>
              </div>

              {/* Description */}
              {brain.description && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <Section title="Descripción">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{brain.description}</p>
                  </Section>
                </div>
              )}

              {/* Brand logos */}
              {(brain.logo_square_url || brain.logo_horizontal_url) && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Logos de marca</p>
                  {brain.logo_square_url && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5">Cuadrado</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={brain.logo_square_url} alt="Logo cuadrado" className="w-16 h-16 rounded-lg object-contain border border-border bg-muted" />
                    </div>
                  )}
                  {brain.logo_horizontal_url && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5">Horizontal</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={brain.logo_horizontal_url} alt="Logo horizontal" className="h-12 max-w-full rounded-lg object-contain border border-border bg-muted px-2" />
                    </div>
                  )}
                </div>
              )}

              {/* Target audience */}
              {brain.target_audience && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <Section title="Target Audience">
                    <TagList items={brain.target_audience.split("\n").filter(Boolean)} />
                  </Section>
                </div>
              )}

              {/* Tone of voice */}
              {brain.tone_of_voice && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <Section title="Tono de voz">
                    <p className="text-sm leading-relaxed">{brain.tone_of_voice}</p>
                  </Section>
                </div>
              )}
            </div>

            {/* Right col: marketing data */}
            <div className="md:col-span-2 space-y-4">
              {brain.usps?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <Section title="Unique Selling Points"><TagList items={brain.usps} /></Section>
                </div>
              )}
              {brain.key_benefits?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <Section title="Key Benefits"><TagList items={brain.key_benefits} /></Section>
                </div>
              )}
              {brain.pain_points?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <Section title="Pain Points"><TagList items={brain.pain_points} /></Section>
                </div>
              )}
              {brain.key_features?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <Section title="Key Features"><TagList items={brain.key_features} /></Section>
                </div>
              )}
              {brain.ctas?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <Section title="CTAs y Ofertas"><TagList items={brain.ctas} /></Section>
                </div>
              )}
              {brain.additional_context && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <Section title="Contexto adicional">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{brain.additional_context}</p>
                  </Section>
                </div>
              )}

              {/* Brand Lines */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Líneas de Producto / Servicio
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => setShowNewLine(true)}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Nueva línea
                    </button>
                  )}
                </div>

                {showNewLine && (
                  <BrandLineForm
                    brainId={brain.id}
                    suggestedColor={LINE_COLORS[lines.length % LINE_COLORS.length]}
                    onSaved={(line) => { setLines((prev) => [...prev, line]); setShowNewLine(false) }}
                    onCancel={() => setShowNewLine(false)}
                  />
                )}

                {editingLine && (
                  <BrandLineForm
                    brainId={brain.id}
                    line={editingLine}
                    onSaved={(updated) => {
                      setLines((prev) => prev.map((l) => l.id === updated.id ? updated : l))
                      setEditingLine(null)
                    }}
                    onCancel={() => setEditingLine(null)}
                  />
                )}

                {lines.length === 0 && !showNewLine ? (
                  <div
                    onClick={() => canEdit && setShowNewLine(true)}
                    className={`border-2 border-dashed border-border rounded-lg py-6 flex flex-col items-center gap-2 text-center ${canEdit ? "cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors" : ""}`}
                  >
                    <Package className="w-5 h-5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      {canEdit ? "Agrega líneas de producto o servicio para contextualizar tus creativos" : "Sin líneas definidas"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lines.map((line) => (
                      <div key={line.id} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors group">
                        <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: line.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{line.name}</p>
                          {line.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{line.description}</p>}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {line.usps?.map((u, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{u}</span>
                            ))}
                            {line.pain_points?.map((p, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">{p}</span>
                            ))}
                            {line.keywords?.map((k, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{k}</span>
                            ))}
                          </div>
                        </div>
                        {canEdit && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => setEditingLine(line)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(`¿Eliminar "${line.name}"?`)) return
                                await deleteBrandLine(line.id, brain.id)
                                setLines((prev) => prev.filter((l) => l.id !== line.id))
                              }}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assets */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assets</p>
                  {canEdit && (
                    <>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isPending}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        Subir
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </>
                  )}
                </div>

                {assets.length === 0 ? (
                  <div
                    onClick={() => canEdit && fileInputRef.current?.click()}
                    className={`border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-center ${canEdit ? "cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors" : ""}`}
                  >
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      {canEdit ? "Sube imágenes o videos para usar en creativos" : "Sin assets todavía"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {assets.map((asset) => (
                      <div key={asset.id} className="group relative aspect-square rounded-lg overflow-hidden bg-muted border border-border">
                        {asset.type === "video" ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-6 h-6 text-muted-foreground" />
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset.url} alt={asset.name ?? ""} className="w-full h-full object-cover" />
                        )}
                        {asset.type === "image" && (
                          <div className="absolute top-1 left-1">
                            <ImageIcon className="w-3 h-3 text-white/60" />
                          </div>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => handleDeleteAsset(asset)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Brand Line inline form ──────────────────────────────────

function BrandLineForm({
  brainId,
  line,
  suggestedColor,
  onSaved,
  onCancel,
}: {
  brainId: string
  line?: BrandLine
  suggestedColor?: string
  onSaved: (line: BrandLine) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(line?.name ?? "")
  const [description, setDescription] = useState(line?.description ?? "")
  const [usps, setUsps] = useState(line?.usps?.join("\n") ?? "")
  const [painPoints, setPainPoints] = useState(line?.pain_points?.join("\n") ?? "")
  const [keywords, setKeywords] = useState(line?.keywords?.join(", ") ?? "")
  const [color, setColor] = useState(line?.color ?? suggestedColor ?? "#6366f1")
  const [isPending, startTransition] = useTransition()

  const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
  const labelCls = "text-[11px] font-medium text-muted-foreground mb-1 block"

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(async () => {
      const fields = {
        name: name.trim(),
        description: description.trim() || null,
        usps: usps.split("\n").map((s) => s.trim()).filter(Boolean),
        pain_points: painPoints.split("\n").map((s) => s.trim()).filter(Boolean),
        keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
        color,
      }
      if (line) {
        await updateBrandLine(line.id, brainId, fields)
        onSaved({ ...line, ...fields, pain_points: fields.pain_points, updated_at: new Date().toISOString() })
      } else {
        const created = await createBrandLine(brainId, fields)
        onSaved(created)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="border border-primary/30 rounded-lg p-4 mb-3 bg-primary/5 space-y-3">
      <div className="flex items-center gap-3">
        <div>
          <label className={labelCls}>Color</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Skincare Anti-edad" className={inputCls} required />
        </div>
      </div>
      <div>
        <label className={labelCls}>Descripción</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descripción del producto o servicio" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>USPs (uno por línea)</label>
          <textarea value={usps} onChange={(e) => setUsps(e.target.value)} placeholder="Ingredientes naturales&#10;Sin parabenos" className={cn(inputCls, "h-20 resize-none")} />
        </div>
        <div>
          <label className={labelCls}>Pain Points (uno por línea)</label>
          <textarea value={painPoints} onChange={(e) => setPainPoints(e.target.value)} placeholder="Piel reseca&#10;Manchas por el sol" className={cn(inputCls, "h-20 resize-none")} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Keywords (separadas por coma)</label>
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="anti-edad, serum, colágeno" className={inputCls} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-8 px-4 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={isPending || !name.trim()} className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5">
          {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
          {line ? "Guardar" : "Crear"}
        </button>
      </div>
    </form>
  )
}
