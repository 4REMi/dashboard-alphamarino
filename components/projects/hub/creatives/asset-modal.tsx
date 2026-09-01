"use client"

import { useRef, useState, useTransition, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { createAsset, updateAsset, deleteAsset, toggleClientVisible } from "@/lib/actions/creatives"
import { getImageClonesByBrandBrain } from "@/lib/actions/image-clone"
import { createClient } from "@/lib/supabase/client"
import type { CreativeAsset, BrandBrain, ImageClone } from "@/lib/types"
import { Trash2, Upload, Eye, EyeOff, ImageIcon, Film, X, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Pinterest Ads"]
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_VIDEO_BYTES = 150 * 1024 * 1024

function captureVideoThumbnail(blobUrl: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.src = blobUrl
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration * 0.1)
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext("2d")?.drawImage(video, 0, 0)
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82)
      } catch {
        resolve(null)
      }
    }
    video.onerror = () => resolve(null)
  })
}

interface AssetModalProps {
  projectId: string
  cycleId: string | null
  conceptId: string
  briefId?: string | null
  asset?: CreativeAsset | null
  isAdminOrSubadmin: boolean
  canManageAssets?: boolean
  brandBrains?: BrandBrain[]
  open: boolean
  onRefresh?: () => void
  onClose: () => void
}

type Source = "upload" | "bank"

