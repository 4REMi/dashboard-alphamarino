"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { deleteTask, updateTaskStatus } from "@/lib/actions/tasks"
import { TaskForm } from "./task-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Pencil, Trash2, CalendarDays, ChevronDown } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Task, Profile, TaskStatus } from "@/lib/types"

const STATUS_OPTIONS: { value: TaskStatus; label: string; variant: "secondary" | "info" | "success" }[] = [
  { value: "Todo", label: "Por Hacer", variant: "secondary" },
  { value: "In Progress", label: "En Progreso", variant: "info" },
  { value: "Done", label: "Hecho", variant: "success" },
]

const priorityConfig = {
  Low: { label: "Baja", color: "text-gray-500" },
  Medium: { label: "Media", color: "text-yellow-600" },
  High: { label: "Alta", color: "text-red-600" },
}

function StatusPicker({
  task,
  projectId,
}: {
  task: Task
  projectId: string
}) {
  const [open, setOpen] = useState(false)
  const [optimisticStatus, setOptimisticStatus] = useState<TaskStatus>(task.status)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const current = STATUS_OPTIONS.find((s) => s.value === optimisticStatus)!

  function handleSelect(next: TaskStatus) {
    setOpen(false)
    if (next === optimisticStatus) return
    setOptimisticStatus(next)
    startTransition(async () => {
      try {
        await updateTaskStatus(task.id, next, projectId)
      } catch {
        setOptimisticStatus(task.status) // revert on error
      }
    })
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-opacity",
          isPending && "opacity-50",
          // match Badge variants
          optimisticStatus === "Todo" && "border-transparent bg-secondary text-secondary-foreground",
          optimisticStatus === "In Progress" && "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
          optimisticStatus === "Done" && "border-transparent bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
        )}
      >
        {current.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-md py-1 min-w-[130px]">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2",
                opt.value === optimisticStatus && "font-semibold"
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  opt.value === "Todo" && "bg-muted-foreground/50",
                  opt.value === "In Progress" && "bg-blue-500",
                  opt.value === "Done" && "bg-green-500",
                )}
              />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface TaskTableProps {
  tasks: Task[]
  projectId: string
  employees: Profile[]
  isAdmin: boolean
}

export function TaskTable({ tasks, projectId, employees, isAdmin }: TaskTableProps) {
  const [filter, setFilter] = useState<"all" | TaskStatus>("all")

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["all", "Todo", "In Progress", "Done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {f === "all" ? "Todas" : STATUS_OPTIONS.find((s) => s.value === f)!.label}
            <span className="ml-1.5 opacity-70">
              ({f === "all" ? tasks.length : tasks.filter((t) => t.status === f).length})
            </span>
          </button>
        ))}
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarea</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Prioridad</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Asignado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vence</th>
              {isAdmin && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No hay tareas en esta categoría
                </td>
              </tr>
            )}
            {filtered.map((task) => {
              const assignee = task.assignee as Profile | undefined
              const initials = assignee?.full_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)

              return (
                <tr key={task.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className={cn("font-medium", task.status === "Done" && "line-through text-muted-foreground")}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{task.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPicker task={task} projectId={projectId} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs font-medium", priorityConfig[task.priority].color)}>
                      {priorityConfig[task.priority].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {assignee ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          {assignee.avatar_url ? (
                            <img src={assignee.avatar_url} alt={assignee.full_name} className="h-full w-full object-cover" />
                          ) : (
                            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                          )}
                        </Avatar>
                        <span className="text-xs">{assignee.full_name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {task.due_date ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {formatDate(task.due_date)}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <TaskForm
                          projectId={projectId}
                          task={task}
                          employees={employees}
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          }
                        />
                        <form
                          action={async () => {
                            if (confirm(`¿Eliminar "${task.title}"?`)) {
                              await deleteTask(task.id, projectId)
                            }
                          }}
                        >
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
