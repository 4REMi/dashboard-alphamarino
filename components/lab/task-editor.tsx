"use client"

// Lab-specific task components — same visual language as Operations Lab

import { useState, useTransition } from "react"
import type { LabPhaseTask, LabPhaseTaskChecklistItem, Sop } from "@/lib/types"
import {
  addTaskChecklistItem, updateTaskChecklistItem, deleteTaskChecklistItem,
  reorderLabTaskChecklistItems, updatePhaseTask,
} from "@/lib/actions/lab"
import {
  GripVertical, Pencil, X, BookOpen, Search, Lock, ListChecks,
  Paperclip,
} from "lucide-react"
import {
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { InlineInput } from "@/components/lab/shared"
import { AutoTextarea } from "@/components/ui/auto-textarea"
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

  const checklistItems = task.checklist_items ?? []
  const sopName = (task.sop as { title?: string } | null)?.title ?? null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card"
    >
      <div className="flex items-center gap-2 px-3 py-3">
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
            "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0",
            checklistItems.some((i) => i.is_blocking)
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          )}>
            {checklistItems.some((i) => i.is_blocking) && <Lock className="w-2.5 h-2.5" />}
            {checklistItems.length}
          </span>
        )}

        {task.requires_deliverable && (
          <Paperclip className="w-3.5 h-3.5 text-info flex-shrink-0" />
        )}

        {sopName && (
          <span
            title={sopName}
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-primary/10 text-primary"
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

      <div className="px-3 pb-2">
        <LabChecklistEditor
          taskId={task.id}
          taskTitle={task.title}
          initialItems={checklistItems}
        />
      </div>
    </div>
  )
}

// ── Edit task modal ───────────────────────────────────────────────────────────

export function LabEditTaskModal({
  task,
  sops,
  isPending,
  onClose,
  onSave,
}: {
  task: LabPhaseTask
  sops: Sop[]
  isPending: boolean
  onClose: () => void
  onSave: (patch: Partial<LabPhaseTask>) => void
}) {
  const [sopId, setSopId] = useState(task.sop_id ?? "")
  const [sopSearch, setSopSearch] = useState("")
  const [, startTransition] = useTransition()

  const filteredSops = sops.filter((s) =>
    s.title.toLowerCase().includes(sopSearch.toLowerCase()) ||
    (s.category ?? "").toLowerCase().includes(sopSearch.toLowerCase())
  )
  const selectedSop = sops.find((s) => s.id === sopId) ?? null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("sop_id", sopId)
    startTransition(async () => {
      await updatePhaseTask(task.id, fd)
      onSave({
        title:                fd.get("title") as string,
        description:          (fd.get("description") as string) || null,
        requires_deliverable: fd.get("requires_deliverable") === "true",
        sop_id:               sopId || null,
        sop:                  selectedSop ? { id: selectedSop.id, title: selectedSop.title } : null,
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="font-semibold text-sm">Editar tarea</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título *</label>
            <InlineInput name="title" required defaultValue={task.title} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descripción</label>
            <AutoTextarea
              name="description"
              rows={3}
              defaultValue={task.description ?? ""}
              placeholder="Descripción detallada…"
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 px-3 py-2 rounded border border-input bg-background text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                name="requires_deliverable"
                value="true"
                defaultChecked={task.requires_deliverable}
                className="accent-info"
              />
              Requiere entregable
            </label>
          </div>

          {/* SOP picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5 block">
              <BookOpen className="w-3.5 h-3.5" />
              SOP asignado
            </label>
            {selectedSop ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/30 bg-primary/5 text-sm">
                <BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate font-medium text-primary">{selectedSop.title}</span>
                {selectedSop.category && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">{selectedSop.category}</span>
                )}
                <button
                  type="button"
                  onClick={() => { setSopId(""); setSopSearch("") }}
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={sopSearch}
                    onChange={(e) => setSopSearch(e.target.value)}
                    placeholder="Buscar SOP…"
                    className="w-full rounded border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                {sops.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-1.5">No hay SOPs en el banco aún.</p>
                ) : filteredSops.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-1.5">Sin resultados.</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
                    {filteredSops.map((sop) => (
                      <button
                        key={sop.id}
                        type="button"
                        onClick={() => { setSopId(sop.id); setSopSearch("") }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="flex-1 min-w-0 text-sm truncate">{sop.title}</span>
                        {sop.category && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">{sop.category}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <input type="hidden" name="sop_id" value={sopId} />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
