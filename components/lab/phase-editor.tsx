"use client"

import { useState, useTransition } from "react"
import type { LabPhase, LabPhaseTask, Sop, Position } from "@/lib/types"
import {
  createPhase, updatePhase, deletePhase, submitPhase, retractPhase,
  addPhaseTask, deletePhaseTask, reorderPhaseTasks, reorderLabPhases,
} from "@/lib/actions/lab"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Check, X, LayoutList, Link2, ChevronRight, Send, RotateCcw, Pencil, CheckCircle2, XCircle, MessageSquare, GripVertical } from "lucide-react"
import { PanelHeader, EmptyPanel, InlineInput } from "@/components/lab/shared"
import { LabSortableTaskRow, LabEditTaskModal } from "@/components/lab/task-editor"

interface Props {
  initialPhases: LabPhase[]
  sops: Sop[]
  positions: Position[]
}

const STATUS_LABEL: Record<LabPhase["status"], string> = {
  draft: "Borrador", submitted: "En revisión", approved: "Aprobada", rejected: "Rechazada",
}
const STATUS_COLOR: Record<LabPhase["status"], string> = {
  draft: "text-muted-foreground", submitted: "text-amber-600",
  approved: "text-emerald-600", rejected: "text-destructive",
}

export function PhaseEditor({ initialPhases, sops, positions }: Props) {
  const [phases, setPhases] = useState<LabPhase[]>(initialPhases)
  const [selectedId, setSelectedId] = useState<string | null>(phases[0]?.id ?? null)
  const [showNewPhase, setShowNewPhase] = useState(false)
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selected = phases.find((p) => p.id === selectedId) ?? null

  // ── Phase CRUD ──────────────────────────────────────────────────────────────

  function handleCreatePhase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (!(fd.get("name") as string).trim()) return
    startTransition(async () => {
      const phase = await createPhase(fd)
      setPhases((prev) => [phase, ...prev])
      setSelectedId(phase.id)
      setShowNewPhase(false)
    })
  }

  function handleUpdatePhase(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updatePhase(id, fd)
      setPhases((prev) => prev.map((p) => p.id === id ? {
        ...p,
        name: fd.get("name") as string,
        description: (fd.get("description") as string) || null,
      } : p))
      setEditingPhaseId(null)
    })
  }

  function handleDeletePhase(id: string) {
    if (!confirm("¿Eliminar esta fase?")) return
    startTransition(async () => {
      await deletePhase(id)
      setPhases((prev) => {
        const next = prev.filter((p) => p.id !== id)
        if (selectedId === id) setSelectedId(next[0]?.id ?? null)
        return next
      })
    })
  }

  function handleSubmitPhase(id: string) {
    startTransition(async () => {
      await submitPhase(id)
      setPhases((prev) => prev.map((p) => p.id === id ? { ...p, status: "submitted" } : p))
    })
  }

  function handleRetractPhase(id: string) {
    startTransition(async () => {
      await retractPhase(id)
      setPhases((prev) => prev.map((p) => p.id === id ? { ...p, status: "draft" } : p))
    })
  }

  // ── Task CRUD ────────────────────────────────────────────────────────────────

  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState<LabPhaseTask | null>(null)

  function getSelectedTasks(): LabPhaseTask[] {
    return selected?.tasks ?? []
  }

  function handleAddTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selected) return
    const fd = new FormData(e.currentTarget)
    if (!(fd.get("title") as string).trim()) return
    fd.set("requires_deliverable", "false")
    fd.set("sop_id", "")
    startTransition(async () => {
      const task = await addPhaseTask(selected.id, fd)
      setPhases((prev) => prev.map((p) => p.id === selected.id
        ? { ...p, tasks: [...(p.tasks ?? []), task] }
        : p
      ))
      setShowAddTask(false)
    })
  }

  function handleDeleteTask(taskId: string) {
    if (!selected) return
    startTransition(async () => {
      await deletePhaseTask(taskId)
      setPhases((prev) => prev.map((p) => p.id === selected.id
        ? { ...p, tasks: (p.tasks ?? []).filter((t) => t.id !== taskId) }
        : p
      ))
    })
  }

  function handleTaskSaved(patch: Partial<LabPhaseTask>) {
    if (!editingTask || !selected) return
    setPhases((prev) => prev.map((p) => p.id === selected.id
      ? { ...p, tasks: (p.tasks ?? []).map((t) => t.id === editingTask.id ? { ...t, ...patch } : t) }
      : p
    ))
    setEditingTask(null)
  }

  // ── DnD ─────────────────────────────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handlePhaseDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setPhases((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id)
      const newIndex = prev.findIndex((p) => p.id === over.id)
      const reordered = arrayMove(prev, oldIndex, newIndex)
      startTransition(async () => { await reorderLabPhases(reordered.map((p) => p.id)) })
      return reordered
    })
  }

  function handleTaskDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !selected) return
    const tasks = getSelectedTasks()
    const oldIndex = tasks.findIndex((t) => t.id === active.id)
    const newIndex = tasks.findIndex((t) => t.id === over.id)
    const reordered = arrayMove(tasks, oldIndex, newIndex)
    setPhases((prev) => prev.map((p) => p.id === selected.id ? { ...p, tasks: reordered } : p))
    startTransition(async () => {
      await reorderPhaseTasks(reordered.map((t) => t.id))
    })
  }

  const tasks = getSelectedTasks()
  const isEditable = selected ? (selected.status === "draft" || selected.status === "rejected") : false
  const lastReview = selected
    ? [...(selected.reviews ?? [])].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ).find((r) => r.action !== "comment")
    : null

  return (
    <>
      <div
        className="flex border border-border rounded-xl overflow-hidden bg-card"
        style={{ height: "calc(100vh - 220px)", minHeight: 480 }}
      >
        {/* ── PANEL 1: Mis fases ─────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-border">
          <PanelHeader
            title="Mis fases"
            subtitle={`${phases.length} fase${phases.length !== 1 ? "s" : ""}`}
            onAdd={() => { setShowNewPhase(true); setEditingPhaseId(null) }}
          />
          <div className="flex-1 overflow-y-auto">
            {showNewPhase && (
              <form onSubmit={handleCreatePhase} className="p-3 space-y-2 border-b border-border bg-primary/5">
                <InlineInput name="name" required autoFocus placeholder="Nombre de la fase…" />
                <InlineInput name="description" placeholder="Descripción (opcional)" />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowNewPhase(false)} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                  <button type="submit" disabled={isPending} className="p-1 rounded text-primary hover:text-primary/80 disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
                </div>
              </form>
            )}

            {phases.length === 0 && !showNewPhase && (
              <EmptyPanel icon={LayoutList} text="Usa + para crear tu primera fase" />
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhaseDragEnd}>
              <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {phases.map((phase) => {
                  const isSelected = phase.id === selectedId
                  if (editingPhaseId === phase.id) {
                    return (
                      <form key={phase.id} onSubmit={(e) => handleUpdatePhase(phase.id, e)} className="p-3 space-y-2 border-b border-border bg-muted/30">
                        <InlineInput name="name" defaultValue={phase.name} required autoFocus />
                        <InlineInput name="description" defaultValue={phase.description ?? ""} placeholder="Descripción" />
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={() => setEditingPhaseId(null)} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                          <button type="submit" disabled={isPending} className="p-1 rounded text-primary disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
                        </div>
                      </form>
                    )
                  }
                  return (
                    <SortablePhaseItem
                      key={phase.id}
                      phase={phase}
                      isSelected={isSelected}
                      onSelect={() => { setSelectedId(phase.id); setShowNewPhase(false); setShowAddTask(false) }}
                      onEdit={() => { setEditingPhaseId(phase.id); setShowNewPhase(false) }}
                      onDelete={() => handleDeletePhase(phase.id)}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* ── PANEL 2: Tareas ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <PanelHeader
            title={selected ? selected.name : "Tareas"}
            subtitle={!selected ? "Selecciona una fase" : `${tasks.length} tarea${tasks.length !== 1 ? "s" : ""}`}
            onAdd={selected && isEditable && !showAddTask ? () => setShowAddTask(true) : undefined}
          />

          <div className="flex-1 overflow-y-auto">
            {!selected && <EmptyPanel icon={Link2} text="Selecciona una fase" />}

            {selected && (
              <>
                {/* Review feedback banner */}
                {lastReview && (
                  <div className={`px-4 py-2.5 flex items-start gap-2 text-sm border-b border-border/50 ${lastReview.action === "approve" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                    {lastReview.action === "approve"
                      ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <span className="font-medium">{lastReview.action === "approve" ? "Aprobada" : "Rechazada"}</span>
                      {lastReview.comment && <span className="text-muted-foreground"> — {lastReview.comment}</span>}
                    </div>
                  </div>
                )}

                {/* Task list */}
                {tasks.length === 0 && !showAddTask && (
                  <EmptyPanel icon={LayoutList} text={isEditable ? "Usa + para agregar tareas" : "Sin tareas"} />
                )}

                {tasks.length > 0 && (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
                    <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      {tasks.map((task, i) => (
                        <LabSortableTaskRow
                          key={task.id}
                          task={task}
                          index={i}
                          onEdit={isEditable ? setEditingTask : () => {}}
                          onDelete={isEditable ? handleDeleteTask : () => {}}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}

                {/* Add task form */}
                {showAddTask && (
                  <form onSubmit={handleAddTask} className="px-3 py-3 space-y-2 bg-muted/20 border-t border-border">
                    <InlineInput name="title" required autoFocus placeholder="Título de la tarea…" />
                    <InlineInput name="description" placeholder="Descripción (opcional)" />
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setShowAddTask(false)} className="text-xs text-muted-foreground">Cancelar</button>
                      <button type="submit" disabled={isPending} className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">Agregar</button>
                    </div>
                  </form>
                )}

                {/* Submit / retract footer */}
                <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-3 bg-muted/10 flex-shrink-0 mt-auto">
                  {isEditable ? (
                    <button
                      onClick={() => handleSubmitPhase(selected.id)}
                      disabled={isPending || tasks.length === 0}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {selected.status === "rejected" ? "Reenviar a revisión" : "Enviar a revisión"}
                    </button>
                  ) : selected.status === "submitted" ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" /> Pendiente de revisión
                      </span>
                      <button
                        onClick={() => handleRetractPhase(selected.id)}
                        disabled={isPending}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Retirar para editar
                      </button>
                    </div>
                  ) : selected.status === "approved" ? (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Aprobada — visible en Operations Lab
                    </span>
                  ) : null}

                  {tasks.length === 0 && isEditable && (
                    <p className="text-xs text-muted-foreground">Agrega al menos una tarea para enviar.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit task modal */}
      {editingTask && (
        <LabEditTaskModal
          task={editingTask}
          sops={sops}
          positions={positions}
          isPending={isPending}
          onClose={() => setEditingTask(null)}
          onSave={handleTaskSaved}
        />
      )}
    </>
  )
}

// ── Sortable phase list item ──────────────────────────────────────────────────

function SortablePhaseItem({ phase, isSelected, onSelect, onEdit, onDelete }: {
  phase: LabPhase
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id })
  const canEdit = phase.status === "draft" || phase.status === "rejected"

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      onClick={onSelect}
      className={`group flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        {...attributes}
        {...listeners}
        tabIndex={-1}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{phase.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground">{(phase.tasks ?? []).length} tareas</p>
          <span className={`text-[10px] font-semibold ${STATUS_COLOR[phase.status]}`}>
            {STATUS_LABEL[phase.status]}
          </span>
        </div>
      </div>
      {canEdit && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onEdit() }} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="p-1 rounded text-muted-foreground hover:text-destructive">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
    </div>
  )
}
