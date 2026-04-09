"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { deleteTask, updateTask, updateTaskStatus, updateTaskAssignee, updateTaskUrgent } from "@/lib/actions/tasks"
import { DeliverableDrawer } from "@/components/projects/deliverable-drawer"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, CalendarDays, ChevronDown, ChevronRight, UserX, Flag, Paperclip, X } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Task, Profile, TaskStatus, Deliverable } from "@/lib/types"
import { phaseColor } from "@/lib/phase-colors"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-opacity",
          isPending && "opacity-50",
          optimisticStatus === "Todo"        && "border-transparent bg-secondary text-secondary-foreground",
          optimisticStatus === "In Progress" && "border-transparent bg-info-subtle text-info-subtle-foreground",
          optimisticStatus === "Done"        && "border-transparent bg-success-subtle text-success-subtle-foreground",
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
              onClick={(e) => { e.stopPropagation(); handleSelect(opt.value) }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2",
                opt.value === optimisticStatus && "font-semibold"
              )}
            >
              <span className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                opt.value === "Todo"        && "bg-muted-foreground/40",
                opt.value === "In Progress" && "bg-info",
                opt.value === "Done"        && "bg-success",
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

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
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
          ? "text-destructive hover:text-destructive hover:bg-destructive/10"
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
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
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
            onClick={(e) => { e.stopPropagation(); handleSelect(null) }}
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
                onClick={(e) => { e.stopPropagation(); handleSelect(emp) }}
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

// ─── Phase Badge ──────────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: { name: string; phase_order: number } }) {
  const c = phaseColor(phase.phase_order)
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", c.bg)} />
      <span className={cn("text-xs font-medium truncate max-w-[80px]", c.text)}>
        {phase.name}
      </span>
    </div>
  )
}

// ─── Task Detail Modal ────────────────────────────────────────────────────────

