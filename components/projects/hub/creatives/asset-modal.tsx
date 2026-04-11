"use client"

import { useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { createAsset, updateAsset, deleteAsset } from "@/lib/actions/creatives"
import { PRODUCTION_STATUS_COLORS, VERDICT_COLORS } from "@/lib/constants/creatives"
import type { CreativeAsset, CreativeConcept } from "@/lib/types"
import { ExternalLink, Trash2 } from "lucide-react"
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
  isAdminOrSubadmin: boolean
  open: boolean
  onClose: () => void
}

export function AssetModal({ projectId, cycleId, asset, concepts, isAdminOrSubadmin, open, onClose }: AssetModalProps) {
  const isEdit = !!asset
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (cycleId) fd.set("cycle_id", cycleId)
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
              <select name="concept_id" defaultValue={asset?.concept_id ?? ""} className={fieldCls}>
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
              <select name="format" defaultValue={asset?.format ?? ""} className={fieldCls}>
                <option value="">—</option>
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Plataforma</label>
              <select name="platform" defaultValue={asset?.platform ?? ""} className={fieldCls}>
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

          {/* Hook */}
          <div className="space-y-1">
            <label className={labelCls}>Hook</label>
            <textarea name="hook" defaultValue={asset?.hook ?? ""} rows={2} placeholder="Primera línea del anuncio" className={fieldCls} />
          </div>

          {/* Copy */}
          <div className="space-y-1">
            <label className={labelCls}>Copy</label>
            <textarea name="copy" defaultValue={asset?.copy ?? ""} rows={3} placeholder="Cuerpo del anuncio" className={fieldCls} />
          </div>

          {/* CTA + Asset URL */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelCls}>CTA</label>
              <input name="cta" defaultValue={asset?.cta ?? ""} placeholder="Ej. Comprar ahora, Ver más" className={fieldCls} />
            </div>
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
          </div>

          {/* Performance metrics — admin only */}
          {isAdminOrSubadmin && (
            <div className="border-t pt-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground">Métricas de performance</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: "ctr",     label: "CTR (%)",    val: asset?.ctr },
                  { name: "cpc",     label: "CPC ($)",    val: asset?.cpc },
                  { name: "cpm",     label: "CPM ($)",    val: asset?.cpm },
                  { name: "roas",    label: "ROAS",       val: asset?.roas },
                  { name: "cpa",     label: "CPA ($)",    val: asset?.cpa },
                  { name: "spend",   label: "Spend ($)",  val: asset?.spend },
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
              <Button type="submit" size="sm" disabled={isPending || !isAdminOrSubadmin}>
                {isPending ? "Guardando..." : isEdit ? "Guardar" : "Crear asset"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
