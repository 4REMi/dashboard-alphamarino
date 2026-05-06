"use client"

import { useRef, useState, useCallback } from "react"
import { X, Upload, Loader2, ImageIcon, Film, ChevronDown } from "lucide-react"
import type { AdBoard, SavedAd } from "@/lib/types"
import { saveUploadedAdRecord } from "@/lib/actions/ad-lab"
import { createClient } from "@/lib/supabase/client"

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
const MAX_IMAGE_BYTES = 20 * 1024 * 1024   // 20 MB
const MAX_VIDEO_BYTES = 150 * 1024 * 1024  // 150 MB

interface Props {
  boards: AdBoard[]
  defaultBoardId?: string
  onUploaded?: (ad: SavedAd) => void
  onClose: () => void
}

export function UploadAdModal({ boards, defaultBoardId, onUploaded, onClose }: Props) {
  const inputRef   = useRef<HTMLInputElement>(null)
  const [file,     setFile]     = useState<File | null>(null)
  const [preview,  setPreview]  = useState<string | null>(null)
  const [name,     setName]     = useState("")
  const [boardId,  setBoardId]  = useState(defaultBoardId ?? "")
  const [dragOver, setDragOver] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  const isVideo = file?.type.startsWith("video/") ?? false

  function validateAndSet(f: File) {
    setError(null)
    const max = f.type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (f.size > max) {
      setError(`El archivo supera el límite (${f.type.startsWith("video/") ? "150 MB" : "20 MB"})`)
      return
    }
    const auto = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
    setFile(f)
    setName((prev) => prev || auto)
    setPreview(URL.createObjectURL(f))
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) validateAndSet(f)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) validateAndSet(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      // Upload directly from browser → Supabase Storage (bypasses Next.js body limit)
      setProgress("Subiendo archivo…")
      const supabase = createClient()
      const ext  = (file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg")).slice(0, 4)
      const uuid = crypto.randomUUID()
      const path = `uploads/${uuid}/${isVideo ? "video" : "image"}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("ad-lab")
        .upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) throw new Error(`Error al subir: ${uploadError.message}`)

      const { data: { publicUrl } } = supabase.storage.from("ad-lab").getPublicUrl(path)

      // Server action only creates the DB record — no file data passes through Next.js
      setProgress("Guardando registro…")
      const displayName = name.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
      const ad = await saveUploadedAdRecord(publicUrl, displayName, isVideo, boardId || undefined)

      onUploaded?.(ad)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el archivo")
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Upload className="w-3.5 h-3.5 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">Subir anuncio</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer select-none overflow-hidden
              ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"}
              ${file ? "aspect-[4/3]" : "h-36 flex flex-col items-center justify-center gap-2"}`}
          >
            {file && preview ? (
              isVideo ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={preview} className="w-full h-full object-contain bg-black" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="w-full h-full object-contain" />
              )
            ) : (
              <>
                <div className="flex gap-2">
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  <Film className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground text-center px-4">
                  Arrastra una imagen o video, o <span className="text-primary font-medium">selecciona un archivo</span>
                </p>
                <p className="text-[10px] text-muted-foreground/60">JPG · PNG · WEBP · GIF · MP4 · MOV · WEBM</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              onChange={onInputChange}
              className="sr-only"
            />
          </div>

          {/* Replace link shown after file selection */}
          {file && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cambiar archivo
            </button>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nombre de referencia</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del anuncio…"
              maxLength={120}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent"
            />
          </div>

          {/* Board selector */}
          {boards.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Guardar en board (opcional)</label>
              <div className="relative">
                <select
                  value={boardId}
                  onChange={(e) => setBoardId(e.target.value)}
                  className="w-full h-9 pl-3 pr-8 rounded-lg border border-border bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="">Sin board</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!file || loading}
              className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {loading ? (progress ?? "Subiendo…") : "Subir"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
