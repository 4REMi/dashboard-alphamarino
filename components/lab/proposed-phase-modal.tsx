"use client"

import { useState, useTransition } from "react"
import type { CanonicalPhase } from "@/lib/types"
import { createProposedPhase } from "@/lib/actions/lab"
import { X } from "lucide-react"
import { InlineInput } from "@/components/lab/shared"
import { AutoTextarea } from "@/components/ui/auto-textarea"

interface Props {
  phaseSet: { id: string; name: string }
  allPhases: CanonicalPhase[]
  defaultAfterPhaseId?: string
  onClose: () => void
  onCreated: () => void
}

export function ProposedPhaseModal({ phaseSet, allPhases, defaultAfterPhaseId, onClose, onCreated }: Props) {
  const [afterPhaseId, setAfterPhaseId] = useState(defaultAfterPhaseId ?? "")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("position_after_phase_id", afterPhaseId)
    startTransition(async () => {
      await createProposedPhase(phaseSet.id, fd)
      onCreated()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-semibold text-sm">Proponer nueva fase</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{phaseSet.name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nombre *</label>
            <InlineInput name="name" required autoFocus placeholder="Nombre de la fase…" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descripción</label>
            <AutoTextarea
              name="description"
              rows={2}
              placeholder="Descripción de la fase…"
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Insertar después de</label>
            <select
              value={afterPhaseId}
              onChange={(e) => setAfterPhaseId(e.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Al principio</option>
              {allPhases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isPending ? "Guardando…" : "Guardar borrador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
