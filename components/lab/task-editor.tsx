"use client"

// Lab-specific task components — same visual language as Operations Lab

import { useState } from "react"
import type { LabPhaseTask, LabPhaseTaskChecklistItem, LabProposedPhaseTask } from "@/lib/types"
import {
  addTaskChecklistItem, updateTaskChecklistItem, deleteTaskChecklistItem,
  reorderLabTaskChecklistItems,
} from "@/lib/actions/lab"
import {
  GripVertical, Pencil, X, BookOpen, Lock, ListChecks,
  Paperclip, UserCircle,
} from "lucide-react"
import {
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { ChecklistEditorModal, type ChecklistModalItem } from "@/components/ui/checklist-editor-modal"

// ── Lab checklist trigger (compact inline view + modal) ──────────────────────

export function LabChecklistEditor({
  taskId,
  taskTitle,
  initialItems,
}: {
  taskId: string
  taskTitle: string
  initialItems: LabPhaseTaskChecklistItem[]
}) {
  const [items, setItems] = useState<ChecklistModalItem[]>(
    [...initialItems].sort((a, b) => a.item_order - b.item_order)
  )
  const [showModal, setShowModal] = useState(false)
  const blockingCount = items.filter((i) => i.is_blocking).length

  return (
    <div className="mt-2 pl-5 border-t border-border/40 pt-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <ListChecks className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">Checklist plantilla</span>
        {blockingCount > 0 && (
          <span className="text-[11px] text-destructive/70 flex items-center gap-0.5 ml-0.5">
            <Lock className="w-2.5 h-2.5" />
            {blockingCount}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="ml-auto text-[11px] text-primary hover:underline transition-colors"
        >
          {items.length === 0 ? "+ Agregar" : "Editar"}
        </button>
      </div>

      {items.length > 0 && (
        <div className="space-y-0.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>
                {item.text}
              </span>
              {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ChecklistEditorModal
          taskTitle={taskTitle}
          initialItems={items}
          onClose={() => setShowModal(false)}
          onAdd={async (text, isBlocking) => {
            const created = await addTaskChecklistItem(taskId, text, isBlocking)
            const item = created as ChecklistModalItem
            setItems((prev) => [...prev, item])
            return item
          }}
          onUpdate={async (id, text, isBlocking) => {
            await updateTaskChecklistItem(id, text, isBlocking)
            setItems((prev) => prev.map((i) => i.id === id ? { ...i, text, is_blocking: isBlocking } : i))
          }}
          onDelete={async (id) => {
            await deleteTaskChecklistItem(id)
            setItems((prev) => prev.filter((i) => i.id !== id))
          }}
          onReorder={async (orderedIds) => {
            await reorderLabTaskChecklistItems(orderedIds)
            setItems((prev) => {
              const sorted = orderedIds.map((id, index) => {
                const item = prev.find((i) => i.id === id)!
                return { ...item, item_order: index }
              })
              return sorted
            })
          }}
        />
      )}
    </div>
  )
}

// ── Sortable task row ─────────────────────────────────────────────────────────

export function LabSortableTaskRow({
  task,
  index,
  onEdit,
  onDelete,
}: {
  task: LabPhaseTask
  index: number
  onEdit: (task: LabPhaseTask) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const checklistItems = [...(task.checklist_items ?? [])].sort((a, b) => a.item_order - b.item_order)
  const sopName = (task.sop as { title?: string } | null)?.title ?? null
  const positionName = (task.default_position as { name?: string } | null)?.name ?? null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group border-b border-border hover:bg-muted/40 transition-colors bg-card"
    >
      <div className="flex items-center gap-2 px-5 py-3">
        <button
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors flex-shrink-0 touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
          {index + 1}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>}
        </div>

        {checklistItems.length > 0 && (
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
            checklistItems.some((i) => i.is_blocking)
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          )}>
            {checklistItems.some((i) => i.is_blocking) && <Lock className="w-2.5 h-2.5" />}
            {checklistItems.length}
          </span>
        )}

        {positionName && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
            <UserCircle className="w-2.5 h-2.5" />
            <span className="hidden sm:inline max-w-[60px] truncate">{positionName}</span>
          </span>
        )}

        {task.requires_deliverable && (
          <Paperclip className="w-3.5 h-3.5 text-info flex-shrink-0" />
        )}

        {sopName && (
          <span
            title={sopName}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-primary/10 text-primary"
          >
            <BookOpen className="w-3 h-3" />
            <span className="hidden sm:inline max-w-[80px] truncate">{sopName}</span>
          </span>
        )}

        <button
          onClick={() => onEdit(task)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="px-5 pb-2">
        <LabChecklistEditor
          taskId={task.id}
          taskTitle={task.title}
          initialItems={checklistItems}
        />
      </div>
    </div>
  )
}

// ── Sortable row for a proposed-phase draft task — checklist is read-only here,
// edited entirely inside TaskFormModal (same pattern as the other 3 proposal kinds) ──

export function ProposedPhaseTaskSortableRow({
  task,
  index,
  onEdit,
  onDelete,
}: {
  task: LabProposedPhaseTask
  index: number
  onEdit: (task: LabProposedPhaseTask) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const checklistItems = [...(task.checklist_items ?? [])].sort((a, b) => a.item_order - b.item_order)
  const sopName = (task.sop as { title?: string } | null)?.title ?? null
  const positionName = (task.default_position as { name?: string } | null)?.name ?? null
  const blockingCount = checklistItems.filter((i) => i.is_blocking).length

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group border-b border-border hover:bg-muted/40 transition-colors bg-card"
    >
      <div className="flex items-center gap-2 px-5 py-3">
        <button
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors flex-shrink-0 touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
          {index + 1}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>}
        </div>

        {checklistItems.length > 0 && (
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
            blockingCount > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}>
            {blockingCount > 0 && <Lock className="w-2.5 h-2.5" />}
            {checklistItems.length}
          </span>
        )}

        {positionName && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
            <UserCircle className="w-2.5 h-2.5" />
            <span className="hidden sm:inline max-w-[60px] truncate">{positionName}</span>
          </span>
        )}

        {task.requires_deliverable && (
          <Paperclip className="w-3.5 h-3.5 text-info flex-shrink-0" />
        )}

        {sopName && (
          <span
            title={sopName}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-primary/10 text-primary"
          >
            <BookOpen className="w-3 h-3" />
            <span className="hidden sm:inline max-w-[80px] truncate">{sopName}</span>
          </span>
        )}

        <button
          onClick={() => onEdit(task)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {checklistItems.length > 0 && (
        <div className="pl-12 pr-5 pb-3 -mt-1">
          <div className="rounded-lg border border-border/50 divide-y divide-border/30 bg-muted/10">
            {checklistItems.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
                <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>{item.text}</span>
                {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

