"use client"

import { useState, useTransition } from "react"
import type { CanonicalPhase, CanonicalTask, LabProposedTask, Position, Sop } from "@/lib/types"
import { createProposedTask } from "@/lib/actions/lab"
import { X, BookOpen, Search, UserCircle, Pencil } from "lucide-react"
import { InlineInput } from "@/components/lab/shared"
import { AutoTextarea } from "@/components/ui/auto-textarea"

interface Props {
  phase: CanonicalPhase
  phaseSetName: string
  positions: Position[]
  sops: Sop[]
  onClose: () => void
  onCreated: (task: LabProposedTask) => void
  /** When provided the modal operates in edit-proposal mode */
  existingTask?: CanonicalTask
  /** Pre-select "insert after" task */
  defaultAfterTaskId?: string
}

export function ProposedTaskModal({
  phase, phaseSetName, positions, sops, onClose, onCreated,
  existingTask, defaultAfterTaskId,
}: Props) {
  const isEditMode = !!existingTask
  const [sopId, setSopId] = useState(existingTask?.sop_id ?? "")
  const [sopSearch, setSopSearch] = useState("")
  const [positionId, setPositionId] = useState(existingTask?.default_position_id ?? "")
  const [positionSearch, setPositionSearch] = useState("")
  const [positionAfterTaskId, setPositionAfterTaskId] = useState(defaultAfterTaskId ?? "")
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("sop_id", sopId)
    fd.set("default_position_id", positionId)
    fd.set("position_after_task_id", isEditMode ? "" : positionAfterTaskId)
    if (isEditMode && existingTask) fd.set("anchor_task_set_task_id", existingTask.id)
    startTransition(async () => {
      const task = await createProposedTask(phase.id, phase.task_set_id, fd)
      onCreated(task)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <div className="flex items-center gap-1.5">
              {isEditMode && <Pencil className="w-3.5 h-3.5 text-muted-foreground" />}
              <h2 className="font-semibold text-sm">
                {isEditMode ? "Proponer edición de tarea" : "Proponer nueva tarea"}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {phaseSetName} → {phase.name}
              {isEditMode && existingTask && <> → <span className="italic">{existingTask.title}</span></>}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título *</label>
            <InlineInput name="title" required autoFocus placeholder="Nombre de la tarea…" defaultValue={existingTask?.title ?? ""} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descripción</label>
            <AutoTextarea
              name="description"
              rows={2}
              placeholder="Descripción detallada…"
              defaultValue={existingTask?.description ?? ""}
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 px-3 py-2 rounded border border-input bg-background text-sm cursor-pointer select-none">
              <input type="checkbox" name="requires_deliverable" value="true" className="accent-info"
                defaultChecked={existingTask?.requires_deliverable ?? false} />
              Requiere entregable
            </label>
          </div>

          {/* Position picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5 block">
              <UserCircle className="w-3.5 h-3.5" />
              Puesto predeterminado
            </label>
            {selectedPosition ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/30 bg-primary/5 text-sm">
                <UserCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate font-medium text-primary">{selectedPosition.name}</span>
                <button
                  type="button"
                  onClick={() => { setPositionId(""); setPositionSearch("") }}
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
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
                    value={positionSearch}
                    onChange={(e) => setPositionSearch(e.target.value)}
                    placeholder="Buscar puesto…"
                    className="w-full rounded border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                {positions.length > 0 && (
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
                    {filteredPositions.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">Sin resultados.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <input type="hidden" name="default_position_id" value={positionId} />
          </div>

          {/* Position in phase (after which task) — hidden in edit mode */}
          {!isEditMode && phase.tasks.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Insertar después de
              </label>
              <select
                value={positionAfterTaskId}
                onChange={(e) => setPositionAfterTaskId(e.target.value)}
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Al final de la fase</option>
                {phase.tasks.map((task: CanonicalTask) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
              </select>
              <input type="hidden" name="position_after_task_id" value={positionAfterTaskId} />
            </div>
          )}

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
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
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
                {filteredSops.length > 0 && (
                  <div className="max-h-28 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
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
              {isPending ? "Guardando…" : "Guardar borrador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
