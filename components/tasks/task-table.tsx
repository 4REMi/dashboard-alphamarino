"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { deleteTask, updateTask, updateTaskStatus, updateTaskAssignee, updateTaskUrgent } from "@/lib/actions/tasks"
import { assignSopToTask } from "@/lib/actions/sops"
import { DeliverableDrawer } from "@/components/projects/deliverable-drawer"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, CalendarDays, ChevronDown, ChevronRight, UserX, Flag, Paperclip, X, BookOpen, Search, ExternalLink } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Task, Profile, TaskStatus, Deliverable, Sop } from "@/lib/types"
import { phaseColor } from "@/lib/phase-colors"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const STATUS_GROUPS: { value: TaskStatus; defaultOpen: boolean }[] = [
  { value: "In Progress", defaultOpen: false },
  { value: "Todo",        defaultOpen: false },
  { value: "Done",        defaultOpen: false },
]

const TASK_STATUS_KEY: Record<TaskStatus, "todo" | "inProgress" | "done"> = {
  "Todo":        "todo",
  "In Progress": "inProgress",
  "Done":        "done",
}

// ─── Status Picker ────────────────────────────────────────────────────────────

function StatusPicker({ task, projectId }: { task: Task; projectId: string }) {
  const tTaskStatus = useTranslations("taskStatus")
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const [optimisticStatus, setOptimisticStatus] = useState<TaskStatus>(task.status)
  const [isPending, startTransition] = useTransition()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen((v) => !v)
  }

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
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-opacity",
          isPending && "opacity-50",
          optimisticStatus === "Todo"        && "border-transparent bg-secondary text-secondary-foreground",
          optimisticStatus === "In Progress" && "border-transparent bg-info-subtle text-info-subtle-foreground",
          optimisticStatus === "Done"        && "border-transparent bg-success-subtle text-success-subtle-foreground",
        )}
      >
        {tTaskStatus(TASK_STATUS_KEY[optimisticStatus])}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-popover border rounded-lg shadow-md py-1 min-w-[130px]"
          style={{ top: dropPos.top, left: dropPos.left }}
        >
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
              {tTaskStatus(TASK_STATUS_KEY[opt.value])}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
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
  const tCommon = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const [optimisticAssignee, setOptimisticAssignee] = useState<Profile | null>(
    (task.assignee as Profile | null | undefined) ?? null
  )
  const [isPending, startTransition] = useTransition()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen((v) => !v)
  }

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
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
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
          <span className="text-muted-foreground italic text-xs">{tCommon("unassigned")}</span>
        )}
        <ChevronDown className="w-3 h-3 opacity-40 flex-shrink-0" />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-popover border rounded-lg shadow-md py-1 min-w-[160px] max-h-48 overflow-y-auto"
          style={{ top: dropPos.top, left: dropPos.left }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); handleSelect(null) }}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2",
              !optimisticAssignee && "font-semibold"
            )}
          >
            <UserX className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">{tCommon("unassigned")}</span>
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
        </div>,
        document.body
      )}
    </>
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

// ─── SOP Block ────────────────────────────────────────────────────────────────

