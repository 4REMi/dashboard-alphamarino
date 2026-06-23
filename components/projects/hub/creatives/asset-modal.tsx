"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createAsset, updateAsset, deleteAsset, toggleClientVisible } from "@/lib/actions/creatives"
import type { CreativeAsset, CreativeConcept, CreativeBrief } from "@/lib/types"
import { ExternalLink, Trash2, Upload, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Pinterest Ads"]
const FORMATS = ["Video", "Imagen"] as const

interface AssetModalProps {
  projectId: string
  cycleId: string | null
  asset?: CreativeAsset | null
  concepts: CreativeConcept[]
  briefs?: CreativeBrief[]
  defaultConceptId?: string | null
  isAdminOrSubadmin: boolean
  open: boolean
  onRefresh?: () => void
  onClose: () => void
}

export function AssetModal({
  projectId, cycleId, asset, concepts, briefs = [], defaultConceptId,
  isAdminOrSubadmin, open, onRefresh, onClose,
}: AssetModalProps) {
  const isEdit = !!asset
  const [isPending, startTransition] = useTransition()

  const [selectedConceptId, setSelectedConceptId] = useState(asset?.concept_id ?? defaultConceptId ?? "")
  const [selectedBriefId, setSelectedBriefId] = useState(asset?.brief_id ?? "")
  const [fileUrl, setFileUrl] = useState(asset?.asset_url ?? "")
  const [format, setFormat] = useState(asset?.format ?? "")
  const [platform, setPlatform] = useState(asset?.platform ?? "")

  const conceptBriefs = briefs.filter((b) => b.concept_id === selectedConceptId)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const fd = new FormData()
      if (cycleId) fd.set("cycle_id", cycleId)
      if (selectedConceptId) fd.set("concept_id", selectedConceptId)
      if (selectedBriefId) fd.set("brief_id", selectedBriefId)
      fd.set("asset_url", fileUrl)
      fd.set("format", format)
      fd.set("platform", platform)

      if (isEdit && asset) {
        await updateAsset(asset.id, projectId, fd)
      } else {
        await createAsset(projectId, fd)
      }
      onRefresh?.()
      onClose()
    })
  }

  function handleDelete() {
    if (!asset) return
    startTransition(async () => {
      await deleteAsset(asset.id, projectId)
      onRefresh?.()
      onClose()
    })
  }

  function handleToggleVisible() {
    if (!asset) return
    startTransition(async () => {
      await toggleClientVisible(asset.id, projectId, !asset.client_visible)
      onRefresh?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {isEdit ? "Editar Asset" : "Subir Asset"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Concept */}
          <div className="space-y-1.5">
            <Label>Concepto</Label>
            <select
              value={selectedConceptId}
              onChange={(e) => { setSelectedConceptId(e.target.value); setSelectedBriefId("") }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Sin concepto</option>
              {concepts.map((c) => (
                <option key={c.id} value={c.id}>{c.name ?? c.angle_type ?? c.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>

          {/* Brief (filtered by concept) */}
          {conceptBriefs.length > 0 && (
            <div className="space-y-1.5">
              <Label>Brief asociado (opcional)</Label>
              <select
                value={selectedBriefId}
                onChange={(e) => setSelectedBriefId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Sin brief</option>
                {conceptBriefs.map((b) => (
                  <option key={b.id} value={b.id}>
                    Brief — {b.brand_brain?.name ?? "Sin brand"} ({new Date(b.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* File URL */}
          <div className="space-y-1.5">
            <Label>URL del asset</Label>
            <div className="flex gap-2">
              <Input
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1"
              />
              {fileUrl && (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center">
                  <Button type="button" variant="ghost" size="sm" className="h-9 px-2">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Format */}
          <div className="space-y-1.5">
            <Label>Formato</Label>
            <div className="flex gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition-colors",
                    format === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/30"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div className="space-y-1.5">
            <Label>Plataforma</Label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seleccionar</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Client visibility toggle (edit mode, admin only) */}
          {isEdit && isAdminOrSubadmin && asset && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
              <div>
                <p className="text-sm font-medium">Visible para cliente</p>
                <p className="text-xs text-muted-foreground">
                  {asset.client_visible ? "El cliente puede ver y revisar" : "Oculto del portal del cliente"}
                </p>
              </div>
              <Button
                type="button"
                variant={asset.client_visible ? "default" : "outline"}
                size="sm"
                onClick={handleToggleVisible}
                disabled={isPending}
              >
                {asset.client_visible ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
                {asset.client_visible ? "Visible" : "Oculto"}
              </Button>
            </div>
          )}

          {/* Client feedback display */}
          {isEdit && asset?.client_status === "changes_requested" && asset.client_feedback && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
              <p className="font-medium text-amber-800 text-xs mb-1">Cambios solicitados por el cliente:</p>
              <p className="text-amber-700">{asset.client_feedback}</p>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            {isEdit && isAdminOrSubadmin && (
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={isPending} className="text-destructive hover:text-destructive mr-auto">
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Eliminar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending || !isAdminOrSubadmin}>
              {isEdit ? "Guardar" : "Subir asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
