"use client"

import { useState, useTransition } from "react"
import type { Position } from "@/lib/types"
import { createPosition, updatePosition, deletePosition } from "@/lib/actions/config"

interface Props {
  initialPositions: Position[]
}

export function PositionsManager({ initialPositions }: Props) {
  const [positions, setPositions] = useState<Position[]>(initialPositions)
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError(null)
    startTransition(async () => {
      try {
        const created = await createPosition(name) as Position
        setPositions((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        setNewName("")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al crear")
      }
    })
  }

  function handleStartEdit(pos: Position) {
    setEditingId(pos.id)
    setEditingName(pos.name)
  }

  function handleSaveEdit(id: string) {
    const name = editingName.trim()
    if (!name) return
    setError(null)
    startTransition(async () => {
      try {
        await updatePosition(id, name)
        setPositions((prev) =>
          prev.map((p) => (p.id === id ? { ...p, name } : p)).sort((a, b) => a.name.localeCompare(b.name))
        )
        setEditingId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al actualizar")
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este puesto? Las tareas que lo referencian quedarán sin puesto asignado.")) return
    setError(null)
    startTransition(async () => {
      try {
        await deletePosition(id)
        setPositions((prev) => prev.filter((p) => p.id !== id))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al eliminar")
      }
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {positions.map((pos) => (
          <div key={pos.id} className="flex items-center gap-3 px-4 py-3">
            {editingId === pos.id ? (
              <>
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit(pos.id)
                    if (e.key === "Escape") setEditingId(null)
                  }}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => handleSaveEdit(pos.id)}
                  disabled={isPending}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-foreground">{pos.name}</span>
                <button
                  onClick={() => handleStartEdit(pos)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(pos.id)}
                  className="text-xs text-destructive/70 hover:text-destructive transition-colors"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        ))}

        {positions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sin puestos. Crea el primero.
          </p>
        )}
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ej. Project Manager"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          + Agregar puesto
        </button>
      </form>
    </div>
  )
}