function SopBlock({
  task,
  projectId,
  sops,
  isAdmin,
}: {
  task: Task
  projectId: string
  sops: Sop[]
  isAdmin: boolean
}) {
  const tT = useTranslations("tasks")
  const tCommonSop = useTranslations("common")
  // Option C: effective SOP = task override ?? template SOP
  const effectiveSop = (task.sop as Sop | null) ??
    ((task.task_set_task as { sop?: Sop | null } | null)?.sop ?? null)
  const isInherited = !task.sop_id && !!effectiveSop

  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()

  const filtered = sops.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    (s.category ?? "").toLowerCase().includes(search.toLowerCase())
  )

  function handleAssign(sopId: string | null) {
    setPicking(false)
    setSearch("")
    startTransition(async () => {
      try { await assignSopToTask(task.id, sopId, projectId) }
      catch { /* ignore */ }
    })
  }

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <BookOpen className="w-3.5 h-3.5" />
        SOP
        {isInherited && (
          <span className="ml-1 text-[10px] text-muted-foreground font-normal">{tT("sopInherited")}</span>
        )}
      </Label>

      {effectiveSop && !picking ? (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm",
          isInherited
            ? "border-border bg-muted/30 text-foreground"
            : "border-primary/30 bg-primary/5 text-primary"
        )}>
          <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 font-medium truncate">{effectiveSop.title}</span>
          {effectiveSop.doc_url && (
            <a
              href={effectiveSop.doc_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-0.5 text-xs hover:underline flex-shrink-0"
            >
              {tT("sopDocument")} <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {effectiveSop.video_url && (
            <a
              href={effectiveSop.video_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-0.5 text-xs hover:underline flex-shrink-0"
            >
              {tT("sopVideo")} <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {isAdmin && (
            <div className="flex gap-1 flex-shrink-0 ml-1">
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={isPending}
                className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
              >
                {tT("sopChange")}
              </button>
              {!isInherited && (
                <button
                  type="button"
                  onClick={() => handleAssign(null)}
                  disabled={isPending}
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                  title={tT("sopRemoveHint")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {isAdmin ? (
            picking ? (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tT("searchSop")}
                    className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-1">{tT("noSop")}</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
                    {filtered.map((sop) => (
                      <button
                        key={sop.id}
                        type="button"
                        onClick={() => handleAssign(sop.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="flex-1 text-sm truncate">{sop.title}</span>
                        {sop.category && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">{sop.category}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setPicking(false); setSearch("") }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {tCommonSop("cancel")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={isPending}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg px-3 py-2 w-full transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                {tT("assignSop")}
              </button>
            )
          ) : (
            <p className="text-sm text-muted-foreground">{tT("noSop")}</p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Task Detail Modal ────────────────────────────────────────────────────────

function TaskDetailModal({
  task,
  projectId,
  employees,
  isAdmin,
  sops,
  deliverable,
  onDeliverableClick,
  onClose,
}: {
  task: Task
  projectId: string
  employees: Profile[]
  isAdmin: boolean
  sops: Sop[]
  deliverable: Deliverable | null
  onDeliverableClick: (task: Task) => void
  onClose: () => void
}) {
  const tT = useTranslations("tasks")
  const tC = useTranslations("common")
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
    if (!confirm(tT("deleteConfirm"))) return
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
            <Label htmlFor="modal-title">{tT("titleLabel")}</Label>
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
            <Label htmlFor="modal-desc">{tT("description")}</Label>
            <textarea
              id="modal-desc"
              name="description"
              rows={4}
              defaultValue={task.description ?? ""}
              placeholder={tT("descriptionPlaceholder")}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Assignee + Due date row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{tT("assignee")}</Label>
              <AssigneePicker task={task} projectId={projectId} employees={employees} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modal-due">{tT("dueDate")}</Label>
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
              {tT("urgent")}
            </label>
            <label className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none flex-1 text-sm transition-colors",
              task.requires_deliverable
                ? "border-info/40 bg-info-subtle text-info-subtle-foreground"
                : "border-border bg-muted/30 text-muted-foreground"
            )}>
              <input type="checkbox" name="requires_deliverable" value="true" defaultChecked={task.requires_deliverable} className="accent-info" />
              <Paperclip className="w-3.5 h-3.5" />
              {tT("deliverable")}
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
              {deliverable ? tT("deliverableView") : tT("deliverablePending")}
            </button>
          )}

          {/* SOP block */}
          <SopBlock task={task} projectId={projectId} sops={sops} isAdmin={isAdmin} />

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            {isAdmin ? (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-destructive hover:underline"
              >
                {tT("deleteTask")}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>{tC("cancel")}</Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? tC("saving") : tC("save")}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, projectId, employees, isAdmin, deliverable, onDeliverableClick, onRowClick, showPhaseCol = true }: {
  task: Task
  projectId: string
  employees: Profile[]
  isAdmin: boolean
  deliverable: Deliverable | null
  onDeliverableClick: (task: Task) => void
  onRowClick: (task: Task) => void
  showPhaseCol?: boolean
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

      {/* Phase — hidden in phase-grouping mode */}
      {showPhaseCol && (
        <td className="px-4 py-2.5">
          {phase ? <PhaseBadge phase={phase} /> : <span className="text-xs text-muted-foreground">—</span>}
        </td>
      )}
    </tr>
  )
}

// ─── Status Group Header ──────────────────────────────────────────────────────

function StatusGroupHeader({ label, count, isOpen, onToggle, status }: {
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

// ─── Phase Group Header ───────────────────────────────────────────────────────

function PhaseGroupHeader({ name, phaseOrder, total, done, isOpen, onToggle }: {
  name: string
  phaseOrder: number
  total: number
  done: number
  isOpen: boolean
  onToggle: () => void
}) {
  const tT = useTranslations("tasks")
  const c = phaseColor(phaseOrder)
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-muted/50 transition-colors border-t first:border-t-0"
    >
      {isOpen
        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      }
      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", c.bg)} />
      <span className="text-xs font-semibold">{name}</span>
      <span className="text-xs text-muted-foreground ml-1">{total}</span>
      {done > 0 && (
        <span className="ml-auto text-xs text-success font-medium pr-1">{tT("doneCount", { count: done })}</span>
      )}
    </button>
  )
}

// ─── Task Table ───────────────────────────────────────────────────────────────

type TaskFilter  = "all" | "mine" | "unassigned"
type GroupMode   = "status" | "phase"

interface TaskTableProps {
  tasks: Task[]
  projectId: string
  employees: Profile[]
  isAdmin: boolean
  deliverablesByTaskId?: Record<string, Deliverable>
  currentUserId?: string
  sops?: Sop[]
}

export function TaskTable({ tasks, projectId, employees, isAdmin, deliverablesByTaskId = {}, currentUserId, sops = [] }: TaskTableProps) {
  const tT = useTranslations("tasks")
  const tTaskStatus = useTranslations("taskStatus")

  // ── state ──────────────────────────────────────────────────────────────────
  const initialStatusOpen = Object.fromEntries(
    STATUS_GROUPS.map((g) => [g.value, g.defaultOpen])
  ) as Record<TaskStatus, boolean>

  const [statusOpen, setStatusOpen] = useState<Record<TaskStatus, boolean>>(initialStatusOpen)
  const [phaseOpen,  setPhaseOpen]  = useState<Record<string, boolean>>({})
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [filter,     setFilter]     = useState<TaskFilter>("all")
  const [groupMode,  setGroupMode]  = useState<GroupMode>("status")

  // ── derived ────────────────────────────────────────────────────────────────
  // Detect whether this project has phases
  const hasPhases = tasks.some((t) => t.phase)

  const filteredTasks = tasks.filter((t) => {
    if (filter === "mine")       return currentUserId && t.assignee_id === currentUserId
    if (filter === "unassigned") return !t.assignee_id
    return true
  })

  // ── status grouping ────────────────────────────────────────────────────────
  const statusGroups = STATUS_GROUPS.map((g) => ({
    ...g,
    label: tTaskStatus(TASK_STATUS_KEY[g.value]),
    tasks: filteredTasks
      .filter((t) => t.status === g.value)
      .sort((a, b) => {
        const aOrder = (a.phase as { phase_order: number } | null)?.phase_order ?? 999
        const bOrder = (b.phase as { phase_order: number } | null)?.phase_order ?? 999
        if (aOrder !== bOrder) return aOrder - bOrder
        const diff = (a.task_order ?? 0) - (b.task_order ?? 0)
        if (diff !== 0) return diff
        return a.created_at.localeCompare(b.created_at)
      }),
  })).filter((g) => g.tasks.length > 0)

  // ── phase grouping ─────────────────────────────────────────────────────────
  type PhaseGroup = {
    key: string
    name: string
    phaseOrder: number
    tasks: Task[]
  }

  const phaseGroups: PhaseGroup[] = (() => {
    const map = new Map<string, PhaseGroup>()

    for (const t of filteredTasks) {
      const phase = (t.phase as { id: string; name: string; phase_order: number } | null) ?? null
      const key   = phase?.id ?? "__no_phase__"

      if (!map.has(key)) {
        map.set(key, {
          key,
          name:        phase?.name        ?? tT("noPhase"),
          phaseOrder:  phase?.phase_order ?? 9999,
          tasks: [],
        })
      }
      map.get(key)!.tasks.push(t)
    }

    // Sort within each group by task_order then created_at
    for (const g of map.values()) {
      g.tasks.sort((a, b) =>
        (a.task_order ?? 0) - (b.task_order ?? 0) ||
        a.created_at.localeCompare(b.created_at)
      )
    }

    // Sort groups: phases by phase_order, "Sin fase" always last
    return Array.from(map.values()).sort((a, b) => a.phaseOrder - b.phaseOrder)
  })()

  // ── helpers ────────────────────────────────────────────────────────────────
  function toggleStatus(s: TaskStatus) {
    setStatusOpen((prev) => ({ ...prev, [s]: !prev[s] }))
  }
  function togglePhase(key: string) {
    setPhaseOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  function isPhaseOpen(key: string) {
    return phaseOpen[key] ?? false  // default collapsed
  }

  const FILTERS: { value: TaskFilter; label: string }[] = [
    { value: "all",        label: tT("all") },
    { value: "mine",       label: tT("mine") },
    { value: "unassigned", label: tT("unassigned") },
  ]

  const colSpan = groupMode === "phase" ? 4 : 5

  if (tasks.length === 0) {
    return (
      <div className="border rounded-lg py-10 text-center text-sm text-muted-foreground bg-card">
        {tT("noTasksYet")}
      </div>
    )
  }

  const drawerDeliverable = drawerTask ? (deliverablesByTaskId[drawerTask.id] ?? null) : null
  const detailDeliverable = detailTask ? (deliverablesByTaskId[detailTask.id] ?? null) : null

  return (
    <>
      {/* Toolbar: filters + group toggle */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                filter === f.value
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {f.label}
            </button>
          ))}
          {filter !== "all" && (
            <span className="ml-2 text-xs text-muted-foreground">
              {tT("filterCount", { filtered: filteredTasks.length, total: tasks.length })}
            </span>
          )}
        </div>

        {/* Group mode toggle — only shown when project has phases */}
        {hasPhases && (
          <div className="ml-auto flex items-center gap-0.5 rounded-full bg-muted p-0.5">
            {(["status", "phase"] as GroupMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setGroupMode(mode)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  groupMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "status" ? tT("groupByStatus") : tT("groupByPhase")}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="w-8 px-3 py-2.5" />
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{tT("taskCol")}</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{tT("statusCol")}</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{tT("assigneeCol")}</th>
              {groupMode === "status" && (
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{tT("phaseCol")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {/* ── STATUS MODE ──────────────────────────────────────── */}
            {groupMode === "status" && (
              <>
                {statusGroups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      {filter === "mine" ? tT("noMineTasks") : tT("noUnassignedTasks")}
                    </td>
                  </tr>
                )}
                {statusGroups.map((group) => (
                  <>
                    <tr key={`sh-${group.value}`}>
                      <td colSpan={5} className="p-0">
                        <StatusGroupHeader
                          label={group.label}
                          count={group.tasks.length}
                          isOpen={statusOpen[group.value]}
                          onToggle={() => toggleStatus(group.value)}
                          status={group.value}
                        />
                      </td>
                    </tr>
                    {statusOpen[group.value] && group.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        projectId={projectId}
                        employees={employees}
                        isAdmin={isAdmin}
                        deliverable={deliverablesByTaskId[task.id] ?? null}
                        onDeliverableClick={setDrawerTask}
                        onRowClick={setDetailTask}
                        showPhaseCol
                      />
                    ))}
                  </>
                ))}
              </>
            )}

            {/* ── PHASE MODE ───────────────────────────────────────── */}
            {groupMode === "phase" && (
              <>
                {phaseGroups.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      {filter === "mine" ? tT("noMineTasks") : tT("noUnassignedTasks")}
                    </td>
                  </tr>
                )}
                {phaseGroups.map((group) => (
                  <>
                    <tr key={`ph-${group.key}`}>
                      <td colSpan={4} className="p-0">
                        <PhaseGroupHeader
                          name={group.name}
                          phaseOrder={group.phaseOrder}
                          total={group.tasks.length}
                          done={group.tasks.filter((t) => t.status === "Done").length}
                          isOpen={isPhaseOpen(group.key)}
                          onToggle={() => togglePhase(group.key)}
                        />
                      </td>
                    </tr>
                    {isPhaseOpen(group.key) && group.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        projectId={projectId}
                        employees={employees}
                        isAdmin={isAdmin}
                        deliverable={deliverablesByTaskId[task.id] ?? null}
                        onDeliverableClick={setDrawerTask}
                        onRowClick={setDetailTask}
                        showPhaseCol={false}
                      />
                    ))}
                  </>
                ))}
              </>
            )}
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
          sops={sops}
          deliverable={detailDeliverable}
          onDeliverableClick={setDrawerTask}
          onClose={() => setDetailTask(null)}
        />
      )}
    </>
  )
}
