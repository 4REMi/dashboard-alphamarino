"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { deleteTask, updateTaskStatus, updateTaskAssignee, updateTaskUrgent } from "@/lib/actions/tasks"
import { TaskForm } from "./task-form"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Pencil, Trash2, CalendarDays, ChevronDown, UserX, Flag } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Task, Profile, TaskStatus } from "@/lib/types"

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "Todo", label: "Por Hacer" },
  { value: "In Progress", label: "En Progreso" },
  { value: "Done", label: "Hecho" },
]

// ─── Status Picker ────────────────────────────────────────────────────────────

function StatusPicker({ task, projectId }: { task: Task; projectId: string }) {
  const [open, setOpen] = useState(false)
  const [optimisticStatus, setOptimisticStatus] = useState<TaskStatus>(task.status)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  function handleSelect(next: TaskStatus) {
    setOpen(false)
    if (next === optimisticStatus) return
    setOptimisticStatus(next)
    startTransition(async () => {
      try { await updateTaskStatus(task.id, next, projectId) }
      catch { setOptimisticStatus(task.status) }
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
          optimisticStatus === "Todo" && "border-transparent bg-secondary text-secondary-foreground",
          optimisticStatus === "In Progress" && "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
          optimisticStatus === "Done" && "border-transparent bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
        )}
      >
        {STATUS_OPTIONS.find((s) => s.value === optimisticStatus)!.label}
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
              <span className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                opt.value === "Todo" && "bg-muted-foreground/50",
                opt.value === "In Progress" && "bg-blue-500",
                opt.value === "Done" && "bg-green-500",
              )} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Urgent Flag ──────────────────────────────────────────────────────────────

function UrgentFlag({ task, projectId }: { task: Task; projectId: string }) {
  const [optimistic, setOptimistic] = useState(task.is_urgent ?? false)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const next = !optimistic
    setOptimistic(next)
    startTransition(async () => {
      try { await updateTaskUrgent(task.id, next, projectId) }
      catch { setOptimistic(task.is_urgent ?? false) }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      title={optimistic ? "Urgente — click para quitar" : "Marcar como urgente"}
      className={cn(
        "p-1.5 rounded-md transition-colors",
        isPending && "opacity-40",
        optimistic
          ? "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
          : "text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted"
      )}
    >
      <Flag className={cn("w-3.5 h-3.5", optimistic && "fill-current")} />
    </button>
  )
}

// ─── Assignee Picker ──────────────────────────────────────────────────────────

function AssigneePicker({ task, projectId, employees }: { task: Task; projectId: string; employees: Profile[] }) {
  const [open, setOpen] = useState(false)
  const [optimisticAssignee, setOptimisticAssignee] = useState<Profile | null>(
    (task.assignee as Profile | null | undefined) ?? null
  )
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  function handleSelect(employee: Profile | null) {
    setOpen(false)
    if (employee?.id === optimisticAssignee?.id) return
    setOptimisticAssignee(employee)
    startTransition(async () => {
      try { await updateTaskAssignee(task.id, employee?.id ?? null, projectId) }
      catch { setOptimisticAssignee((task.assignee as Profile | null | undefined) ?? null) }
    })
  }

  const initials = optimisticAssignee?.full_name
    .split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted transition-colors",
          isPending && "opacity-50"
        )}
      >
        {optimisticAssignee ? (
          <>
            <Avatar className="h-5 w-5 flex-shrink-0">
              {optimisticAssignee.avatar_url ? (
                <img src={optimisticAssignee.avatar_url} alt={optimisticAssignee.full_name} className="h-full w-full object-cover" />
              ) : (
                <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
              )}
            </Avatar>
            <span className="max-w-[100px] truncate">{optimisticAssignee.full_name.split(" ")[0]}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Sin asignar</span>
        )}
        <ChevronDown className="w-3 h-3 opacity-40 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-md py-1 min-w-[160px] max-h-48 overflow-y-auto">
          <button
            onClick={() => handleSelect(null)}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2",
              !optimisticAssignee && "font-semibold"
            )}
          >
            <UserX className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">Sin asignar</span>
          </button>
          {employees.length > 0 && <div className="border-t my-1" />}
          {employees.map((emp) => {
            const empInitials = emp.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
            return (
              <button
                key={emp.id}
                onClick={() => handleSelect(emp)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2",
                  emp.id === optimisticAssignee?.id && "font-semibold"
                )}
              >
                <Avatar className="h-5 w-5 flex-shrink-0">
                  {emp.avatar_url ? (
                    <img src={emp.avatar_url} alt={emp.full_name} className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback className="text-[10px]">{empInitials}</AvatarFallback>
                  )}
                </Avatar>
                <span className="truncate">{emp.full_name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Task Table ───────────────────────────────────────────────────────────────

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
              <th className="w-8 px-3 py-3" title="Urgente" />
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarea</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Asignado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vence</th>
              {isAdmin && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                  No hay tareas en esta categoría
                </td>
              </tr>
            )}
            {filtered.map((task) => (
              <tr
                key={task.id}
                className={cn(
                  "border-t transition-colors",
                  task.is_urgent
                    ? "bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/10 dark:hover:bg-red-950/20"
                    : "hover:bg-muted/30"
                )}
              >
                <td className="px-3 py-3">
                  <UrgentFlag task={task} projectId={projectId} />
                </td>
                <td className="px-4 py-3">
                  <p className={cn("font-medium", task.status === "Done" && "line-through text-muted-foreground")}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{task.description}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusPicker task={task} projectId={projectId} />
                </td>
                <td className="px-4 py-3">
                  <AssigneePicker task={task} projectId={projectId} employees={employees} />
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
                        <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
