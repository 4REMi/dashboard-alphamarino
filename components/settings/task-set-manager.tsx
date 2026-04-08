"use client"

import { useState, useTransition } from "react"
import type { TaskSet, TaskSetTask, Profile } from "@/lib/types"
import {
  createTaskSet,
  deleteTaskSet,
  addTaskToSet,
  deleteTaskFromSet,
} from "@/lib/actions/config"

const PRIORITY_LABELS = { Low: "Baja", Medium: "Media", High: "Alta" }
const PRIORITY_COLORS = {
  Low: "text-gray-500",
  Medium: "text-amber-600",
  High: "text-red-600",
}

interface Props {
  initialSets: TaskSet[]
  employees: Profile[]
}

export function TaskSetManager({ initialSets, employees }: Props) {
  const [sets, setSets] = useState<TaskSet[]>(initialSets)
  const [expandedId, setExpandedId] = useState<string | null>(initialSets[0]?.id ?? null)
  const [showNew, setShowNew] = useState(false)
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreateSet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    setError(null)
    startTransition(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await createTaskSet(fd) as any
        const assigneeId = fd.get("default_assignee_id") as string
        const assignee = employees.find((e) => e.id === assigneeId) ?? null
        const newSet: TaskSet = { ...created, tasks: [], default_assignee: assignee }
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
    if (!confirm("¿Eliminar este task set y todas sus tareas?")) return
    startTransition(async () => {
      try {
        await deleteTaskSet(id)
        setSets((prev) => prev.filter((s) => s.id !== id))
        if (expandedId === id) setExpandedId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al eliminar")
      }
    })
  }

  function handleAddTask(setId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    setError(null)
    startTransition(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await addTaskToSet(setId, fd) as any
        const newTask: TaskSetTask = created
        setSets((prev) =>
          prev.map((s) =>
            s.id === setId ? { ...s, tasks: [...(s.tasks ?? []), newTask] } : s
          )
        )
        setAddingTaskFor(null)
        form.reset()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al agregar tarea")
      }
    })
  }

  function handleDeleteTask(setId: string, taskId: string) {
    if (!confirm("¿Eliminar esta tarea?")) return
    startTransition(async () => {
      try {
        await deleteTaskFromSet(taskId)
        setSets((prev) =>
          prev.map((s) =>
            s.id === setId
              ? { ...s, tasks: (s.tasks ?? []).filter((t) => t.id !== taskId) }
              : s
          )
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al eliminar tarea")
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Task Sets</h2>
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
              <input name="name" required autoFocus placeholder="Ej. Tareas de Discovery"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Empleado predeterminado</label>
              <select name="default_assignee_id" defaultValue="none"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="none">Sin asignar</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="submit" disabled={isPending}
              className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isPending ? "Creando…" : "Crear"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {sets.map((set) => {
          const isExpanded = expandedId === set.id
          const tasks = set.tasks ?? []
          const assigneeName = (set.default_assignee as Profile | null)?.full_name

          return (
            <div key={set.id} className="rounded-xl border border-border bg-card">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : set.id)}
              >
                <div>
                  <p className="font-medium text-sm text-foreground">{set.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tasks.length} tareas
                    {assigneeName && <span> · <span className="text-primary">{assigneeName}</span></span>}
                  </p>
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
                  {tasks.map((task, i) => (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{task.title}</p>
                        {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                      </div>
                      <span className={`text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                      <button
                        onClick={() => handleDeleteTask(set.id, task.id)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {addingTaskFor === set.id ? (
                    <form
                      onSubmit={(e) => handleAddTask(set.id, e)}
                      className="px-4 py-3 bg-muted/30 space-y-2"
                    >
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Título *</label>
                          <input name="title" required autoFocus placeholder="Ej. Reunión inicial con cliente"
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Prioridad</label>
                          <select name="priority" defaultValue="Medium"
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                            <option value="Low">Baja</option>
                            <option value="Medium">Media</option>
                            <option value="High">Alta</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Descripción</label>
                        <input name="description" placeholder="Opcional"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAddingTaskFor(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
                        <button type="submit" disabled={isPending}
                          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
                          Agregar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => setAddingTaskFor(set.id)}
                      className="w-full px-4 py-2.5 text-left text-xs text-primary hover:bg-primary/5 transition-colors"
                    >
                      + Agregar tarea
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {sets.length === 0 && !showNew && (
          <p className="text-sm text-muted-foreground text-center py-8">Sin task sets. Crea el primero.</p>
        )}
      </div>
    </div>
  )
}
