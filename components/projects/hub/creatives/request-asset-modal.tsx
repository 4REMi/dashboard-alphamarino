"use client"

import { useEffect, useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { createImageRequest, getImageClonesForConcept } from "@/lib/actions/creative-requests"
import { getProjectMembers } from "@/lib/actions/projects"
import { ImageIcon, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface RequestAssetModalProps {
  projectId: string
  conceptId: string
  open: boolean
  onRefresh?: () => void
  onClose: () => void
}

interface Member {
  id: string
  full_name: string
  avatar_url?: string | null
}

interface ImageCloneOption {
  id: string
  generated_image_urls: string[]
  status: string
}

export function RequestAssetModal({ projectId, conceptId, open, onRefresh, onClose }: RequestAssetModalProps) {
  const [isPending, startTransition] = useTransition()
  const [members, setMembers] = useState<Member[]>([])
  const [clones, setClones] = useState<ImageCloneOption[]>([])
  const [assignedTo, setAssignedTo] = useState("")
  const [notes, setNotes] = useState("")
  const [selectedCloneId, setSelectedCloneId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      getProjectMembers(projectId),
      getImageClonesForConcept(conceptId),
    ]).then(([m, c]) => {
      setMembers((m ?? []) as unknown as Member[])
      setClones((c ?? []) as ImageCloneOption[])
      setLoading(false)
    })
  }, [open, projectId, conceptId])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      await createImageRequest(projectId, conceptId, assignedTo || null, notes || null, selectedCloneId)
      onRefresh?.()
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Solicitar assets
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Asignar a</Label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Instrucciones para quien produce el asset…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Draft de imagen (opcional)</Label>
            {loading ? (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : clones.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay drafts generados en Ad Lab para este concepto todavía.{" "}
                <a href="/ad-lab" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                  Ir a Ad Lab <Sparkles className="w-3 h-3" />
                </a>
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {clones.map((c) => {
                  const thumb = c.generated_image_urls?.[0]
                  const isSelected = selectedCloneId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCloneId(isSelected ? null : c.id)}
                      className={cn(
                        "aspect-square rounded-lg overflow-hidden border-2 transition-colors",
                        isSelected ? "border-primary" : "border-transparent hover:border-border"
                      )}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creando…" : "Solicitar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