function TaskDetailModal({
  task,
  projectId,
  employees,
  isAdmin,
  deliverable,
  onDeliverableClick,
  onClose,
}: {
  task: Task
  projectId: string
  employees: Profile[]
  isAdmin: boolean
  deliverable: Deliverable | null
  onDeliverableClick: (task: Task) => void
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const phase = (task.phase as { id: string; name: string; phase_order: number } | null | undefined) ?? null

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("project_id", projectId)
    // include current status/assignee so they're preserved
    fd.set("status", task.status)
    fd.set("assignee_id", task.assignee_id ?? "")
    startTransition(async () => {
      try {
        await updateTask(task.id, fd)
        onClose()
      } catch { /* keep open on error */ }
    })
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar "${task.title}"?`)) return
    await deleteTask(task.id, projectId)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            {phase && <PhaseBadge phase={phase} />}
            <StatusPicker task={task} projectId={projectId} />
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-title">Título</Label>
            <Input
              id="modal-title"
              name="title"
              required
              defaultValue={task.title}
              className="text-sm font-medium"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-desc">Descripción</Label>
            <textarea
              id="modal-desc"
              name="description"
              rows={4}
              defaultValue={task.description ?? ""}
              placeholder="Sin descripción"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Assignee + Due date row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Asignado</Label>
              <AssigneePicker task={task} projectId={projectId} employees={employees} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modal-due">Fecha límite</Label>
              <Input id="modal-due" name="due_date" type="date" defaultValue={task.due_date ?? ""} className="text-sm" />
            </div>
          </div>

          {/* Urgent + Requires deliverable */}
          <div className="flex gap-3">
            <label className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none flex-1 text-sm transition-colors",
              task.is_urgent
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-border bg-muted/30 text-muted-foreground"
            )}>
              <input type="checkbox" name="is_urgent" value="true" defaultChecked={task.is_urgent} className="accent-destructive" />
              <Flag className="w-3.5 h-3.5" />
              Urgente
            </label>
            <label className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none flex-1 text-sm transition-colors",
              task.requires_deliverable
                ? "border-info/40 bg-info-subtle text-info-subtle-foreground"
                : "border-border bg-muted/30 text-muted-foreground"
            )}>
              <input type="checkbox" name="requires_deliverable" value="true" defaultChecked={task.requires_deliverable} className="accent-info" />
              <Paperclip className="w-3.5 h-3.5" />
              Entregable
            </label>
          </div>

          {/* Deliverable link */}
          {task.requires_deliverable && (
            <button
              type="button"
              onClick={() => { onClose(); onDeliverableClick(task) }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
                deliverable
                  ? "border-success/40 bg-success/5 text-success"
                  : "border-warning/40 bg-warning/5 text-warning"
              )}
            >
              <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
              {deliverable ? "Ver entregable entregado" : "Entregable pendiente — click para subir"}
            </button>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            {isAdmin ? (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-destructive hover:underline"
              >
                Eliminar tarea
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, projectId, employees, isAdmin, deliverable, onDeliverableClick, onRowClick }: {
  task: Task
  projectId: string
  employees: Profile[]
  isAdmin: boolean
  deliverable: Deliverable | null
  onDeliverableClick: (task: Task) => void
  onRowClick: (task: Task) => void
}) {
  const hasDeliverable = !!deliverable
  const phase = (task.phase as { id: string; name: string; phase_order: number } | null | undefined) ?? null

  return (
    <tr
      className={cn(
        "border-t transition-colors cursor-pointer",
        task.is_urgent
          ? "bg-destructive/5 hover:bg-destructive/10"
          : "hover:bg-muted/30"
      )}
      onClick={() => onRowClick(task)}
    >
      {/* Urgent flag */}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <UrgentFlag task={task} projectId={projectId} />
      </td>

      {/* Title + description excerpt + due date */}
      <td className="px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn("font-medium text-sm truncate", task.status === "Done" && "line-through text-muted-foreground")}>
              {task.title}
            </p>
            {task.requires_deliverable && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeliverableClick(task) }}
                title={hasDeliverable ? "Ver entregable" : "Entregable pendiente"}
                className={cn(
                  "flex-shrink-0 p-1 rounded transition-colors",
                  hasDeliverable
                    ? "text-success hover:bg-success/10"
                    : "text-warning hover:bg-warning/10"
                )}
              >
                <Paperclip className={cn("w-3.5 h-3.5", hasDeliverable && "fill-current opacity-80")} />
              </button>
            )}
          </div>
          {/* Due date + description excerpt on the same subdued line */}
          <div className="flex items-center gap-2 mt-0.5">
            {task.due_date && (
              <span className={cn(
                "flex items-center gap-0.5 text-xs flex-shrink-0",
                new Date(task.due_date) < new Date() && task.status !== "Done"
                  ? "text-destructive font-medium"
                  : "text-muted-foreground"
              )}>
                <CalendarDays className="w-3 h-3" />
                {formatDate(task.due_date)}
              </span>
            )}
            {task.description && (
              <p className="text-xs text-muted-foreground truncate max-w-xs">{task.description}</p>
            )}
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <StatusPicker task={task} projectId={projectId} />
      </td>

      {/* Assignee */}
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <AssigneePicker task={task} projectId={projectId} employees={employees} />
      </td>

      {/* Phase */}
      <td className="px-4 py-2.5">
        {phase ? <PhaseBadge phase={phase} /> : <span className="text-xs text-muted-foreground">—</span>}
      </td>
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
        status === "Todo"        && "bg-muted-foreground/40",
        status === "In Progress" && "bg-info",
        status === "Done"        && "bg-success",
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
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  function toggleGroup(status: TaskStatus) {
    setOpen((prev) => ({ ...prev, [status]: !prev[status] }))
  }

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g,
    tasks: tasks
      .filter((t) => t.status === g.value)
      .sort((a, b) => {
        // 1. Phase order (earlier phases first; tasks without phase go last)
        const aPhaseOrder = (a.phase as { phase_order: number } | null)?.phase_order ?? 999
        const bPhaseOrder = (b.phase as { phase_order: number } | null)?.phase_order ?? 999
        if (aPhaseOrder !== bPhaseOrder) return aPhaseOrder - bPhaseOrder
        // 2. task_order within the phase
        const orderDiff = (a.task_order ?? 0) - (b.task_order ?? 0)
        if (orderDiff !== 0) return orderDiff
        // 3. created_at fallback
        return a.created_at.localeCompare(b.created_at)
      }),
  })).filter((g) => g.tasks.length > 0)

  if (tasks.length === 0) {
    return (
      <div className="border rounded-lg py-10 text-center text-sm text-muted-foreground bg-card">
        Sin tareas aún.
      </div>
    )
  }

  const drawerDeliverable = drawerTask ? (deliverablesByTaskId[drawerTask.id] ?? null) : null
  const detailDeliverable = detailTask ? (deliverablesByTaskId[detailTask.id] ?? null) : null

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
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Fase</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <>
                <tr key={`header-${group.value}`}>
                  <td colSpan={5} className="p-0">
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
                    onRowClick={setDetailTask}
                  />
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Deliverable drawer */}
      <DeliverableDrawer
        task={drawerTask}
        projectId={projectId}
        deliverable={drawerDeliverable}
        isAdmin={isAdmin}
        onClose={() => setDrawerTask(null)}
      />

      {/* Task detail modal */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          projectId={projectId}
          employees={employees}
          isAdmin={isAdmin}
          deliverable={detailDeliverable}
          onDeliverableClick={setDrawerTask}
          onClose={() => setDetailTask(null)}
        />
      )}
    </>
  )
}
