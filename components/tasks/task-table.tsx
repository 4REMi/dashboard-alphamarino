"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { deleteTask, updateTask, updateTaskStatus, updateTaskAssignee, updateTaskUrgent, createChecklistItem, toggleChecklistItem, updateChecklistItem, deleteChecklistItem, reorderChecklistItems } from "@/lib/actions/tasks"
import { assignSopToTask } from "@/lib/actions/sops"
import { DeliverableDrawer } from "@/components/projects/deliverable-drawer"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, CalendarDays, ChevronDown, ChevronRight, UserX, Flag, Paperclip, X, BookOpen, Search, ExternalLink, GripVertical, Lock, ListChecks, Plus } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Task, Profile, TaskStatus, Deliverable, Sop, TaskChecklistItem } from "@/lib/types"
import { phaseColor } from "@/lib/phase-colors"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

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

// Sortable due-date key: sooner is smaller, no due date always sorts last —
// used as a tiebreaker so ad-hoc tasks (which share task_order 0) still
// surface in a sensible order instead of falling straight to created_at.
function dueDateRank(t: Task): number {
  return t.due_date ? new Date(t.due_date).getTime() : Infinity
}

// ─── Status Picker ────────────────────────────────────────────────────────────

function StatusPicker({
  task,
  projectId,
  checklistItems,
  onStatusChange,
}: {
  task: Task
  projectId: string | null
  checklistItems?: TaskChecklistItem[]
  onStatusChange?: (status: TaskStatus) => void
}) {
  const tTaskStatus = useTranslations("taskStatus")
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const [optimisticStatus, setOptimisticStatus] = useState<TaskStatus>(task.status)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const items = checklistItems ?? task.checklist_items ?? []
  const blockingPending = items.filter((i) => i.is_blocking && !i.is_checked).length

  // Keep the badge in sync when the task's status changes from elsewhere
  // (e.g. another picker instance for the same task, or the modal).
  useEffect(() => {
    setOptimisticStatus(task.status)
  }, [task.status])

  // Mirror checklist completion into the status badge as items are (un)checked:
  // fully checked -> Done, some checked -> In Progress, none -> Todo. Skips the
  // initial mount so it only reacts to in-session checklist edits, not the
  // task's saved status.
  const isFirstChecklistSync = useRef(true)
  useEffect(() => {
    if (isFirstChecklistSync.current) { isFirstChecklistSync.current = false; return }
    if (!checklistItems || checklistItems.length === 0) return
    const checked = checklistItems.filter((i) => i.is_checked).length
    const derived: TaskStatus = checked === checklistItems.length ? "Done" : checked > 0 ? "In Progress" : "Todo"
    setOptimisticStatus(derived)
    onStatusChange?.(derived)
  }, [checklistItems])

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
    setBlockError(null)
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen((v) => !v)
  }

  function handleSelect(next: TaskStatus) {
    setOpen(false)
    if (next === optimisticStatus) return
    if (next === "Done" && blockingPending > 0) {
      setBlockError(`${blockingPending} item${blockingPending > 1 ? "s" : ""} obligatorio${blockingPending > 1 ? "s" : ""} pendiente${blockingPending > 1 ? "s" : ""}`)
      return
    }
    setBlockError(null)
    setOptimisticStatus(next)
    onStatusChange?.(next)
    startTransition(async () => {
      try { await updateTaskStatus(task.id, next, projectId) }
      catch { setOptimisticStatus(task.status); onStatusChange?.(task.status) }
    })
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
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
      {blockError && (
        <p className="text-[10px] text-destructive leading-tight flex items-center gap-0.5">
          <Lock className="w-2.5 h-2.5 flex-shrink-0" />
          {blockError}
        </p>
      )}
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
                opt.value === optimisticStatus && "font-semibold",
                opt.value === "Done" && blockingPending > 0 && "opacity-40 cursor-not-allowed"
              )}
            >
              <span className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                opt.value === "Todo"        && "bg-muted-foreground/40",
                opt.value === "In Progress" && "bg-info",
                opt.value === "Done"        && "bg-success",
              )} />
              {tTaskStatus(TASK_STATUS_KEY[opt.value])}
              {opt.value === "Done" && blockingPending > 0 && (
                <Lock className="w-3 h-3 ml-auto text-muted-foreground" />
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Urgent Flag ──────────────────────────────────────────────────────────────

function UrgentFlag({ task, projectId }: { task: Task; projectId: string | null }) {
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

function AssigneePicker({ task, projectId, employees, onAssigneeChange }: { task: Task; projectId: string | null; employees: Profile[]; onAssigneeChange?: (id: string | null) => void }) {
  const tCommon = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const [optimisticAssignee, setOptimisticAssignee] = useState<Profile | null>(
    (task.assignee as Profile | null | undefined) ?? null
  )
  const [isPending, startTransition] = useTransition()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Keep the badge in sync when the task's assignee changes from elsewhere
  // (e.g. another picker instance for the same task, or the modal).
  useEffect(() => {
    setOptimisticAssignee((task.assignee as Profile | null | undefined) ?? null)
  }, [task.assignee_id])

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
    onAssigneeChange?.(employee?.id ?? null)
    startTransition(async () => {
      try { await updateTaskAssignee(task.id, employee?.id ?? null, projectId) }
      catch {
        setOptimisticAssignee((task.assignee as Profile | null | undefined) ?? null)
        onAssigneeChange?.(task.assignee_id ?? null)
      }
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
  projectId: string | null
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

// ─── Checklist Editor ────────────────────────────────────────────────────────

function SortableChecklistItem({
  item,
  onToggle,
  onDelete,
  onBlockingToggle,
}: {
  item: TaskChecklistItem
  onToggle: (id: string, checked: boolean) => void
  onDelete: (id: string) => void
  onBlockingToggle: (id: string, blocking: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("flex items-center gap-2 group py-1", isDragging && "opacity-50 bg-muted rounded")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <input
        type="checkbox"
        checked={item.is_checked}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        className="rounded flex-shrink-0"
      />
      <span className={cn("flex-1 text-sm min-w-0", item.is_checked && "line-through text-muted-foreground")}>
        {item.text}
      </span>
      <button
        type="button"
        onClick={() => onBlockingToggle(item.id, !item.is_blocking)}
        title={item.is_blocking ? "Obligatorio — click para hacer opcional" : "Opcional — click para hacer obligatorio"}
        className={cn(
          "flex-shrink-0 transition-opacity",
          item.is_blocking
            ? "text-destructive opacity-100"
            : "text-muted-foreground/30 opacity-0 group-hover:opacity-100"
        )}
      >
        <Lock className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function ChecklistEditor({
  taskId,
  projectId,
  initialItems,
  onItemsChange,
}: {
  taskId: string
  projectId: string | null
  initialItems: TaskChecklistItem[]
  onItemsChange: (items: TaskChecklistItem[]) => void
}) {
  const [items, setItems] = useState<TaskChecklistItem[]>(
    [...initialItems].sort((a, b) => a.item_order - b.item_order)
  )
  const [addingText, setAddingText] = useState("")
  const [addingBlocking, setAddingBlocking] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [isPending, startTransition] = useTransition()
  const addInputRef = useRef<HTMLInputElement>(null)

  const checked = items.filter((i) => i.is_checked).length
  const blockingPending = items.filter((i) => i.is_blocking && !i.is_checked).length

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function sync(next: TaskChecklistItem[]) {
    setItems(next)
    onItemsChange(next)
  }

  function handleToggle(id: string, checked: boolean) {
    const next = items.map((i) => i.id === id ? { ...i, is_checked: checked } : i)
    sync(next)
    startTransition(async () => {
      try { await toggleChecklistItem(id, checked, projectId) }
      catch { sync(items) }
    })
  }

  function handleBlockingToggle(id: string, blocking: boolean) {
    const next = items.map((i) => i.id === id ? { ...i, is_blocking: blocking } : i)
    sync(next)
    startTransition(async () => {
      try { await updateChecklistItem(id, { is_blocking: blocking }, projectId) }
      catch { sync(items) }
    })
  }

  function handleDelete(id: string) {
    const next = items.filter((i) => i.id !== id)
    sync(next)
    startTransition(async () => {
      try { await deleteChecklistItem(id, projectId) }
      catch { sync(items) }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    const next = arrayMove(items, oldIndex, newIndex)
    sync(next)
    startTransition(async () => {
      await reorderChecklistItems(next.map((i) => i.id), projectId)
    })
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const text = addingText.trim()
    if (!text) return
    setAddingText("")
    setAddingBlocking(false)
    startTransition(async () => {
      try {
        const created = await createChecklistItem(taskId, text, addingBlocking, projectId)
        const next = [...items, created]
        sync(next)
      } catch { /* ignore */ }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5" />
          Checklist
          {items.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground ml-1">
              {checked}/{items.length}
            </span>
          )}
        </Label>
        {blockingPending > 0 && (
          <span className="text-[11px] text-destructive flex items-center gap-1">
            <Lock className="w-3 h-3" />
            {blockingPending} obligatorio{blockingPending > 1 ? "s" : ""} pendiente{blockingPending > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className={cn("px-1", isPending && "opacity-70")}>
              {items.map((item) => (
                <SortableChecklistItem
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onBlockingToggle={handleBlockingToggle}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {isAdding ? (
        <form onSubmit={handleAdd} className="flex items-center gap-2 pl-5">
          <input
            ref={addInputRef}
            autoFocus
            type="text"
            value={addingText}
            onChange={(e) => setAddingText(e.target.value)}
            placeholder="Descripción del item…"
            className="flex-1 text-sm border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => { if (e.key === "Escape") { setIsAdding(false); setAddingText("") } }}
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none flex-shrink-0" title="Marcar como obligatorio (bloquea cierre de tarea)">
            <input
              type="checkbox"
              checked={addingBlocking}
              onChange={(e) => setAddingBlocking(e.target.checked)}
              className="rounded"
            />
            <Lock className={cn("w-3 h-3", addingBlocking ? "text-destructive" : "text-muted-foreground/50")} />
          </label>
          <button type="submit" disabled={!addingText.trim()} className="text-xs text-primary hover:underline disabled:opacity-40 flex-shrink-0">
            Agregar
          </button>
          <button type="button" onClick={() => { setIsAdding(false); setAddingText("") }} className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pl-5 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Agregar item
        </button>
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
  onTaskUpdate,
}: {
  task: Task
  projectId: string | null
  employees: Profile[]
  isAdmin: boolean
  sops: Sop[]
  deliverable: Deliverable | null
  onDeliverableClick: (task: Task) => void
  onClose: () => void
  onTaskUpdate: (patch: Partial<Task>) => void
}) {
  const tT = useTranslations("tasks")
  const tC = useTranslations("common")
  const [isPending, startTransition] = useTransition()
  const [liveChecklistItems, setLiveChecklistItems] = useState<TaskChecklistItem[]>(
    [...(task.checklist_items ?? [])].sort((a, b) => a.item_order - b.item_order)
  )
  const [currentStatus, setCurrentStatus] = useState<TaskStatus>(task.status)
  const [currentAssigneeId, setCurrentAssigneeId] = useState<string | null>(task.assignee_id)
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
    fd.set("project_id", projectId ?? "")
    // include current status/assignee so they're preserved
    fd.set("status", currentStatus)
    fd.set("assignee_id", currentAssigneeId ?? "")
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
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            {phase && <PhaseBadge phase={phase} />}
            <StatusPicker
              task={task}
              projectId={projectId}
              checklistItems={liveChecklistItems}
              onStatusChange={(status) => { setCurrentStatus(status); onTaskUpdate({ status }) }}
            />
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
            <AutoTextarea
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
              <AssigneePicker
                task={task}
                projectId={projectId}
                employees={employees}
                onAssigneeChange={(id) => {
                  setCurrentAssigneeId(id)
                  onTaskUpdate({ assignee_id: id, assignee: employees.find((e) => e.id === id) ?? null })
                }}
              />
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

          {/* Checklist */}
          <div className="border-t pt-4">
            <ChecklistEditor
              taskId={task.id}
              projectId={projectId}
              initialItems={task.checklist_items ?? []}
              onItemsChange={(items) => { setLiveChecklistItems(items); onTaskUpdate({ checklist_items: items }) }}
            />
          </div>

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

// ─── Task Card (mobile) ───────────────────────────────────────────────────────

function TaskCard({ task, projectId, deliverable, onDeliverableClick, onCardClick }: {
  task: Task
  projectId: string | null
  deliverable: Deliverable | null
  onDeliverableClick: (task: Task) => void
  onCardClick: (task: Task) => void
}) {
  const tTaskStatus = useTranslations("taskStatus")
  const phase = (task.phase as { id: string; name: string; phase_order: number } | null | undefined) ?? null
  const assignee = task.assignee as { full_name: string; avatar_url: string | null } | null | undefined

  return (
    <div
      onClick={() => onCardClick(task)}
      className={cn(
        "border rounded-lg bg-card px-4 py-3 space-y-2 cursor-pointer active:bg-muted/50 transition-colors",
        task.is_urgent && "border-destructive/30 bg-destructive/5"
      )}
    >
      {/* Title row */}
      <div className="flex items-start gap-2">
        {task.is_urgent && <Flag className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5 fill-current" />}
        <p className={cn("text-sm font-medium flex-1 min-w-0", task.status === "Done" && "line-through text-muted-foreground")}>
          {task.title}
        </p>
        {(() => {
          const cl = task.checklist_items ?? []
          if (cl.length === 0) return null
          const done = cl.filter((i) => i.is_checked).length
          const hasBlocking = cl.some((i) => i.is_blocking && !i.is_checked)
          return (
            <span className={cn(
              "flex items-center gap-0.5 text-[10px] font-medium flex-shrink-0 px-1.5 py-0.5 rounded-full mt-0.5",
              hasBlocking ? "bg-destructive/10 text-destructive" : done === cl.length ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            )}>
              {hasBlocking && <Lock className="w-2.5 h-2.5" />}
              {done}/{cl.length}
            </span>
          )
        })()}
        {task.requires_deliverable && (
          <button
            onClick={(e) => { e.stopPropagation(); onDeliverableClick(task) }}
            className={cn("flex-shrink-0 p-1 rounded transition-colors", deliverable ? "text-success" : "text-warning")}
          >
            <Paperclip className={cn("w-3.5 h-3.5", deliverable && "fill-current opacity-80")} />
          </button>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status badge */}
        <span className={cn(
          "text-xs font-semibold px-2 py-0.5 rounded-full",
          task.status === "Todo"        && "bg-secondary text-secondary-foreground",
          task.status === "In Progress" && "bg-info-subtle text-info-subtle-foreground",
          task.status === "Done"        && "bg-success-subtle text-success-subtle-foreground",
        )}>
          {tTaskStatus(TASK_STATUS_KEY[task.status])}
        </span>

        {/* Phase */}
        {phase && <PhaseBadge phase={phase} />}

        {/* Assignee */}
        {assignee && (
          <span className="text-xs text-muted-foreground">{assignee.full_name.split(" ")[0]}</span>
        )}

        {/* Unresolved position assignment flag */}
        {!assignee && task.assignment_flag === "no_match" && task.position_id && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 flex-shrink-0"
            title="Ningún miembro del proyecto tiene este puesto">
            Sin {(task.position as { name?: string } | null)?.name ?? "puesto"}
          </span>
        )}
        {!assignee && task.assignment_flag === "multi" && task.position_id && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 flex-shrink-0"
            title="Múltiples miembros tienen este puesto — asigna manualmente">
            Múltiples {(task.position as { name?: string } | null)?.name ?? "puesto"}
          </span>
        )}

        {/* Due date */}
        {task.due_date && (
          <span className={cn(
            "flex items-center gap-0.5 text-xs ml-auto flex-shrink-0",
            new Date(task.due_date) < new Date() && task.status !== "Done"
              ? "text-destructive font-medium"
              : "text-muted-foreground"
          )}>
            <CalendarDays className="w-3 h-3" />
            {formatDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, projectId, employees, isAdmin, deliverable, onDeliverableClick, onRowClick, onTaskUpdate, showPhaseCol = true }: {
  task: Task
  projectId: string | null
  employees: Profile[]
  isAdmin: boolean
  deliverable: Deliverable | null
  onDeliverableClick: (task: Task) => void
  onRowClick: (task: Task) => void
  onTaskUpdate: (taskId: string, patch: Partial<Task>) => void
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
            {(() => {
              const cl = task.checklist_items ?? []
              if (cl.length === 0) return null
              const done = cl.filter((i) => i.is_checked).length
              const hasBlocking = cl.some((i) => i.is_blocking && !i.is_checked)
              return (
                <span className={cn(
                  "flex items-center gap-0.5 text-[10px] font-medium flex-shrink-0 px-1.5 py-0.5 rounded-full",
                  hasBlocking
                    ? "bg-destructive/10 text-destructive"
                    : done === cl.length
                    ? "bg-success/10 text-success"
                    : "bg-muted text-muted-foreground"
                )}>
                  {hasBlocking && <Lock className="w-2.5 h-2.5" />}
                  {done}/{cl.length}
                </span>
              )
            })()}
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
        <StatusPicker
          task={task}
          projectId={projectId}
          onStatusChange={(status) => onTaskUpdate(task.id, { status })}
        />
      </td>

      {/* Assignee */}
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <AssigneePicker
          task={task}
          projectId={projectId}
          employees={employees}
          onAssigneeChange={(id) => onTaskUpdate(task.id, { assignee_id: id, assignee: employees.find((e) => e.id === id) ?? null })}
        />
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
  projectId: string | null
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
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [filter,     setFilter]     = useState<TaskFilter>("all")
  const [groupMode,  setGroupMode]  = useState<GroupMode>(() => tasks.some((t) => t.phase) ? "phase" : "status")

  // Local copy of tasks so picker/checklist changes can be reflected
  // immediately across the row and the detail modal, without waiting
  // for a server round-trip. Re-synced whenever fresh data arrives.
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks)
  useEffect(() => { setLocalTasks(tasks) }, [tasks])

  function patchTask(taskId: string, patch: Partial<Task>) {
    setLocalTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...patch } : t))
  }

  // ── derived ────────────────────────────────────────────────────────────────
  // Detect whether this project has phases
  const hasPhases = localTasks.some((t) => t.phase)

  const filteredTasks = localTasks.filter((t) => {
    if (filter === "mine")       return currentUserId && t.assignee_id === currentUserId
    if (filter === "unassigned") return !t.assignee_id
    return true
  })

  const detailTask = localTasks.find((t) => t.id === detailTaskId) ?? null

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
        const dueDiff = dueDateRank(a) - dueDateRank(b)
        if (dueDiff !== 0) return dueDiff
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

    // Sort within each group by task_order, then soonest due date, then created_at
    for (const g of map.values()) {
      g.tasks.sort((a, b) =>
        (a.task_order ?? 0) - (b.task_order ?? 0) ||
        dueDateRank(a) - dueDateRank(b) ||
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

  if (localTasks.length === 0) {
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
              {tT("filterCount", { filtered: filteredTasks.length, total: localTasks.length })}
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

      {/* ── Mobile: flat card list ─────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {filteredTasks.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {filter === "mine" ? tT("noMineTasks") : filter === "unassigned" ? tT("noUnassignedTasks") : tT("noTasksYet")}
          </p>
        ) : (
          filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              projectId={projectId}
              deliverable={deliverablesByTaskId[task.id] ?? null}
              onDeliverableClick={setDrawerTask}
              onCardClick={(t) => setDetailTaskId(t.id)}
            />
          ))
        )}
      </div>

      {/* ── Desktop: grouped table ──────────────────────────────── */}
      <div className="hidden md:block border rounded-lg overflow-hidden bg-card">
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
                        onRowClick={(t) => setDetailTaskId(t.id)}
                        onTaskUpdate={patchTask}
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
                        onRowClick={(t) => setDetailTaskId(t.id)}
                        onTaskUpdate={patchTask}
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
          onClose={() => setDetailTaskId(null)}
          onTaskUpdate={(patch) => patchTask(detailTask.id, patch)}
        />
      )}
    </>
  )
}
