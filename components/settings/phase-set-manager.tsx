"use client"

import { useState, useTransition } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { PhaseSet, PhaseSetPhase, ProjectType, TaskSet } from "@/lib/types"
import {
  createPhaseSet,
  deletePhaseSet,
  addPhaseToSet,
  deletePhaseFromSet,
  linkTaskSetToPhase,
  reorderPhaseInSet,
} from "@/lib/actions/config"

interface Props {
  initialSets: PhaseSet[]
  projectTypes: ProjectType[]
  taskSets?: TaskSet[]
}

export function PhaseSetManager({ initialSets, projectTypes, taskSets = [] }: Props) {
  const [sets, setSets] = useState<PhaseSet[]>(initialSets)
  const [expandedId, setExpandedId] = useState<string | null>(initialSets[0]?.id ?? null)
  const [showNew, setShowNew] = useState(false)
  const [addingPhaseFor, setAddingPhaseFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleReorder(setId: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSets((prev) =>
      prev.map((s) => {
        if (s.id !== setId) return s
        const phases = s.phases ?? []
        const oldIndex = phases.findIndex((p) => p.id === active.id)
        const newIndex = phases.findIndex((p) => p.id === over.id)
        const reordered = arrayMove(phases, oldIndex, newIndex)
        startTransition(async () => {
          await reorderPhaseInSet(setId, reordered.map((p) => p.id))
        })
        return { ...s, phases: reordered }
      })
    )
  }

  function handleLinkTaskSet(setId: string, phaseId: string, taskSetId: string) {
    const resolvedId = taskSetId === "none" ? null : taskSetId
    startTransition(async () => {
      try {
        await linkTaskSetToPhase(phaseId, resolvedId)
        setSets((prev) =>
          prev.map((s) =>
            s.id === setId
              ? {
                  ...s,
                  phases: (s.phases ?? []).map((p) =>
                    p.id === phaseId ? { ...p, default_task_set_id: resolvedId } : p
                  ),
                }
              : s
          )
        )
      } catch { /* ignore */ }
    })
  }

  function handleCreateSet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    setError(null)
    startTransition(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await createPhaseSet(fd) as any
        const newSet: PhaseSet = { ...created, phases: [] }
        setSets((prev) => [...prev, newSet].sort((a, b) => a.name.localeCompare(b.name)))
        setExpandedId(created.id)
        setShowNew(false)
        form.reset()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al crear")
      }
    })
  }

  function handleDeleteSet(id: string) {
    if (!confirm("¿Eliminar este phase set y todas sus fases?")) return
    startTransition(async () => {
      try {
        await deletePhaseSet(id)
        setSets((prev) => prev.filter((s) => s.id !== id))
        if (expandedId === id) setExpandedId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al eliminar")
      }
    })
  }

  function handleAddPhase(setId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    setError(null)
    startTransition(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await addPhaseToSet(setId, fd) as any
        const newPhase: PhaseSetPhase = created
        setSets((prev) =>
          prev.map((s) =>
            s.id === setId ? { ...s, phases: [...(s.phases ?? []), newPhase] } : s
          )
        )
        setAddingPhaseFor(null)
        form.reset()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al agregar fase")
      }
    })
  }

  function handleDeletePhase(setId: string, phaseId: string) {
    if (!confirm("¿Eliminar esta fase?")) return
    startTransition(async () => {
      try {
        await deletePhaseFromSet(phaseId)
        setSets((prev) =>
          prev.map((s) =>
            s.id === setId
              ? { ...s, phases: (s.phases ?? []).filter((p) => p.id !== phaseId) }
              : s
          )
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al eliminar fase")
      }
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

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}

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

      <div className="space-y-2">
        {sets.map((set) => {
          const isExpanded = expandedId === set.id
          const phases = set.phases ?? []

          return (
            <div key={set.id} className="rounded-xl border border-border bg-card">
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

              {isExpanded && (
                <div className="border-t border-border">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleReorder(set.id, e)}>
                    <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                      {phases.map((phase, i) => (
                        <SortablePhaseRow
                          key={phase.id}
                          phase={phase}
                          index={i}
                          setId={set.id}
                          taskSets={taskSets}
                          isPending={isPending}
                          onLinkTaskSet={handleLinkTaskSet}
                          onDelete={handleDeletePhase}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>

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

        {sets.length === 0 && !showNew && (
          <p className="text-sm text-muted-foreground text-center py-8">Sin phase sets. Crea el primero.</p>
        )}
      </div>
    </div>
  )
}

interface SortablePhaseRowProps {
  phase: PhaseSetPhase
  index: number
  setId: string
  taskSets: TaskSet[]
  isPending: boolean
  onLinkTaskSet: (setId: string, phaseId: string, taskSetId: string) => void
  onDelete: (setId: string, phaseId: string) => void
}

function SortablePhaseRow({ phase, index, setId, taskSets, isPending, onLinkTaskSet, onDelete }: SortablePhaseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 ${isDragging ? "bg-muted/60 opacity-80 shadow-sm z-10 relative" : ""}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        {...attributes}
        {...listeners}
        tabIndex={-1}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="4" cy="3.5" r="1.2" /><circle cx="10" cy="3.5" r="1.2" />
          <circle cx="4" cy="7"   r="1.2" /><circle cx="10" cy="7"   r="1.2" />
          <circle cx="4" cy="10.5" r="1.2" /><circle cx="10" cy="10.5" r="1.2" />
        </svg>
      </button>

      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
        {index + 1}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{phase.name}</p>
        {phase.description && <p className="text-xs text-muted-foreground truncate">{phase.description}</p>}
      </div>

      {taskSets.length > 0 && (
        <select
          value={phase.default_task_set_id ?? "none"}
          onChange={(e) => onLinkTaskSet(setId, phase.id, e.target.value)}
          disabled={isPending}
          className="text-xs rounded border border-input bg-background px-2 py-1 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          title="Task set predeterminado"
        >
          <option value="none">Sin task set</option>
          {taskSets.map((ts) => (
            <option key={ts.id} value={ts.id}>{ts.name}</option>
          ))}
        </select>
      )}

      <button
        onClick={() => onDelete(setId, phase.id)}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
      >
        ✕
      </button>
    </div>
  )
}