export function AssetModal({
  projectId, cycleId, conceptId, briefId, asset,
  isAdminOrSubadmin, canManageAssets, brandBrains = [], open, onRefresh, onClose,
}: AssetModalProps) {
  const canUpload = canManageAssets ?? isAdminOrSubadmin
  const isEdit = !!asset
  const inputRef = useRef<HTMLInputElement>(null)
  const thumbnailBlobRef = useRef<Blob | null>(null)

  const [isPending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(asset?.thumbnail_path || asset?.file_path || asset?.asset_url || null)
  const [platform, setPlatform] = useState(asset?.platform ?? "")
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const isVideo = file?.type.startsWith("video/") ?? asset?.file_type === "video"

  // ── "Elegir del banco de creativos" — pick an already-generated image
  // clone instead of uploading a file. Only offered when creating (not
  // editing) and only when there's at least one Brand Brain to browse.
  const [source, setSource]                 = useState<Source>("upload")
  const [bankBrainId, setBankBrainId]       = useState("")
  const [bankClones, setBankClones]         = useState<ImageClone[]>([])
  const [loadingBank, setLoadingBank]       = useState(false)
  const [selectedCloneUrl, setSelectedCloneUrl] = useState<string | null>(null)

  function selectBankBrain(brainId: string) {
    setBankBrainId(brainId)
    setSelectedCloneUrl(null)
    setBankClones([])
    if (!brainId) return
    setLoadingBank(true)
    getImageClonesByBrandBrain(brainId)
      .then(setBankClones)
      .catch(() => setBankClones([]))
      .finally(() => setLoadingBank(false))
  }

  const existingUrl = asset?.file_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${asset.file_path}`
    : asset?.asset_url

  function validateAndSet(f: File) {
    setUploadError(null)
    const max = f.type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (f.size > max) {
      setUploadError(`Archivo supera el límite (${f.type.startsWith("video/") ? "150 MB" : "20 MB"})`)
      return
    }
    setFile(f)
    thumbnailBlobRef.current = null

    const blobUrl = URL.createObjectURL(f)
    setPreview(blobUrl)

    if (f.type.startsWith("video/")) {
      captureVideoThumbnail(blobUrl).then((blob) => {
        thumbnailBlobRef.current = blob
      })
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) validateAndSet(f)
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) validateAndSet(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const fd = new FormData()
      if (cycleId) fd.set("cycle_id", cycleId)
      fd.set("concept_id", conceptId)
      if (briefId) fd.set("brief_id", briefId)
      fd.set("platform", platform)

      if (source === "bank" && selectedCloneUrl) {
        // asset_url only — thumbnail_path/file_path are always resolved as
        // paths *within* the creative-assets bucket elsewhere in the app, so
        // pointing thumbnail_path at this (ad-lab bucket) URL would break
        // every thumbnail lookup that prepends the creative-assets base URL.
        fd.set("asset_url", selectedCloneUrl)
        fd.set("file_type", "image")
        fd.set("format", "Imagen")
        setUploadProgress("Guardando…")
        if (isEdit && asset) {
          await updateAsset(asset.id, projectId, fd)
        } else {
          await createAsset(projectId, fd)
        }
        onRefresh?.()
        onClose()
        return
      }

      if (file) {
        setUploadProgress("Subiendo archivo…")
        const supabase = createClient()
        const ext = (file.name.split(".").pop() ?? (file.type.startsWith("video/") ? "mp4" : "jpg")).slice(0, 4)
        const uuid = crypto.randomUUID()
        const fileType = file.type.startsWith("video/") ? "video" : "image"

        const path = `${projectId}/${uuid}/${fileType}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from("creative-assets")
          .upload(path, file, { contentType: file.type, upsert: false })
        if (uploadErr) throw new Error(`Error al subir: ${uploadErr.message}`)

        fd.set("file_path", path)
        fd.set("file_type", fileType)
        fd.set("format", fileType === "video" ? "Video" : "Imagen")

        if (fileType === "video" && thumbnailBlobRef.current) {
          setUploadProgress("Generando miniatura…")
          const thumbPath = `${projectId}/${uuid}/thumbnail.jpg`
          const { error: thumbErr } = await supabase.storage
            .from("creative-assets")
            .upload(thumbPath, thumbnailBlobRef.current, { contentType: "image/jpeg", upsert: false })
          if (!thumbErr) fd.set("thumbnail_path", thumbPath)
        } else if (fileType === "image") {
          fd.set("thumbnail_path", path)
        }

        const { data: { publicUrl } } = supabase.storage.from("creative-assets").getPublicUrl(path)
        fd.set("asset_url", publicUrl)
      }

      setUploadProgress("Guardando…")

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
    if (!asset || !confirm("¿Eliminar este asset?")) return
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
          {/* Source toggle — only when creating, and only if there's a bank to pick from */}
          {!isEdit && brandBrains.length > 0 && (
            <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
              {([
                { key: "upload" as const, label: "Subir archivo" },
                { key: "bank" as const, label: "Banco de creativos" },
              ]).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSource(t.key)}
                  className={cn(
                    "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
                    source === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {source === "bank" && !isEdit ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Brand Brain</Label>
                <select
                  value={bankBrainId}
                  onChange={(e) => selectBankBrain(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar</option>
                  {brandBrains.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {loadingBank && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Cargando imágenes…
                </div>
              )}

              {!loadingBank && bankBrainId && bankClones.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Esta marca todavía no tiene clonaciones guardadas.
                </p>
              )}

              {bankClones.length > 0 && (
                <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto">
                  {bankClones.flatMap((clone) =>
                    (clone.generated_image_urls ?? []).map((url) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setSelectedCloneUrl(url)}
                        className={cn(
                          "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                          selectedCloneUrl === url ? "border-violet-500 ring-1 ring-violet-400" : "border-transparent opacity-80 hover:opacity-100"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        {selectedCloneUrl === url && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center">
                            <Sparkles className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Drop zone / preview */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !isPending && inputRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl cursor-pointer transition-colors overflow-hidden",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                  (preview || existingUrl) ? "h-48" : "h-36",
                )}
              >
                {(preview || existingUrl) ? (
                  <>
                    {isVideo ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                        {preview && !preview.startsWith("http") ? (
                          <video src={preview} className="max-h-full max-w-full object-contain" muted />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset?.thumbnail_path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creative-assets/${asset.thumbnail_path}` : preview || ""} alt="" className="max-h-full max-w-full object-contain" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Film className="w-8 h-8 text-white/80 drop-shadow-lg" />
                        </div>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview || existingUrl || ""} alt="" className="absolute inset-0 w-full h-full object-contain" />
                    )}
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full">
                      Cambiar archivo
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Arrastra o haz clic para subir</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Imagen (20 MB) o Video (150 MB)</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {uploadError && (
                <p className="text-xs text-destructive">{uploadError}</p>
              )}
            </>
          )}

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

          {uploadProgress && isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {uploadProgress}
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            {isEdit && canUpload && (
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={isPending} className="text-destructive hover:text-destructive mr-auto">
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Eliminar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              type="submit"
              disabled={
                isPending || !canUpload ||
                (!isEdit && source === "upload" && !file) ||
                (!isEdit && source === "bank" && !selectedCloneUrl)
              }
            >
              {isPending ? "Guardando…" : isEdit ? "Guardar" : "Subir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
