"use client"

import { useState, useTransition } from "react"
import type { ProjectType, PhaseSet } from "@/lib/types"
import {
  createProjectType,
  updateProjectType,
  deleteProjectType,
} from "@/lib/actions/config"

interface Props {
  initialTypes: ProjectType[]
  phaseSets: PhaseSet[]
}

export function ProjectTypeManager({ initialTypes, phaseSets }: Props) {
  const [types, setTypes] = useState<ProjectType[]>(initialTypes)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await createProjectType(fd)
      setShowNew(false)
    })
  }

  function handleUpdate(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateProjectType(id, fd)
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este tipo de proyecto?")) return
    startTransition(async () => {
      await deleteProjectType(id)
      setTypes((prev) => prev.filter((t) => t.id !== id))
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Tipos de Proyecto</h2>
        <button
          onClick={() => setShowNew(true)}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          + Nuevo tipo
        </button>
      </div>

      <div className="space-y-2">
        {/* New type form */}
        {showNew && (
          <form onSubmit={handleCreate} className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre *</label>
                <input
                  name="name"
                  required
                  autoFocus
                  placeholder="Ej. Paid Media"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Descripción</label>
                <input
                  name="description"
                  placeholder="Opcional"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
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

        {/* Type list */}
        {types.map((type) => (
          <div key={type.id} className="rounded-xl border border-border bg-card p-4">
            {editingId === type.id ? (
              <form onSubmit={(e) => handleUpdate(type.id, e)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
                    <input name="name" defaultValue={type.name} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Descripción</label>
                    <input name="description" defaultValue={type.description ?? ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Phase Set predeterminado</label>
                  <select
                    name="default_phase_set_id"
                    defaultValue={type.default_phase_set_id ?? "none"}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="none">Ninguno</option>
                    {phaseSets.map((ps) => (
                      <option key={ps.id} value={ps.id}>{ps.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingId(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                  <button type="submit" disabled={isPending} className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {isPending ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-foreground">{type.name}</p>
                  {type.description && <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>}
                  {type.default_phase_set_id && (
                    <p className="text-xs text-primary mt-1">
                      Phase set: {phaseSets.find((ps) => ps.id === type.default_phase_set_id)?.name ?? "—"}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(type.id)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Editar</button>
                  <button onClick={() => handleDelete(type.id)} className="text-xs text-destructive/70 hover:text-destructive transition-colors">Eliminar</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {types.length === 0 && !showNew && (
          <p className="text-sm text-muted-foreground text-center py-8">Sin tipos de proyecto. Crea el primero.</p>
        )}
      </div>
    </div>
  )
}
