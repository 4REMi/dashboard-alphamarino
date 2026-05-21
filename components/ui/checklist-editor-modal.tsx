"use client"

import { useState, useRef, useTransition } from "react"
import { GripVertical, Lock, X, Plus, ListChecks } from "lucide-react"
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"

export interface ChecklistModalItem {
  id: string
  text: string
  is_blocking: boolean
  item_order: number
}

interface ModalProps {
  taskTitle: string
  initialItems: ChecklistModalItem[]
  onClose: () => void
  onAdd:    (text: string, isBlocking: boolean) => Promise<ChecklistModalItem>
  onUpdate: (id: string, text: string, isBlocking: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder:(orderedIds: string[]) => Promise<void>
}

// ── Sortable row ──────────────────────────────────────────────────

function SortableChecklistRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: ChecklistModalItem
  onUpdate: (id: string, text: string, isBlocking: boolean) => void
  onDelete: (id: string) => void
}) {
  const [text, setText] = useState(item.text)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  function commitText() {
    const trimmed = text.trim()
    if (trimmed && trimmed !== item.text) onUpdate(item.id, trimmed, item.is_blocking)
    else setText(item.text)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 group hover:bg-muted/40 rounded-lg transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        tabIndex={-1}
        className="flex-shrink-0 p-0.5 text-muted-foreground/25 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none transition-colors"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          if (e.key === "Escape") { setText(item.text); (e.target as HTMLInputElement).blur() }
        }}
        className="flex-1 min-w-0 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 py-0"
      />

      <button
        type="button"
        onClick={() => onUpdate(item.id, text.trim() || item.text, !item.is_blocking)}
        title={item.is_blocking ? "Obligatorio — click para hacer opcional" : "Opcional — click para hacer obligatorio"}
        className={cn(
          "flex-shrink-0 p-1 rounded transition-all",
          item.is_blocking
            ? "text-destructive"
            : "text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-muted-foreground"
        )}
      >
        <Lock className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="flex-shrink-0 p-1 rounded text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────

export function ChecklistEditorModal({
  taskTitle,
  initialItems,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
}: ModalProps) {
  const [items, setItems] = useState<ChecklistModalItem[]>(
    [...initialItems].sort((a, b) => a.item_order - b.item_order)
  )
  const [addText, setAddText]         = useState("")
  const [addBlocking, setAddBlocking] = useState(false)
  const [, startTransition]           = useTransition()
  const addInputRef                   = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = items.findIndex((i) => i.id === active.id)
    const newIdx = items.findIndex((i) => i.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(items, oldIdx, newIdx)
    setItems(reordered)
    startTransition(async () => {
      try { await onReorder(reordered.map((i) => i.id)) } catch (e) { console.error("[checklist] reorder failed:", e) }
    })
  }

  function handleUpdate(id: string, text: string, isBlocking: boolean) {
    setItems((prev) =>
      prev.map((i) => i.id === id ? { ...i, text, is_blocking: isBlocking } : i)
    )
    startTransition(async () => {
      try { await onUpdate(id, text, isBlocking) } catch { /* ignore */ }
    })
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    startTransition(async () => {
      try { await onDelete(id) } catch { /* ignore */ }
    })
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const text = addText.trim()
    if (!text) return
    setAddText("")
    setAddBlocking(false)
    startTransition(async () => {
      try {
        const created = await onAdd(text, addBlocking)
        setItems((prev) => [...prev, created])
      } catch { /* ignore */ }
    })
    addInputRef.current?.focus()
  }

  const blockingCount = items.filter((i) => i.is_blocking).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <ListChecks className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{taskTitle}</p>
            <p className="text-xs text-muted-foreground">
              {items.length} ítem{items.length !== 1 ? "s" : ""}
              {blockingCount > 0 && (
                <span className="text-destructive ml-2 inline-flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5" />
                  {blockingCount} obligatorio{blockingCount !== 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {items.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">
              Sin ítems. Agrega el primero abajo.
            </p>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item) => (
                <SortableChecklistRow
                  key={item.id}
                  item={item}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Add form */}
        <div className="border-t border-border px-4 py-3 flex-shrink-0">
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={addInputRef}
              autoFocus
              type="text"
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onClose() }}
              placeholder="Nuevo ítem de checklist…"
              className="flex-1 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/40"
            />
            <button
              type="button"
              onClick={() => setAddBlocking((b) => !b)}
              title={addBlocking ? "Obligatorio" : "Opcional — click para obligatorio"}
              className={cn(
                "flex-shrink-0 p-1.5 rounded-lg transition-colors",
                addBlocking
                  ? "text-destructive bg-destructive/10"
                  : "text-muted-foreground/30 hover:text-muted-foreground"
              )}
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
            <button
              type="submit"
              disabled={!addText.trim()}
              className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              Agregar
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
