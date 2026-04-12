"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { createAsset, updateAsset, deleteAsset, generateAssetCopy } from "@/lib/actions/creatives"
import { PRODUCTION_STATUS_COLORS, VERDICT_COLORS } from "@/lib/constants/creatives"
import type { CreativeAsset, CreativeConcept } from "@/lib/types"
import { ExternalLink, Trash2, Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const FORMATS   = ["Static", "Carousel", "Video B-roll+VO", "Video UGC", "Story", "Reel"]
const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Pinterest Ads"]
const STATUSES  = ["Pending", "In Production", "In Review", "Approved", "Published"] as const
const VERDICTS  = ["Winner", "Scale", "Iterate", "Archive"] as const

interface AssetModalProps {
  projectId: string
  cycleId: string | null
  asset?: CreativeAsset | null
  concepts: CreativeConcept[]
  defaultConceptId?: string | null
  isAdminOrSubadmin: boolean
  open: boolean
  onClose: () => void
}

export function AssetModal({ projectId, cycleId, asset, concepts, defaultConceptId, isAdminOrSubadmin, open, onClose }: AssetModalProps) {
  const isEdit = !!asset
  const [isPending, startTransition] = useTransition()
  const [isGenerating, startGenerate] = useTransition()

  // Controlled fields for AI generation
  const [selectedConceptId, setSelectedConceptId] = useState(
    asset?.concept_id ?? defaultConceptId ?? ""
  )
  const [selectedFormat, setSelectedFormat]     = useState(asset?.format ?? "")
  const [selectedPlatform, setSelectedPlatform] = useState(asset?.platform ?? "")
  const [hook, setHook] = useState(asset?.hook ?? "")
  const [copy, setCopy] = useState(asset?.copy ?? "")
  const [cta,  setCta]  = useState(asset?.cta  ?? "")

  function handleGenerate() {
    if (!selectedConceptId) return
    startGenerate(async () => {
      const result = await generateAssetCopy(
        projectId,
        selectedConceptId,
        selectedFormat || null,
        selectedPlatform || null,
      )
      setHook(result.hook)
      setCopy(result.copy)
      setCta(result.cta)
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (cycleId) fd.set("cycle_id", cycleId)
    // Override with controlled field values
    fd.set("hook", hook)
    fd.set("copy", copy)
    fd.set("cta",  cta)
    startTransition(async () => {
      if (isEdit) {
        await updateAsset(asset.id, projectId, fd)
      } else {
        await createAsset(projectId, fd)
      }
      onClose()
    })
  }

  function handleDelete() {
    if (!asset) return
    if (!confirm("¿Eliminar este asset?")) return
    startTransition(async () => {
      await deleteAsset(asset.id, projectId)
      onClose()
    })
  }

  const fieldCls = "w-full text-sm border rounded px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
  const labelCls = "text-xs font-medium text-muted-foreground"
  const canGenerate = !!selectedConceptId && isAdminOrSubadmin

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Asset" : "Nuevo Asset"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Concept + Format + Platform */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Concepto padre</label>
              <select
                name="concept_id"
                value={selectedConceptId}
                onChange={(e) => setSelectedConceptId(e.target.value)}
                className={fieldCls}
              >
                <option value="">Sin concepto</option>
                {concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.angle_type ?? "Sin ángulo"} · {c.target_persona.slice(0, 30)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Formato</label>
              <select
                name="format"
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                className={fieldCls}
              >
                <option value="">—</option>
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Plataforma</label>
              <select
                name="platform"
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className={fieldCls}
              >
                <option value="">—</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Variant + Iteration + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Variante</label>
              <input name="variant" defaultValue={asset?.variant ?? ""} placeholder="A, B, C…" className={fieldCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Iteración</label>
              <input name="iteration" defaultValue={asset?.iteration ?? ""} placeholder="v1, v2…" className={fieldCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Estado</label>
              <select name="production_status" defaultValue={asset?.production_status ?? "Pending"} className={fieldCls}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Copy section ── */}
          <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
            {/* Section header with AI button */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Copy</p>
              {canGenerate && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50 transition-colors"
                >
                  {isGenerating
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Sparkles className="w-3.5 h-3.5" />
                  }
                  {isGenerating ? "Generando…" : "Generar con IA"}
                </button>
              )}
              {!canGenerate && !selectedConceptId && (
                <span className="text-xs text-muted-foreground">Selecciona un concepto para generar con IA</span>
              )}
            </div>

            {/* Hook */}
            <div className="space-y-1">
              <label className={labelCls}>Hook</label>
              <textarea
                name="hook"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                rows={2}
                placeholder="Primera línea del anuncio"
                className={cn(fieldCls, isGenerating && "opacity-50")}
                disabled={isGenerating}
              />
            </div>

            {/* Copy */}
            <div className="space-y-1">
              <label className={labelCls}>Copy</label>
              <textarea
                name="copy"
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                rows={4}
                placeholder="Cuerpo del anuncio"
                className={cn(fieldCls, isGenerating && "opacity-50")}
                disabled={isGenerating}
              />
            </div>

            {/* CTA */}
            <div className="space-y-1">
              <label className={labelCls}>CTA</label>
              <input
                name="cta"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Ej. Comprar ahora, Ver más"
                className={cn(fieldCls, isGenerating && "opacity-50")}
                disabled={isGenerating}
              />
            </div>
          </div>

          {/* Asset URL */}
          <div className="space-y-1">
            <label className={labelCls}>Link del asset</label>
            <div className="relative">
              <input name="asset_url" defaultValue={asset?.asset_url ?? ""} placeholder="Drive, Frame.io, Dropbox…" className={cn(fieldCls, "pr-8")} />
              {asset?.asset_url && (
                <a href={asset.asset_url} target="_blank" rel="noopener noreferrer" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Performance metrics — admin only */}
          {isAdminOrSubadmin && (
            <div className="border-t pt-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground">Métricas de performance</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: "ctr",   label: "CTR (%)",  val: asset?.ctr },
                  { name: "cpc",   label: "CPC ($)",  val: asset?.cpc },
                  { name: "cpm",   label: "CPM ($)",  val: asset?.cpm },
                  { name: "roas",  label: "ROAS",     val: asset?.roas },
                  { name: "cpa",   label: "CPA ($)",  val: asset?.cpa },
                  { name: "spend", label: "Spend ($)", val: asset?.spend },
                ].map(({ name, label, val }) => (
                  <div key={name} className="space-y-1">
                    <label className={labelCls}>{label}</label>
                    <input type="number" step="0.01" name={name} defaultValue={val ?? ""} placeholder="0" className={fieldCls} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={labelCls}>Resultados</label>
                  <input type="number" name="results" defaultValue={asset?.results ?? ""} placeholder="0" className={fieldCls} />
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Tipo de resultado</label>
                  <input name="results_type" defaultValue={asset?.results_type ?? ""} placeholder="ventas, leads, clics…" className={fieldCls} />
                </div>
              </div>

              {/* Verdict */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={labelCls}>Veredicto</label>
                  <select name="verdict" defaultValue={asset?.verdict ?? ""} className={fieldCls}>
                    <option value="">Sin veredicto</option>
                    {VERDICTS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Notas de veredicto</label>
                  <textarea name="verdict_notes" defaultValue={asset?.verdict_notes ?? ""} rows={2} placeholder="Qué funcionó, qué cambiar" className={fieldCls} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between pt-2">
            <div>
              {isEdit && isAdminOrSubadmin && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={isPending}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={isPending || isGenerating || !isAdminOrSubadmin}>
                {isPending ? "Guardando..." : isEdit ? "Guardar" : "Crear asset"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
