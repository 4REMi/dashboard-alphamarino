"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { deleteTask, updateTaskStatus, updateTaskAssignee, updateTaskUrgent } from "@/lib/actions/tasks"
import { TaskForm } from "./task-form"
import { DeliverableDrawer } from "@/components/projects/deliverable-drawer"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Pencil, Trash2, CalendarDays, ChevronDown, ChevronRight, UserX, Flag, Paperclip } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Task, Profile, TaskStatus, Deliverable } from "@/lib/types"

const STATUS_GROUPS: { value: TaskStatus; label: string; defaultOpen: boolean }[] = [
  { value: "In Progress", label: "En Progreso", defaultOpen: true },
  { value: "Todo",        label: "Por Hacer",   defaultOpen: true },
  { value: "Done",        label: "Hecho",        defaultOpen: false },
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
          optimisticStatus === "Todo"        && "border-transparent bg-secondary text-secondary-foreground",
          optimisticStatus === "In Progress" && "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
          optimisticStatus === "Done"        && "border-transparent bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
        )}
      >
        {STATUS_GROUPS.find((s) => s.value === optimisticStatus)!.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-md py-1 min-w-[130px]">
          {STATUS_GROUPS.map((opt) => (
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
                opt.value === "Todo"        && "bg-muted-foreground/50",
                opt.value === "In Progress" && "bg-blue-500",
                opt.value === "Done"        && "bg-green-500",
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
            <span className="max-w-[90px] truncate">{optimisticAssignee.full_name.split(" ")[0]}</span>
          </>
        ) : (
          <span className="text-muted-foreground italic text-xs">Sin asignar</span>
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

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, projectId, employees, isAdmin, deliverable, onDeliverableClick }: {
  task: Task
  projectId: string
  employees: Profile[]
  isAdmin: boolean
  deliverable: Deliverable | null
  onDeliverableClick: (task: Task) => void
}) {
  const hasDeliverable = !!deliverable

  return (
    <tr className={cn(
      "border-t transition-colors",
      task.is_urgent
        ? "bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/10 dark:hover:bg-red-950/20"
        : "hover:bg-muted/30"
    )}>
      <td className="px-3 py-2.5">
        <UrgentFlag task={task} projectId={projectId} />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <p className={cn("font-medium text-sm", task.status === "Done" && "line-through text-muted-foreground")}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{task.description}</p>
            )}
          </div>
          {task.requires_deliverable && (
            <button
              onClick={() => onDeliverableClick(task)}
              title={hasDeliverable ? "Ver entregable" : "Entregable pendiente"}
              className={cn(
                "flex-shrink-0 p-1 rounded transition-colors",
                hasDeliverable
                  ? "text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40"
                  : "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              )}
            >
              <Paperclip className={cn("w-3.5 h-3.5", hasDeliverable && "fill-current opacity-80")} />
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <StatusPicker task={task} projectId={projectId} />
      </td>
      <td className="px-4 py-2.5">
        <AssigneePicker task={task} projectId={projectId} employees={employees} />
      </td>
      <td className="px-4 py-2.5">
        {task.due_date ? (
          <div className={cn(
            "flex items-center gap-1 text-xs",
            new Date(task.due_date) < new Date() && task.status !== "Done"
              ? "text-red-600 font-medium"
              : "text-muted-foreground"
          )}>
            <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
            {formatDate(task.due_date)}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      {isAdmin && (
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-end gap-1">
            <TaskForm
              projectId={projectId}
              task={task}
              employees={employees}
              trigger={
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Pencil className="w-3 h-3" />
                </Button>
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={async () => {
                if (confirm(`¿Eliminar "${task.title}"?`)) {
                  await deleteTask(task.id, projectId)
                }
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </td>
      )}
    </tr>
  )
}

// ─── Group Header ─────────────────────────────────────────────────────────────

function GroupHeader({ label, count, isOpen, onToggle, status }: {
  label: string; count: number; isOpen: boolean; onToggle: () => void; status: TaskStatus
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-muted/50 transition-colors border-t first:border-t-0"
    >
      {isOpen
        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      }
      <span className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        status === "Todo"        && "bg-muted-foreground/50",
        status === "In Progress" && "bg-blue-500",
        status === "Done"        && "bg-green-500",
      )} />
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground ml-1">{count}</span>
    </button>
  )
}

// ─── Task Table ───────────────────────────────────────────────────────────────

interface TaskTableProps {
  tasks: Task[]
  projectId: string
  employees: Profile[]
  isAdmin: boolean
  deliverablesByTaskId?: Record<string, Deliverable>
}

export function TaskTable({ tasks, projectId, employees, isAdmin, deliverablesByTaskId = {} }: TaskTableProps) {
  const initialOpen = Object.fromEntries(
    STATUS_GROUPS.map((g) => [g.value, g.defaultOpen])
  ) as Record<TaskStatus, boolean>
  const [open, setOpen] = useState<Record<TaskStatus, boolean>>(initialOpen)
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)

  function toggleGroup(status: TaskStatus) {
    setOpen((prev) => ({ ...prev, [status]: !prev[status] }))
  }

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g,
    tasks: tasks
      .filter((t) => t.status === g.value)
      .sort((a, b) => (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0)),
  })).filter((g) => g.tasks.length > 0)

  if (tasks.length === 0) {
    return (
      <div className="border rounded-lg py-10 text-center text-sm text-muted-foreground bg-card">
        Sin tareas aún.
      </div>
    )
  }

  const drawerDeliverable = drawerTask ? (deliverablesByTaskId[drawerTask.id] ?? null) : null

  return (
    <>
      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="w-8 px-3 py-2.5" />
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tarea</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Asignado</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Vence</th>
              {isAdmin && <th className="text-right px-4 py-2.5 font-medium text-muted-foreground" />}
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <>
                <tr key={`header-${group.value}`}>
                  <td colSpan={isAdmin ? 6 : 5} className="p-0">
                    <GroupHeader
                      label={group.label}
                      count={group.tasks.length}
                      isOpen={open[group.value]}
                      onToggle={() => toggleGroup(group.value)}
                      status={group.value}
                    />
                  </td>
                </tr>
                {open[group.value] && group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectId={projectId}
                    employees={employees}
                    isAdmin={isAdmin}
                    deliverable={deliverablesByTaskId[task.id] ?? null}
                    onDeliverableClick={setDrawerTask}
                  />
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <DeliverableDrawer
        task={drawerTask}
        projectId={projectId}
        deliverable={drawerDeliverable}
        isAdmin={isAdmin}
        onClose={() => setDrawerTask(null)}
      />
    </>
  )
}
