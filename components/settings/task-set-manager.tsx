"use client"

import { useState, useTransition, useRef } from "react"
import type { TaskSet, TaskSetTask, TaskSetChecklistItem, Profile } from "@/lib/types"
import {
  createTaskSet,
  deleteTaskSet,
  addTaskToSet,
  deleteTaskFromSet,
  addChecklistItemToSetTask,
  deleteSetTaskChecklistItem,
  updateSetTaskChecklistItem,
} from "@/lib/actions/config"
import { Lock, Plus, X, ListChecks } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Template checklist editor (no is_checked — these are just templates) ──────

function TemplateChecklistEditor({
  taskSetTaskId,
  initialItems,
}: {
  taskSetTaskId: string
  initialItems: TaskSetChecklistItem[]
}) {
  const [items, setItems] = useState<TaskSetChecklistItem[]>(
    [...initialItems].sort((a, b) => a.item_order - b.item_order)
  )
  const [addingText, setAddingText] = useState("")
  const [addingBlocking, setAddingBlocking] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const text = addingText.trim()
    if (!text) return
    setAddingText("")
    setAddingBlocking(false)
    startTransition(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await addChecklistItemToSetTask(taskSetTaskId, text, addingBlocking) as any
        setItems((prev) => [...prev, created])
      } catch { /* ignore */ }
    })
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    startTransition(async () => {
      try { await deleteSetTaskChecklistItem(id) }
      catch { /* rollback not needed for template */ }
    })
  }

  function handleBlockingToggle(id: string, blocking: boolean) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, is_blocking: blocking } : i))
    startTransition(async () => {
      try { await updateSetTaskChecklistItem(id, { is_blocking: blocking }) }
      catch { /* ignore */ }
    })
  }

  return (
    <div className="mt-2 pl-6 space-y-1.5 border-t border-border/50 pt-2">
      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mb-1">
        <ListChecks className="w-3 h-3" />
        Checklist plantilla
      </p>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 group text-sm">
          <span className={cn("flex-1 min-w-0 truncate", item.is_blocking && "font-medium")}>{item.text}</span>
          <button
            type="button"
            onClick={() => handleBlockingToggle(item.id, !item.is_blocking)}
            title={item.is_blocking ? "Obligatorio — click para hacer opcional" : "Opcional — click para hacer obligatorio"}
            className={cn(
              "flex-shrink-0 transition-opacity",
              item.is_blocking ? "text-destructive opacity-100" : "text-muted-foreground/30 opacity-0 group-hover:opacity-100"
            )}
          >
            <Lock className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(item.id)}
            disabled={isPending}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      {isAdding ? (
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={addingText}
            onChange={(e) => setAddingText(e.target.value)}
            placeholder="Item de checklist…"
            className="flex-1 text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => { if (e.key === "Escape") { setIsAdding(false); setAddingText("") } }}
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer flex-shrink-0" title="Marcar como obligatorio">
            <input type="checkbox" checked={addingBlocking} onChange={(e) => setAddingBlocking(e.target.checked)} className="rounded" />
            <Lock className={cn("w-3 h-3", addingBlocking ? "text-destructive" : "text-muted-foreground/40")} />
          </label>
          <button type="submit" disabled={!addingText.trim() || isPending} className="text-xs text-primary hover:underline disabled:opacity-40 flex-shrink-0">
            Agregar
          </button>
          <button type="button" onClick={() => { setIsAdding(false); setAddingText("") }} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-3 h-3" />
          Agregar item
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

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
                    <div key={task.id} className="border-b border-border/50 last:border-0 px-4 py-2.5">
                      <div className="flex items-center gap-3">
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
                      <TemplateChecklistEditor
                        taskSetTaskId={task.id}
                        initialItems={task.checklist_items ?? []}
                      />
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
