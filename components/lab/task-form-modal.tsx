"use client"

// Unified task modal — supersedes the old LabEditTaskModal + ProposedTaskModal.
// Handles 3 modes via the `target` prop:
//   - lab-create:      new lab_phase_task in Mis Fases
//   - lab-edit:        edit an existing lab_phase_task in Mis Fases
//   - canonical-propose: create/edit a lab_proposed_task anchored to a canonical phase

import { useState, useTransition } from "react"
import type {
  LabPhaseTask, LabProposedTask, Position, Sop, CanonicalPhase, CanonicalTask,
} from "@/lib/types"
import { addPhaseTask, updatePhaseTask, createProposedTask } from "@/lib/actions/lab"
import {
  X, BookOpen, Search, UserCircle, Pencil, ListChecks, Lock, Plus, Trash2, Sparkles,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { AiTaskSuggester } from "@/components/operations/ai-task-suggester"

type ChecklistDraft = { text: string; is_blocking: boolean }

export type TaskFormTarget =
  | { kind: "lab-create"; phaseId: string; phaseName: string; sourcePhaseSetName?: string | null }
  | { kind: "lab-edit"; task: LabPhaseTask; phaseName: string; sourcePhaseSetName?: string | null }
  | {
      kind: "canonical-propose"
      phase: CanonicalPhase
      phaseSetName: string
      defaultAfterTaskId?: string
      existingTask?: CanonicalTask
    }

interface Props {
  target: TaskFormTarget
  sops: Sop[]
  positions: Position[]
  onClose: () => void
  /** Called after a successful save. Payload shape depends on `target.kind`. */
  onSaved: (result: { kind: "lab-create"; task: LabPhaseTask } | { kind: "lab-edit"; patch: Partial<LabPhaseTask> } | { kind: "canonical-propose"; task: LabProposedTask }) => void
}

export function TaskFormModal({ target, sops, positions, onClose, onSaved }: Props) {
  const isCanonical = target.kind === "canonical-propose"
  const existingTask = target.kind === "lab-edit" ? target.task : target.kind === "canonical-propose" ? target.existingTask : undefined
  const isEditMode = target.kind === "lab-edit" || !!(target.kind === "canonical-propose" && target.existingTask)

  const [sopId, setSopId] = useState(existingTask?.sop_id ?? "")
  const [sopSearch, setSopSearch] = useState("")
  const [positionId, setPositionId] = useState(existingTask?.default_position_id ?? "")
  const [positionSearch, setPositionSearch] = useState("")
  const [positionAfterTaskId, setPositionAfterTaskId] = useState(
    target.kind === "canonical-propose" ? (target.defaultAfterTaskId ?? "") : ""
  )
  const [title, setTitle] = useState(existingTask?.title ?? "")
  const [description, setDescription] = useState(existingTask?.description ?? "")
  const [requiresDeliverable, setRequiresDeliverable] = useState(existingTask?.requires_deliverable ?? false)
  const [checklistItems, setChecklistItems] = useState<ChecklistDraft[]>(
    (existingTask?.checklist_items ?? []).map((i) => ({ text: i.text, is_blocking: i.is_blocking }))
  )
  const [newItemText, setNewItemText] = useState("")
  const [newItemBlocking, setNewItemBlocking] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [isPending, startTransition] = useTransition()

  const filteredSops = sops.filter((s) =>
    s.title.toLowerCase().includes(sopSearch.toLowerCase()) ||
    (s.category ?? "").toLowerCase().includes(sopSearch.toLowerCase())
  )
  const selectedSop = sops.find((s) => s.id === sopId) ?? null

  const filteredPositions = positions.filter((p) =>
    p.name.toLowerCase().includes(positionSearch.toLowerCase())
  )
  const selectedPosition = positions.find((p) => p.id === positionId) ?? null

  function addChecklistItem() {
    if (!newItemText.trim()) return
    setChecklistItems((prev) => [...prev, { text: newItemText.trim(), is_blocking: newItemBlocking }])
    setNewItemText("")
    setNewItemBlocking(false)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!title.trim()) return
    const fd = new FormData()
    fd.set("title", title)
    fd.set("description", description ?? "")
    fd.set("requires_deliverable", requiresDeliverable ? "true" : "false")
    fd.set("sop_id", sopId)
    fd.set("default_position_id", positionId)
    fd.set("checklist_items_json", JSON.stringify(checklistItems))

    startTransition(async () => {
      if (target.kind === "lab-create") {
        const task = await addPhaseTask(target.phaseId, fd)
        onSaved({ kind: "lab-create", task })
      } else if (target.kind === "lab-edit") {
        await updatePhaseTask(target.task.id, fd)
        onSaved({
          kind: "lab-edit",
          patch: {
            title,
            description: description || null,
            requires_deliverable: requiresDeliverable,
            sop_id: sopId || null,
            sop: selectedSop ? { id: selectedSop.id, title: selectedSop.title } : null,
            default_position_id: positionId || null,
            default_position: selectedPosition ?? null,
            checklist_items: checklistItems.map((c, i) => ({
              id: crypto.randomUUID(),
              task_id: target.task.id,
              text: c.text,
              is_blocking: c.is_blocking,
              item_order: i,
              created_at: new Date().toISOString(),
            })),
          },
        })
      } else {
        fd.set("position_after_task_id", isEditMode ? "" : positionAfterTaskId)
        if (isEditMode && target.existingTask) fd.set("anchor_task_set_task_id", target.existingTask.id)
        const task = await createProposedTask(target.phase.id, target.phase.task_set_id, fd)
        onSaved({ kind: "canonical-propose", task })
      }
      onClose()
    })
  }

  const heading = target.kind === "lab-create"
    ? "Nueva tarea"
    : target.kind === "lab-edit"
      ? "Editar tarea"
      : isEditMode ? "Proponer edición de tarea" : "Proponer nueva tarea"

  const subtitle = target.kind === "lab-create" || target.kind === "lab-edit"
    ? (target.sourcePhaseSetName ? `${target.sourcePhaseSetName} → ${target.phaseName}` : target.phaseName)
    : `${target.phaseSetName} → ${target.phase.name}${isEditMode && target.existingTask ? ` → ${target.existingTask.title}` : ""}`

  const aiContext = {
    projectTypeName: null as string | null,
    phaseSetName: target.kind === "canonical-propose"
      ? target.phaseSetName
      : (target.sourcePhaseSetName ?? "Fase personalizada"),
    allPhases: target.kind === "canonical-propose" ? [target.phase.name] : [target.phaseName],
    currentPhaseName: target.kind === "canonical-propose" ? target.phase.name : target.phaseName,
    currentPhaseIndex: 0,
    existingTasks: target.kind === "canonical-propose" ? target.phase.tasks.map((t) => t.title) : [],
    availablePositions: positions.map((p) => p.name),
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {isEditMode && <Pencil className="w-3.5 h-3.5 text-muted-foreground" />}
                <h2 className="font-semibold text-sm">{heading}</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                type="button"
                variant={showAi ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setShowAi((v) => !v)}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Sugerir con IA
              </Button>
              <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título *</Label>
              <Input
                required
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre de la tarea..."
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descripción</Label>
              <AutoTextarea
                rows={3}
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción detallada..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={requiresDeliverable}
                  onChange={(e) => setRequiresDeliverable(e.target.checked)}
                  className="accent-info"
                />
                Requiere entregable
              </label>
            </div>

            {/* Position picker */}
            {positions.length > 0 && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <UserCircle className="w-3.5 h-3.5" />
                  Puesto predeterminado
                </Label>
                {selectedPosition ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/30 bg-primary/5 text-sm">
                    <UserCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate font-medium text-primary">{selectedPosition.name}</span>
                    <button
                      type="button"
                      onClick={() => { setPositionId(""); setPositionSearch("") }}
                      className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        type="text"
                        value={positionSearch}
                        onChange={(e) => setPositionSearch(e.target.value)}
                        placeholder="Buscar puesto..."
                        className="pl-8"
                      />
                    </div>
                    {filteredPositions.length > 0 && (
                      <div className="max-h-28 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
                        {filteredPositions.map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() => { setPositionId(pos.id); setPositionSearch("") }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                          >
                            <UserCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate">{pos.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Position in phase (after which task) — only for canonical propose, create mode */}
            {target.kind === "canonical-propose" && !isEditMode && target.phase.tasks.length > 0 && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Insertar después de
                </Label>
                <select
                  value={positionAfterTaskId}
                  onChange={(e) => setPositionAfterTaskId(e.target.value)}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Al final de la fase</option>
                  {target.phase.tasks.map((task) => (
                    <option key={task.id} value={task.id}>{task.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* SOP picker */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                SOP asignado
              </Label>
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
                    <Input
                      type="text"
                      value={sopSearch}
                      onChange={(e) => setSopSearch(e.target.value)}
                      placeholder="Buscar SOP..."
                      className="pl-8"
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
            </div>

            {/* Checklist items */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5" />
                Checklist
              </Label>
              {checklistItems.length > 0 && (
                <div className="rounded-md border border-border/50 divide-y divide-border/30 mb-2">
                  {checklistItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <button
                        type="button"
                        onClick={() => setChecklistItems((prev) => prev.map((it, j) => j === i ? { ...it, is_blocking: !it.is_blocking } : it))}
                        title={item.is_blocking ? "Bloqueante" : "No bloqueante"}
                        className={item.is_blocking ? "text-destructive flex-shrink-0" : "text-muted-foreground hover:text-foreground flex-shrink-0"}
                      >
                        <Lock className="w-3 h-3" />
                      </button>
                      <span className="flex-1 min-w-0 truncate">{item.text}</span>
                      <button type="button" onClick={() => setChecklistItems((prev) => prev.filter((_, j) => j !== i))}
                        className="p-0.5 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addChecklistItem() }
                  }}
                  placeholder="Agregar ítem..."
                  className="flex-1 rounded border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <label className="flex items-center gap-1 px-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={newItemBlocking} onChange={(e) => setNewItemBlocking(e.target.checked)} className="accent-destructive" />
                  <Lock className="w-3 h-3" />
                </label>
                <button
                  type="button"
                  onClick={addChecklistItem}
                  className="p-1.5 rounded border border-border hover:bg-muted text-muted-foreground"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando..." : (target.kind === "canonical-propose" ? "Guardar borrador" : "Guardar")}
              </Button>
            </div>
          </form>
        </div>

        {showAi && (
          <div className="w-80 flex-shrink-0 border-l border-border">
            <AiTaskSuggester
              context={aiContext}
              positions={positions}
              onClose={() => setShowAi(false)}
              onAccept={(proposal) => {
                setTitle(proposal.title)
                setDescription(proposal.description)
                setRequiresDeliverable(proposal.requires_deliverable)
                if (proposal.default_position_id) setPositionId(proposal.default_position_id)
                setChecklistItems(proposal.checklist.filter((c) => c.text.trim()))
                setShowAi(false)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
