"use client"

import { useState, useTransition } from "react"
import type { LabPhase, LabPhaseTask, Sop, Position } from "@/lib/types"
import {
  createPhase, updatePhase, deletePhase, submitPhase, retractPhase,
  deletePhaseTask, reorderPhaseTasks, reorderLabPhases,
} from "@/lib/actions/lab"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Check, X, LayoutList, Link2, ChevronRight, Send, RotateCcw, Pencil, CheckCircle2, XCircle, MessageSquare, GripVertical, Plus, GitBranch } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LabSortableTaskRow } from "@/components/lab/task-editor"
import { TaskFormModal } from "@/components/lab/task-form-modal"

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
        className="flex rounded-xl border border-border bg-card shadow-sm overflow-hidden"
        style={{ height: "calc(100vh - 220px)", minHeight: 480 }}
      >
        {/* ── PANEL 1: Mis fases ─────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-border">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Mis fases</h3>
              <p className="text-xs text-muted-foreground">{phases.length} fase{phases.length !== 1 ? "s" : ""}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { setShowNewPhase(true); setEditingPhaseId(null) }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {showNewPhase && (
              <form onSubmit={handleCreatePhase} className="p-3 space-y-2 border-b border-border bg-primary/5">
                <Input name="name" required autoFocus placeholder="Nombre de la fase..." />
                <Input name="description" placeholder="Descripción (opcional)" />
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNewPhase(false)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-primary" disabled={isPending}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </form>
            )}

            {phases.length === 0 && !showNewPhase && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <LayoutList className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Usa + para crear tu primera fase</p>
              </div>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhaseDragEnd}>
              <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {phases.map((phase) => {
                  if (editingPhaseId === phase.id) {
                    return (
                      <form key={phase.id} onSubmit={(e) => handleUpdatePhase(phase.id, e)} className="p-3 space-y-2 border-b border-border bg-muted/30">
                        <Input name="name" defaultValue={phase.name} required autoFocus />
                        <Input name="description" defaultValue={phase.description ?? ""} placeholder="Descripción" />
                        <div className="flex gap-2 justify-end">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingPhaseId(null)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                          <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-primary" disabled={isPending}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </form>
                    )
                  }
                  return (
                    <SortablePhaseItem
                      key={phase.id}
                      phase={phase}
                      isSelected={phase.id === selectedId}
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
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-sm truncate">{selected ? selected.name : "Tareas"}</h3>
                {selected && <OriginBadge phase={selected} />}
              </div>
              <p className="text-xs text-muted-foreground">
                {!selected ? "Selecciona una fase" : `${tasks.length} tarea${tasks.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            {selected && isEditable && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => setShowAddTask(true)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selected && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Link2 className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Selecciona una fase</p>
              </div>
            )}

            {selected && (
              <>
                {/* Review feedback banner */}
                {lastReview && (
                  <div className={`mx-4 mt-3 px-4 py-3 rounded-lg flex items-start gap-2 text-sm ${lastReview.action === "approve" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
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
                {tasks.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <LayoutList className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">{isEditable ? "Usa + para agregar tareas" : "Sin tareas"}</p>
                  </div>
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

                {/* Submit / retract footer */}
                <div className="px-5 py-4 border-t flex items-center justify-between gap-3 flex-shrink-0 mt-auto">
                  {isEditable ? (
                    <Button
                      onClick={() => handleSubmitPhase(selected.id)}
                      disabled={isPending || tasks.length === 0}
                      size="sm"
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      {selected.status === "rejected" ? "Reenviar a revisión" : "Enviar a revisión"}
                    </Button>
                  ) : selected.status === "submitted" ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" /> Pendiente de revisión
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetractPhase(selected.id)}
                        disabled={isPending}
                      >
                        <RotateCcw className="w-3 h-3 mr-1.5" /> Retirar para editar
                      </Button>
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

      {/* Add / edit task modal */}
      {showAddTask && selected && (
        <TaskFormModal
          target={{
            kind: "lab-create",
            phaseId: selected.id,
            phaseName: selected.name,
            sourcePhaseSetName: selected.source_phase_set?.name ?? null,
          }}
          sops={sops}
          positions={positions}
          onClose={() => setShowAddTask(false)}
          onSaved={(result) => {
            if (result.kind !== "lab-create") return
            setPhases((prev) => prev.map((p) => p.id === selected.id
              ? { ...p, tasks: [...(p.tasks ?? []), result.task] }
              : p
            ))
          }}
        />
      )}

      {editingTask && selected && (
        <TaskFormModal
          target={{
            kind: "lab-edit",
            task: editingTask,
            phaseName: selected.name,
            sourcePhaseSetName: selected.source_phase_set?.name ?? null,
          }}
          sops={sops}
          positions={positions}
          onClose={() => setEditingTask(null)}
          onSaved={(result) => {
            if (result.kind !== "lab-edit") return
            handleTaskSaved(result.patch)
          }}
        />
      )}
    </>
  )
}

// ── Origin badge — shows the canonical phase set a forked phase came from ────

function OriginBadge({ phase }: { phase: LabPhase }) {
  if (!phase.source_phase_set_id) return null
  return (
    <span
      title={`Copiada de ${phase.source_phase_set?.name ?? "un tipo de proyecto"}`}
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0"
    >
      <GitBranch className="w-2.5 h-2.5" />
      {phase.source_phase_set?.name ? (
        <span className="max-w-[100px] truncate">{phase.source_phase_set.name}</span>
      ) : null}
    </span>
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
      className={`group flex items-center gap-2 px-5 py-3 cursor-pointer transition-colors border-b border-border ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}
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
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{phase.name}</p>
          <OriginBadge phase={phase} />
        </div>
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
