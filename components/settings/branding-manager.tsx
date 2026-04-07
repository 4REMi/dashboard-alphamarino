"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { uploadLogo, removeLogo } from "@/lib/actions/workspace"
import { Anchor, Upload, X, ImageIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface Props {
  initialLogoUrl: string | null
}

export function BrandingManager({ initialLogoUrl }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(initialLogoUrl)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setError("El archivo debe ser menor a 2 MB")
      return
    }
    if (!file.type.startsWith("image/")) {
      setError("Solo se aceptan imágenes (PNG, SVG, JPG, WebP)")
      return
    }
    setError(null)
    setSelectedFile(file)
    setPreview(URL.createObjectURL(file))
  }

  function handleUpload() {
    if (!selectedFile) return
    const fd = new FormData()
    fd.append("logo", selectedFile)
    startTransition(async () => {
      try {
        await uploadLogo(fd)
        setSelectedFile(null)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al subir")
      }
    })
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        await removeLogo()
        setPreview(null)
        setSelectedFile(null)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al eliminar")
      }
    })
  }

  function handleCancel() {
    setPreview(initialLogoUrl)
    setSelectedFile(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const hasUnsavedChange = selectedFile !== null

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Logo de la empresa</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            PNG, SVG, JPG o WebP — máx. 2 MB. Se muestra en la barra lateral.
          </p>
        </div>

        {/* Preview */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
            {preview ? (
              <Image
                src={preview}
                alt="Logo"
                width={64}
                height={64}
                className="object-contain w-full h-full"
                unoptimized
              />
            ) : (
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
                <Anchor className="w-5 h-5 text-white" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
              >
                <ImageIcon className="w-4 h-4" />
                {preview ? "Cambiar logo" : "Subir logo"}
              </Button>
              {preview && !hasUnsavedChange && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemove}
                  disabled={isPending}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                >
                  <X className="w-4 h-4" />
                  Eliminar
                </Button>
              )}
            </div>
            {hasUnsavedChange && (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleUpload} disabled={isPending}>
                  <Upload className="w-4 h-4" />
                  {isPending ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
        />
      </CardContent>
    </Card>
  )
}
