"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import type {
  PendingChange, CanonicalPhaseSet, CanonicalTask, LabPhase, LabPhaseTask, LabProposedPhase,
  LabProposedTask, LabProposedChecklistAddition, Sop, Position,
} from "@/lib/types"
import {
  GitFork, Layers, ListChecks, CheckSquare, ChevronDown, ChevronRight,
  LayoutList, Link2, Send, RotateCcw, Trash2, CheckCircle2, XCircle,
  MessageSquare, AlertTriangle, Lock, Plus, ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_COLOR } from "@/components/lab/shared"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { LabSortableTaskRow } from "@/components/lab/task-editor"
import { TaskFormModal } from "@/components/lab/task-form-modal"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import {
  submitPhase, retractPhase, deletePhase, deletePhaseTask, reorderPhaseTasks,
  submitProposedPhase, retractProposedPhase, deleteProposedPhase,
  submitProposedTask, retractProposedTask, deleteProposedTask,
  submitProposedChecklistAddition, retractProposedChecklistAddition, deleteProposedChecklistAddition,
} from "@/lib/actions/lab"

interface Props {
  initialPendingChanges: PendingChange[]
  canonicalTree: CanonicalPhaseSet[]
  sops: Sop[]
  positions: Position[]
  /** Set by a parent (e.g. "Ver en Propuestas" from Árbol Canónico) to jump to and select a specific proposal. */
  focusChangeId?: string | null
  onFocusHandled?: () => void
}

const KIND_ICON: Record<PendingChange["kind"], React.ElementType> = {
  phase_fork: GitFork,
  phase_new: Layers,
  task: ListChecks,
  checklist: CheckSquare,
}
const KIND_LABEL: Record<PendingChange["kind"], string> = {
  phase_fork: "Fase completa",
  phase_new: "Nueva fase",
  task: "Tarea",
  checklist: "Checklist",
}

