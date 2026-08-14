"use client"

import { useState, useTransition, useEffect } from "react"
import { submitDeliverable, deleteDeliverable } from "@/lib/actions/deliverables"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { X, FileText, Image, Link2, Pencil, Trash2, Plus, Paperclip, ExternalLink, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import type { Task, Deliverable, DeliverableType } from "@/lib/types"
import { AutoTextarea } from "@/components/ui/auto-textarea"

const TYPE_OPTIONS: { value: DeliverableType; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    value: "text",
    label: "Texto",
    icon: <FileText className="w-4 h-4" />,
    hint: "Escribe el entregable directamente",
  },
  {
    value: "document",
    label: "Documento",
    icon: <Link2 className="w-4 h-4" />,
    hint: "Enlace a Google Doc, PDF, Notion…",
  },
  {
    value: "image",
    label: "Imagen",
    icon: <Image className="w-4 h-4" />,
    hint: "URL de la imagen o carpeta de Drive",
  },
]

function typeLabel(t: DeliverableType) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t
}

function typeIcon(t: DeliverableType) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.icon
}

interface DeliverableDrawerProps {
  task: Task | null
  projectId: string | null
  deliverable: Deliverable | null
  isAdmin: boolean
  onClose: () => void
}

export function DeliverableDrawer({
  task,
  projectId,
  deliverable,
  isAdmin,
  onClose,
}: DeliverableDrawerProps) {
  const [editing, setEditing] = useState(!deliverable)
  const [type, setType] = useState<DeliverableType>(deliverable?.type ?? "text")
  const [isPending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)
  const isOpen = !!task

  // Reset when task changes
  useEffect(() => {
    if (task) {
      setType(deliverable?.type ?? "text")
      setEditing(!deliverable)
    }
  }, [task?.id, deliverable?.id])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("project_id", projectId ?? "")
    fd.set("task_id", task!.id)
    fd.set("type", type)
    if (deliverable) fd.set("deliverable_id", deliverable.id)

    startTransition(async () => {
      await submitDeliverable(fd)
      onClose()
    })
  }

  function handleDelete() {
    if (!deliverable) return
    if (!confirm("¿Eliminar este entregable?")) return
    setDeleting(true)
    startTransition(async () => {
      try {
        await deleteDeliverable(deliverable.id, projectId)
        onClose()
      } finally {
        setDeleting(false)
      }
    })
  }

  const uploader = deliverable?.uploader
  const uploaderInitials = uploader?.full_name
    ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/30 z-40 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-md bg-background border-l shadow-2xl z-50",
          "flex flex-col transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Entregable</span>
            </div>
            <h2 className="font-semibold text-sm leading-snug truncate">{task?.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Instructions callout */}
        {task?.deliverable_instructions && (
          <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-4 py-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">¿Qué se necesita?</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-wrap">{task.deliverable_instructions}</p>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── View mode ────────────────────────────────────────── */}
          {deliverable && !editing ? (
            <div className="space-y-4">
              {/* Type + title */}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{typeIcon(deliverable.type)}</span>
                <span className="text-xs text-muted-foreground">{typeLabel(deliverable.type)}</span>
              </div>
              <h3 className="text-base font-semibold">{deliverable.title}</h3>

              {/* Content */}
              {deliverable.type === "text" && deliverable.content && (
                <div className="rounded-lg bg-muted/50 border p-4">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{deliverable.content}</p>
                </div>
              )}

              {deliverable.type === "image" && deliverable.file_url && (
                <div className="space-y-2">
                  <img
                    src={deliverable.file_url}
                    alt={deliverable.title}
                    className="rounded-lg border max-w-full object-contain max-h-64"
                    onError={(e) => {
                      // if image fails (URL, not direct image), show link fallback
                      const t = e.currentTarget
                      t.style.display = "none"
                      t.nextElementSibling?.removeAttribute("hidden")
                    }}
                  />
                  <a
                    href={deliverable.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    hidden
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {deliverable.file_name || deliverable.file_url}
                  </a>
                </div>
              )}

              {deliverable.type === "document" && deliverable.file_url && (
                <a
                  href={deliverable.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm hover:bg-muted transition-colors"
                >
                  <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate flex-1 text-primary">{deliverable.file_name || deliverable.file_url}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </a>
              )}

              {/* Uploader + date */}
              {uploader && (
                <div className="flex items-center gap-2 pt-2 border-t text-xs text-muted-foreground">
                  <Avatar className="h-5 w-5">
                    {uploader.avatar_url ? (
                      <img src={uploader.avatar_url} alt={uploader.full_name} className="h-full w-full object-cover" />
                    ) : (
                      <AvatarFallback className="text-[9px]">{uploaderInitials}</AvatarFallback>
                    )}
                  </Avatar>
                  <span>{uploader.full_name}</span>
                  <span>·</span>
                  <span>{formatDate(deliverable.created_at)}</span>
                </div>
              )}
            </div>
          ) : (
            /* ── Form mode ─────────────────────────────────────── */
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Type picker */}
              <div className="space-y-2">
                <Label>Tipo de entregable</Label>
                <div className="grid grid-cols-3 gap-2">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors",
                        type === opt.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {TYPE_OPTIONS.find((o) => o.value === type)?.hint}
                </p>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="del-title">Título *</Label>
                <Input
                  id="del-title"
                  name="title"
                  defaultValue={deliverable?.title ?? ""}
                  placeholder="Ej. Diseños finales aprobados"
                  required
                />
              </div>

              {/* Content / URL */}
              {type === "text" ? (
                <div className="space-y-2">
                  <Label htmlFor="del-content">Contenido *</Label>
                  <AutoTextarea
                    id="del-content"
                    name="content"
                    rows={6}
                    defaultValue={deliverable?.content ?? ""}
                    required
                    placeholder="Escribe el entregable aquí…"
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="del-file-url">URL *</Label>
                  <Input
                    id="del-file-url"
                    name="file_url"
                    type="url"
                    defaultValue={deliverable?.file_url ?? ""}
                    required
                    placeholder={
                      type === "image"
                        ? "https://… (URL de la imagen)"
                        : "https://docs.google.com/… o cualquier enlace"
                    }
                  />
                  <Input
                    name="file_name"
                    defaultValue={deliverable?.file_name ?? ""}
                    placeholder="Nombre del archivo (opcional)"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={isPending} className="flex-1">
                  {isPending ? "Guardando…" : deliverable ? "Actualizar" : "Guardar entregable"}
                </Button>
                {deliverable && (
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer actions (view mode) */}
        {deliverable && !editing && (
          <div className="p-5 border-t flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setEditing(true)}
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Editar
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}

        {/* Footer: no deliverable yet (view-only task with no deliverable — shouldn't happen) */}
        {!deliverable && !editing && (
          <div className="p-5 border-t">
            <Button className="w-full" onClick={() => setEditing(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Agregar entregable
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
