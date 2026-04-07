"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { PhaseSet, ProjectType } from "@/lib/types"
import {
  createPhaseSet,
  deletePhaseSet,
  addPhaseToSet,
  deletePhaseFromSet,
} from "@/lib/actions/config"

interface Props {
  initialSets: PhaseSet[]
  projectTypes: ProjectType[]
}

export function PhaseSetManager({ initialSets, projectTypes }: Props) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(initialSets[0]?.id ?? null)
  const [showNew, setShowNew] = useState(false)
  const [addingPhaseFor, setAddingPhaseFor] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreateSet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await createPhaseSet(fd)
      setShowNew(false)
      router.refresh()
    })
  }

  function handleDeleteSet(id: string) {
    if (!confirm("¿Eliminar este phase set y todas sus fases?")) return
    startTransition(async () => {
      await deletePhaseSet(id)
      router.refresh()
    })
  }

  function handleAddPhase(setId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await addPhaseToSet(setId, fd)
      setAddingPhaseFor(null)
      router.refresh()
    })
  }

  function handleDeletePhase(setId: string, phaseId: string) {
    if (!confirm("¿Eliminar esta fase?")) return
    startTransition(async () => {
      await deletePhaseFromSet(phaseId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Phase Sets</h2>
        <button
          onClick={() => setShowNew(true)}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          + Nuevo set
        </button>
      </div>

      {/* New set form */}
      {showNew && (
        <form onSubmit={handleCreateSet} className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre *</label>
              <input name="name" required autoFocus placeholder="Ej. Sprint Web Completo" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de proyecto (opcional)</label>
              <select name="project_type_id" defaultValue="none" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="none">Ninguno</option>
                {projectTypes.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="submit" disabled={isPending} className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isPending ? "Creando…" : "Crear"}
            </button>
          </div>
        </form>
      )}

      {/* Set list */}
      <div className="space-y-2">
        {initialSets.map((set) => {
          const isExpanded = expandedId === set.id
          const phases = set.phases ?? []

          return (
            <div key={set.id} className="rounded-xl border border-border bg-card">
              {/* Set header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : set.id)}
              >
                <div>
                  <p className="font-medium text-sm text-foreground">{set.name}</p>
                  <p className="text-xs text-muted-foreground">{phases.length} fases</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteSet(set.id) }}
                    className="text-xs text-destructive/70 hover:text-destructive transition-colors"
                  >
                    Eliminar
                  </button>
                  <span className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                </div>
              </div>

              {/* Phase list */}
              {isExpanded && (
                <div className="border-t border-border">
                  {phases.map((phase, i) => (
                    <div key={phase.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{phase.name}</p>
                        {phase.description && <p className="text-xs text-muted-foreground truncate">{phase.description}</p>}
                      </div>
                      <button
                        onClick={() => handleDeletePhase(set.id, phase.id)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* Add phase */}
                  {addingPhaseFor === set.id ? (
                    <form
                      onSubmit={(e) => handleAddPhase(set.id, e)}
                      className="px-4 py-3 bg-muted/30 flex gap-2 items-end"
                    >
                      <div className="flex-1">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre de la fase</label>
                        <input
                          name="name"
                          required
                          autoFocus
                          placeholder="Ej. Discovery"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Descripción</label>
                        <input
                          name="description"
                          placeholder="Opcional"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <button type="submit" disabled={isPending} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
                        Agregar
                      </button>
                      <button type="button" onClick={() => setAddingPhaseFor(null)} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        ✕
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setAddingPhaseFor(set.id)}
                      className="w-full px-4 py-2.5 text-left text-xs text-primary hover:bg-primary/5 transition-colors"
                    >
                      + Agregar fase
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {initialSets.length === 0 && !showNew && (
          <p className="text-sm text-muted-foreground text-center py-8">Sin phase sets. Crea el primero.</p>
        )}
      </div>
    </div>
  )
}