export function MyProposalsView({ initialPendingChanges, canonicalTree, sops, positions, focusChangeId, onFocusHandled }: Props) {
  const [changes, setChanges] = useState<PendingChange[]>(initialPendingChanges)
  const [selectedId, setSelectedId] = useState<string | null>(initialPendingChanges[0]?.id ?? null)
  const [view, setView] = useState<"pending" | "history">("pending")

  const selected = changes.find((c) => c.id === selectedId) ?? null

  const filtered = useMemo(
    () => changes.filter((c) => view === "history" ? c.status === "approved" : c.status !== "approved"),
    [changes, view]
  )

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; icon: string | null; color: string | null; items: PendingChange[] }>()
    for (const c of filtered) {
      const key = c.phaseSetId ?? "none"
      if (!map.has(key)) {
        map.set(key, { key, name: c.phaseSetName ?? "Sin tipo de proyecto", icon: c.phaseSetIcon, color: c.phaseSetColor, items: [] })
      }
      map.get(key)!.items.push(c)
    }
    return [...map.values()]
  }, [filtered])

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const g = selected?.phaseSetId ?? "none"
    return new Set(selected ? [g] : [])
  })

  useEffect(() => {
    if (!focusChangeId) return
    const target = changes.find((c) => c.id === focusChangeId)
    if (target) {
      setView(target.status === "approved" ? "history" : "pending")
      setSelectedId(target.id)
      setExpanded((prev) => new Set(prev).add(target.phaseSetId ?? "none"))
    }
    onFocusHandled?.()
  }, [focusChangeId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function replaceChange(id: string, patch: Partial<PendingChange>) {
    setChanges((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c))
  }
  function removeChange(id: string) {
    setChanges((prev) => prev.filter((c) => c.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div
      className="flex rounded-xl border border-border bg-card shadow-sm overflow-hidden"
      style={{ height: "calc(100vh - 220px)", minHeight: 480 }}
    >
      {/* ── PANEL 1: grouped list ─────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-border">
        <div className="px-5 py-3 border-b flex-shrink-0">
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              onClick={() => setView("pending")}
              className={cn("flex-1 text-xs font-medium py-1.5 rounded-md transition-colors", view === "pending" ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              Pendientes
            </button>
            <button
              onClick={() => setView("history")}
              className={cn("flex-1 text-xs font-medium py-1.5 rounded-md transition-colors", view === "history" ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              Historial
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <LayoutList className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {view === "pending" ? "Sin propuestas pendientes." : "Sin propuestas aprobadas aún."}
              </p>
            </div>
          )}
          {groups.map((g) => {
            const isOpen = expanded.has(g.key)
            const Icon = getProjectTypeIcon(g.icon)
            return (
              <div key={g.key} className="border-b border-border/60">
                <button
                  onClick={() => toggleGroup(g.key)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
                >
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                  {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" style={g.color ? { color: g.color } : undefined} />}
                  <span className="text-xs font-semibold truncate flex-1">{g.name}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{g.items.length}</span>
                </button>
                {isOpen && g.items.map((c) => {
                  const KIcon = KIND_ICON[c.kind]
                  const isSelected = c.id === selectedId
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "w-full flex items-center gap-2 pl-9 pr-4 py-2 text-left border-t border-border/40 transition-colors",
                        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30"
                      )}
                    >
                      <KIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{c.title}</p>
                        {c.phaseName && <p className="text-[10px] text-muted-foreground truncate">{c.phaseName}</p>}
                      </div>
                      {c.anchorMissing && <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                      <span className={cn(
                        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold flex-shrink-0",
                        PROPOSAL_STATUS_COLOR[c.status] ?? PROPOSAL_STATUS_COLOR.draft
                      )}>
                        {PROPOSAL_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── PANEL 2: detail ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full py-16 px-6">
            <Link2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Selecciona una propuesta</p>
          </div>
        )}

        {selected && selected.kind === "phase_fork" && (
          <PhaseForkDetail
            phase={selected.raw as LabPhase}
            sops={sops}
            positions={positions}
            onChanged={(patch) => replaceChange(selected.id, patch)}
            onDeleted={() => removeChange(selected.id)}
          />
        )}

        {selected && selected.kind === "phase_new" && (
          <ProposedPhaseDetail
            change={selected}
            phase={selected.raw as LabProposedPhase}
            canonicalTree={canonicalTree}
            onChanged={(patch) => replaceChange(selected.id, patch)}
            onDeleted={() => removeChange(selected.id)}
          />
        )}

        {selected && selected.kind === "task" && (
          <ProposedTaskDetail
            change={selected}
            task={selected.raw as LabProposedTask}
            canonicalTree={canonicalTree}
            onChanged={(patch) => replaceChange(selected.id, patch)}
            onDeleted={() => removeChange(selected.id)}
          />
        )}

        {selected && selected.kind === "checklist" && (
          <ProposedChecklistDetail
            change={selected}
            addition={selected.raw as LabProposedChecklistAddition}
            canonicalTree={canonicalTree}
            onChanged={(patch) => replaceChange(selected.id, patch)}
            onDeleted={() => removeChange(selected.id)}
          />
        )}
      </div>
    </div>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function DetailHeader({ title, subtitle, kind }: { title: string; subtitle: string; kind: PendingChange["kind"] }) {
  const Icon = KIND_ICON[kind]
  return (
    <div className="px-5 py-4 border-b border-border flex-shrink-0">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{KIND_LABEL[kind]}</span>
      </div>
      <h3 className="font-semibold text-sm truncate mt-0.5">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  )
}

function RejectionBanner({ comment }: { comment: string | null }) {
  return (
    <div className="mx-5 mt-3 px-4 py-3 rounded-lg flex items-start gap-2 text-sm bg-red-50 text-red-800 border border-red-200">
      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <span className="font-medium">Rechazada por un admin</span>
        {comment && <span> — {comment}</span>}
        <p className="text-xs text-red-700/80 mt-0.5">Edita y reenvía a revisión cuando esté lista.</p>
      </div>
    </div>
  )
}

function AnchorMissingBanner() {
  return (
    <div className="mx-5 mt-3 px-4 py-3 rounded-lg flex items-start gap-2 text-sm bg-amber-50 text-amber-800 border border-amber-200">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <span className="font-medium">La fase o tarea original ya no existe.</span>
        <p className="text-xs text-amber-700/80 mt-0.5">Alguien la eliminó del árbol canónico desde que creaste esta propuesta.</p>
      </div>
    </div>
  )
}

// ── Before/after diff for a task-edit proposal — only changed fields render ──

function TaskEditDiff({ original, proposed }: { original: CanonicalTask; proposed: LabProposedTask }) {
  const rows: { label: string; before: string; after: string }[] = []

  if (original.title !== proposed.title) {
    rows.push({ label: "Título", before: original.title, after: proposed.title })
  }
  if ((original.description ?? "") !== (proposed.description ?? "")) {
    rows.push({ label: "Descripción", before: original.description || "—", after: proposed.description || "—" })
  }
  if (original.requires_deliverable !== proposed.requires_deliverable) {
    rows.push({
      label: "Entregable",
      before: original.requires_deliverable ? "Requiere entregable" : "No requiere entregable",
      after: proposed.requires_deliverable ? "Requiere entregable" : "No requiere entregable",
    })
  }
  if ((original.default_position_name ?? "") !== (proposed.default_position?.name ?? "")) {
    rows.push({ label: "Puesto", before: original.default_position_name || "Sin puesto", after: proposed.default_position?.name || "Sin puesto" })
  }
  if ((original.sop_title ?? "") !== (proposed.sop?.title ?? "")) {
    rows.push({ label: "SOP", before: original.sop_title || "Sin SOP", after: proposed.sop?.title || "Sin SOP" })
  }

  const originalItems = original.checklist_items ?? []
  const proposedItems = proposed.checklist_items ?? []
  const checklistKey = (items: { text: string; is_blocking: boolean }[]) =>
    items.map((i) => `${i.text}::${i.is_blocking}`).join("|")
  const checklistChanged = checklistKey(originalItems) !== checklistKey(proposedItems)

  if (rows.length === 0 && !checklistChanged) {
    return (
      <p className="text-xs text-muted-foreground italic">Sin cambios detectados respecto a la tarea original.</p>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
        <ArrowRight className="w-3.5 h-3.5" /> Qué cambia
      </p>
      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
        {rows.map((row) => (
          <div key={row.label} className="px-3 py-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{row.label}</p>
            <div className="flex items-start gap-2 text-xs">
              <span className="flex-1 min-w-0 text-muted-foreground line-through decoration-destructive/50">{row.before}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0 font-medium text-primary">{row.after}</span>
            </div>
          </div>
        ))}

        {checklistChanged && (
          <div className="px-3 py-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Checklist</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Antes</p>
                {originalItems.length === 0 && <p className="text-muted-foreground/60 italic">Sin checklist</p>}
                {originalItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-1 text-muted-foreground line-through decoration-destructive/50">
                    {item.is_blocking && <Lock className="w-2.5 h-2.5 flex-shrink-0" />}
                    <span className="truncate">{item.text}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Propuesto</p>
                {proposedItems.length === 0 && <p className="text-muted-foreground/60 italic">Sin checklist</p>}
                {proposedItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-1 font-medium text-primary">
                    {item.is_blocking && <Lock className="w-2.5 h-2.5 flex-shrink-0" />}
                    <span className="truncate">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function lastReviewOf(reviews: { action: string; comment: string | null; created_at: string }[] | undefined) {
  if (!reviews?.length) return null
  return [...reviews].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .find((r) => r.action !== "comment") ?? null
}

// ── Detail: phase_fork — full phase editor (task list, add/edit, submit/retract) ──

function PhaseForkDetail({ phase, sops, positions, onChanged, onDeleted }: {
  phase: LabPhase
  sops: Sop[]
  positions: Position[]
  onChanged: (patch: Partial<PendingChange>) => void
  onDeleted: () => void
}) {
  const [tasks, setTasks] = useState<LabPhaseTask[]>(phase.tasks ?? [])
  const [status, setStatus] = useState(phase.status)
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState<LabPhaseTask | null>(null)
  const [isPending, startTransition] = useTransition()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const isEditable = status === "draft" || status === "rejected"
  const lastReview = lastReviewOf(phase.reviews)

  function handleSubmit() {
    if (tasks.length === 0) return
    startTransition(async () => {
      await submitPhase(phase.id)
      setStatus("submitted")
      onChanged({ status: "submitted", updatedAt: new Date().toISOString() })
    })
  }
  function handleRetract() {
    startTransition(async () => {
      await retractPhase(phase.id)
      setStatus("draft")
      onChanged({ status: "draft", updatedAt: new Date().toISOString() })
    })
  }
  function handleDeleteTask(id: string) {
    startTransition(async () => {
      await deletePhaseTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
    })
  }
  function handleDelete() {
    startTransition(async () => {
      await deletePhase(phase.id)
      onDeleted()
    })
  }
  function handleTaskDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = tasks.findIndex((t) => t.id === active.id)
    const newIndex = tasks.findIndex((t) => t.id === over.id)
    const reordered = arrayMove(tasks, oldIndex, newIndex)
    setTasks(reordered)
    startTransition(async () => { await reorderPhaseTasks(reordered.map((t) => t.id)) })
  }

  return (
    <>
      <DetailHeader title={phase.name} subtitle={`${tasks.length} tarea${tasks.length !== 1 ? "s" : ""}`} kind="phase_fork" />
      <div className="flex-1 overflow-y-auto">
        {status === "rejected" && lastReview && <RejectionBanner comment={lastReview.comment} />}
        {status === "approved" && (
          <div className="mx-5 mt-3 px-4 py-3 rounded-lg flex items-center gap-2 text-sm bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Aprobada — visible en Operations Lab
          </div>
        )}

        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <p className="text-xs text-muted-foreground">Tareas</p>
          {isEditable && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAddTask(true)}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <LayoutList className="w-7 h-7 mb-2 opacity-40" />
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
      </div>

      <ProposalFooter status={status} isPending={isPending} onSubmit={handleSubmit} onRetract={handleRetract} onDelete={handleDelete} />

      {showAddTask && (
        <TaskFormModal
          target={{ kind: "lab-create", phaseId: phase.id, phaseName: phase.name, sourcePhaseSetName: phase.source_phase_set?.name ?? null }}
          sops={sops}
          positions={positions}
          onClose={() => setShowAddTask(false)}
          onSaved={(result) => {
            if (result.kind !== "lab-create") return
            setTasks((prev) => [...prev, result.task])
            setShowAddTask(false)
          }}
        />
      )}
      {editingTask && (
        <TaskFormModal
          target={{ kind: "lab-edit", task: editingTask, phaseName: phase.name, sourcePhaseSetName: phase.source_phase_set?.name ?? null }}
          sops={sops}
          positions={positions}
          onClose={() => setEditingTask(null)}
          onSaved={(result) => {
            if (result.kind !== "lab-edit") return
            setTasks((prev) => prev.map((t) => t.id === editingTask.id ? { ...t, ...result.patch } : t))
            setEditingTask(null)
          }}
        />
      )}
    </>
  )
}

// ── Detail: phase_new — reconstruct phase set's phase list with the new one highlighted ──

function ProposedPhaseDetail({ change, phase, canonicalTree, onChanged, onDeleted }: {
  change: PendingChange
  phase: LabProposedPhase
  canonicalTree: CanonicalPhaseSet[]
  onChanged: (patch: Partial<PendingChange>) => void
  onDeleted: () => void
}) {
  const [status, setStatus] = useState(phase.status)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const isEditable = status === "draft" || status === "rejected"

  const ps = canonicalTree.find((p) => p.id === phase.phase_set_id)
  const orderedPhases = ps ? [...ps.phases].sort((a, b) => a.phase_order - b.phase_order) : []
  const afterIndex = phase.position_after_phase_id
    ? orderedPhases.findIndex((p) => p.id === phase.position_after_phase_id)
    : -1

  function handleSubmit() {
    startTransition(async () => {
      await submitProposedPhase(phase.id)
      setStatus("submitted")
      onChanged({ status: "submitted", updatedAt: new Date().toISOString() })
    })
  }
  function handleRetract() {
    startTransition(async () => {
      await retractProposedPhase(phase.id)
      setStatus("draft")
      onChanged({ status: "draft", updatedAt: new Date().toISOString() })
    })
  }
  function handleDelete() {
    if (!confirm("¿Eliminar este borrador?")) return
    startTransition(async () => {
      await deleteProposedPhase(phase.id)
      toast("Propuesta eliminada", "success")
      onDeleted()
    })
  }

  return (
    <>
      <DetailHeader title={phase.name} subtitle={ps ? ps.name : "Nueva fase"} kind="phase_new" />
      <div className="flex-1 overflow-y-auto">
        {status === "rejected" && <RejectionBanner comment={null} />}
        {change.anchorMissing === false && !ps && <AnchorMissingBanner />}

        <div className="px-5 py-4 space-y-3">
          {phase.description && <p className="text-sm text-muted-foreground">{phase.description}</p>}

          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {orderedPhases.length === 0 && !ps && (
              <p className="text-xs text-muted-foreground p-3">Tipo de proyecto no encontrado.</p>
            )}
            {(() => {
              const withHighlight: { id: string; name: string; highlighted: boolean }[] =
                orderedPhases.map((p) => ({ id: p.id, name: p.name, highlighted: false }))
              withHighlight.splice(afterIndex + 1, 0, { id: "__new__", name: phase.name, highlighted: true })
              return withHighlight.map((p, i) => (
                <div
                  key={p.id}
                  className={cn(
                    "px-3 py-2 text-sm flex items-center gap-2",
                    p.highlighted && "border-2 border-dashed border-primary/50 bg-primary/5"
                  )}
                >
                  {p.highlighted
                    ? <Layers className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    : <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">{i + 1}</span>}
                  <span className={cn("truncate", p.highlighted && "font-medium text-primary")}>
                    {p.name}{p.highlighted && " (propuesta)"}
                  </span>
                </div>
              ))
            })()}
          </div>
          <p className="text-xs text-muted-foreground">
            {phase.position_after_phase_id
              ? `Se insertará después de "${orderedPhases[afterIndex]?.name ?? "la fase seleccionada"}".`
              : "Se insertará al principio."}
          </p>
        </div>
      </div>

      <ProposalFooter
        status={status}
        isPending={isPending}
        onSubmit={handleSubmit}
        onRetract={handleRetract}
        onDelete={handleDelete}
      />
    </>
  )
}

// ── Detail: task — reconstruct canonical phase task list with proposal highlighted ──

function ProposedTaskDetail({ change, task, canonicalTree, onChanged, onDeleted }: {
  change: PendingChange
  task: LabProposedTask
  canonicalTree: CanonicalPhaseSet[]
  onChanged: (patch: Partial<PendingChange>) => void
  onDeleted: () => void
}) {
  const [status, setStatus] = useState(task.status)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const isEditable = status === "draft" || status === "rejected"
  const isEdit = !!task.anchor_task_set_task_id

  let anchorPhaseTasks: CanonicalTask[] = []
  for (const ps of canonicalTree) {
    const ph = ps.phases.find((p) => p.id === task.anchor_phase_set_phase_id)
    if (ph) { anchorPhaseTasks = ph.tasks; break }
  }
  const anchorTasks = anchorPhaseTasks.map((t) => ({ id: t.id, title: t.title }))
  const originalTask = isEdit ? anchorPhaseTasks.find((t) => t.id === task.anchor_task_set_task_id) ?? null : null
  const afterIndex = task.position_after_task_id ? anchorTasks.findIndex((t) => t.id === task.position_after_task_id) : -1

  function handleSubmit() {
    startTransition(async () => {
      await submitProposedTask(task.id)
      setStatus("submitted")
      onChanged({ status: "submitted", updatedAt: new Date().toISOString() })
    })
  }
  function handleRetract() {
    startTransition(async () => {
      await retractProposedTask(task.id)
      setStatus("draft")
      onChanged({ status: "draft", updatedAt: new Date().toISOString() })
    })
  }
  function handleDelete() {
    if (!confirm("¿Eliminar este borrador?")) return
    startTransition(async () => {
      await deleteProposedTask(task.id)
      toast("Propuesta eliminada", "success")
      onDeleted()
    })
  }

  const items = task.checklist_items ?? []

  return (
    <>
      <DetailHeader
        title={task.title}
        subtitle={change.phaseName ? `Fase: ${change.phaseName}${isEdit ? " · Edición de tarea existente" : ""}` : "Fase no encontrada"}
        kind="task"
      />
      <div className="flex-1 overflow-y-auto">
        {status === "rejected" && <RejectionBanner comment={null} />}
        {change.anchorMissing && <AnchorMissingBanner />}

        <div className="px-5 py-4 space-y-4">
          {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}

          {anchorTasks.length > 0 && (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {(() => {
                const withHighlight: { id: string; title: string; highlighted: boolean }[] =
                  anchorTasks.map((t) => ({ id: t.id, title: t.title, highlighted: false }))
                if (!isEdit) withHighlight.splice(afterIndex + 1, 0, { id: "__new__", title: task.title, highlighted: true })
                return withHighlight.map((t, i) => {
                  const isThisEdit = isEdit && t.id === task.anchor_task_set_task_id
                  const highlighted = t.highlighted || isThisEdit
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "px-3 py-2 text-sm flex items-center gap-2",
                        highlighted && "border-2 border-dashed border-primary/50 bg-primary/5"
                      )}
                    >
                      {highlighted
                        ? <ListChecks className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        : <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">{i + 1}</span>}
                      <span className={cn("truncate", highlighted && "font-medium text-primary")}>
                        {isThisEdit ? task.title : t.title}{highlighted && (isThisEdit ? " (edición propuesta)" : " (propuesta)")}
                      </span>
                    </div>
                  )
                })
              })()}
            </div>
          )}
          {anchorTasks.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {task.position_after_task_id ? `Se insertará después de una tarea existente.` : "Se insertará al final."}
            </p>
          )}

          {isEdit && originalTask && <TaskEditDiff original={originalTask} proposed={task} />}

          {!isEdit && items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <ListChecks className="w-3.5 h-3.5" /> Checklist propuesto
              </p>
              <div className="rounded-lg border border-border divide-y divide-border">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className={cn("flex-1 min-w-0 truncate", item.is_blocking && "font-medium")}>{item.text}</span>
                    {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ProposalFooter status={status} isPending={isPending} onSubmit={handleSubmit} onRetract={handleRetract} onDelete={handleDelete} />
    </>
  )
}

// ── Detail: checklist — reconstruct anchor task's checklist with additions highlighted ──

function ProposedChecklistDetail({ change, addition, canonicalTree, onChanged, onDeleted }: {
  change: PendingChange
  addition: LabProposedChecklistAddition
  canonicalTree: CanonicalPhaseSet[]
  onChanged: (patch: Partial<PendingChange>) => void
  onDeleted: () => void
}) {
  const [status, setStatus] = useState(addition.status)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const isEditable = status === "draft" || status === "rejected"

  let anchorItems: { id: string; text: string; is_blocking: boolean }[] = []
  for (const ps of canonicalTree) {
    for (const ph of ps.phases) {
      const t = ph.tasks.find((t) => t.id === addition.anchor_task_set_task_id)
      if (t) { anchorItems = t.checklist_items; break }
    }
  }
  const items = addition.items ?? []

  function handleSubmit() {
    startTransition(async () => {
      await submitProposedChecklistAddition(addition.id)
      setStatus("submitted")
      onChanged({ status: "submitted", updatedAt: new Date().toISOString() })
    })
  }
  function handleRetract() {
    startTransition(async () => {
      await retractProposedChecklistAddition(addition.id)
      setStatus("draft")
      onChanged({ status: "draft", updatedAt: new Date().toISOString() })
    })
  }
  function handleDelete() {
    if (!confirm("¿Eliminar este borrador?")) return
    startTransition(async () => {
      await deleteProposedChecklistAddition(addition.id)
      toast("Propuesta eliminada", "success")
      onDeleted()
    })
  }

  return (
    <>
      <DetailHeader title={addition.anchor_task?.title ?? "Tarea"} subtitle={change.phaseName ? `Fase: ${change.phaseName}` : "Checklist propuesto"} kind="checklist" />
      <div className="flex-1 overflow-y-auto">
        {status === "rejected" && <RejectionBanner comment={null} />}
        {change.anchorMissing && <AnchorMissingBanner />}

        <div className="px-5 py-4 space-y-4">
          {anchorItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Checklist actual</p>
              <div className="rounded-lg border border-border/50 divide-y divide-border/30 bg-muted/20">
                {anchorItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>{item.text}</span>
                    {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Ítems propuestos
            </p>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin ítems.</p>
            ) : (
              <div className="rounded-lg border border-primary/20 bg-primary/5 divide-y divide-border/30">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={cn("flex-1 min-w-0 truncate", item.is_blocking && "font-medium")}>{item.text}</span>
                    {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ProposalFooter status={status} isPending={isPending} onSubmit={handleSubmit} onRetract={handleRetract} onDelete={handleDelete} />
    </>
  )
}

// ── Shared submit/retract/delete footer for the 3 "proposed" kinds ─────────────

function ProposalFooter({ status, isPending, onSubmit, onRetract, onDelete }: {
  status: string
  isPending: boolean
  onSubmit: () => void
  onRetract: () => void
  onDelete: () => void
}) {
  const isEditable = status === "draft" || status === "rejected"
  return (
    <div className="px-5 py-4 border-t flex items-center justify-between gap-3 flex-shrink-0">
      {isEditable && (
        <div className="flex items-center gap-2">
          <Button onClick={onSubmit} disabled={isPending} size="sm">
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {status === "rejected" ? "Reenviar a revisión" : "Enviar a revisión"}
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete} disabled={isPending}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Eliminar
          </Button>
        </div>
      )}
      {status === "submitted" && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" /> Pendiente de revisión
          </span>
          <Button variant="outline" size="sm" onClick={onRetract} disabled={isPending}>
            <RotateCcw className="w-3 h-3 mr-1.5" /> Retirar para editar
          </Button>
        </div>
      )}
      {status === "approved" && (
        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> Aprobada — visible en el árbol canónico
        </span>
      )}
    </div>
  )
}
