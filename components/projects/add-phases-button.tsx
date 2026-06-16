"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { importPhasesToProject } from "@/lib/actions/projects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, ChevronDown, Check, ListChecks, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

interface PhaseSetPhase {
  id: string
  name: string
  description?: string | null
  phase_order?: number
  default_task_set_id?: string | null
}

interface PhaseSet {
  id: string
  name: string
  phases: PhaseSetPhase[]
}

interface ProjectPhase {
  id: string
  name: string
  phase_order: number
}

interface Props {
  projectId: string
  phaseSets: PhaseSet[]
  defaultPhaseSetId?: string | null
  existingPhases: ProjectPhase[]
}

export function AddPhasesButton({ projectId, phaseSets, defaultPhaseSetId, existingPhases }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedSetId, setSelectedSetId] = useState(defaultPhaseSetId ?? phaseSets[0]?.id ?? "")
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedPhaseIds, setSelectedPhaseIds] = useState<Set<string>>(new Set())
  const [afterPhaseId, setAfterPhaseId] = useState<string>("end")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedSet = phaseSets.find((ps) => ps.id === selectedSetId)
  const sortedExisting = [...existingPhases].sort((a, b) => a.phase_order - b.phase_order)

  // Split dropdown into default / others
  const defaultPs = phaseSets.find((ps) => ps.id === defaultPhaseSetId)
  const otherPs   = phaseSets.filter((ps) => ps.id !== defaultPhaseSetId)

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      setDropdownOpen(false)
      setSelectedPhaseIds(new Set())
      setAfterPhaseId("end")
      setError(null)
    }
  }

  function togglePhase(id: string) {
    setSelectedPhaseIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    const all = (selectedSet?.phases ?? []).map((p) => p.id)
    if (selectedPhaseIds.size === all.length) {
      setSelectedPhaseIds(new Set())
    } else {
      setSelectedPhaseIds(new Set(all))
    }
  }

  function handleImport() {
    if (selectedPhaseIds.size === 0) return
    setError(null)
    // Preserve order from the phase set
    const orderedIds = (selectedSet?.phases ?? [])
      .filter((p) => selectedPhaseIds.has(p.id))
      .map((p) => p.id)
    startTransition(async () => {
      try {
        await importPhasesToProject(
          projectId,
          orderedIds,
          afterPhaseId === "start" ? null : afterPhaseId
        )
        setOpen(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al importar fases")
      }
    })
  }

  if (phaseSets.length === 0) return null

  const phases = selectedSet?.phases ?? []
  const allSelected = phases.length > 0 && selectedPhaseIds.size === phases.length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4" />
          Agregar fase
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agregar fases al proyecto</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Phase set selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Phase set de origen</p>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-input bg-background text-sm hover:bg-muted/40 transition-colors text-left"
              >
                <span className="truncate font-medium">
                  {selectedSet ? `${selectedSet.name} (${selectedSet.phases.length} fases)` : "Seleccionar…"}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform", dropdownOpen && "rotate-180")} />
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                    {defaultPs && (
                      <>
                        <div className="px-3 pt-2 pb-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recomendado para este tipo</p>
                        </div>
                        <PsOption
                          ps={defaultPs}
                          isSelected={selectedSetId === defaultPs.id}
                          onSelect={() => { setSelectedSetId(defaultPs.id); setDropdownOpen(false); setSelectedPhaseIds(new Set()) }}
                          highlight
                        />
                        {otherPs.length > 0 && (
                          <div className="px-3 pt-2 pb-1 border-t border-border/50">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Otros phase sets</p>
                          </div>
                        )}
                      </>
                    )}
                    <div className="max-h-56 overflow-y-auto">
                      {otherPs.map((ps) => (
                        <PsOption
                          key={ps.id}
                          ps={ps}
                          isSelected={selectedSetId === ps.id}
                          onSelect={() => { setSelectedSetId(ps.id); setDropdownOpen(false); setSelectedPhaseIds(new Set()) }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Phase checkboxes */}
          {phases.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Selecciona las fases a agregar</p>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-primary hover:underline"
                >
                  {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 divide-y divide-border/50 overflow-hidden">
                {phases.map((phase, i) => (
                  <label
                    key={phase.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors",
                      selectedPhaseIds.has(phase.id) && "bg-primary/5"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPhaseIds.has(phase.id)}
                      onChange={() => togglePhase(phase.id)}
                      className="accent-primary flex-shrink-0"
                    />
                    <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0" style={{ flex: "1 1 0", width: 0 }}>
                      <p className="text-sm font-medium truncate">{phase.name}</p>
                      {phase.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{phase.description}</p>
                      )}
                    </div>
                    {phase.default_task_set_id && (
                      <span className="flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0 font-medium">
                        <ListChecks className="w-2.5 h-2.5" />
                        Con tareas
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {phases.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Este phase set no tiene fases configuradas.</p>
          )}

          {/* Position picker */}
          {selectedPhaseIds.size > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">¿Dónde insertar?</p>
              <select
                value={afterPhaseId}
                onChange={(e) => setAfterPhaseId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {sortedExisting.length > 0 && <option value="start">Al inicio (antes de todo)</option>}
                {sortedExisting.map((ph) => (
                  <option key={ph.id} value={ph.id}>Después de "{ph.name}"</option>
                ))}
                <option value="end">Al final</option>
              </select>
            </div>
          )}

          {/* No destructive warning — just additive */}
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
            Las fases y tareas existentes no se modifican. Solo se agregan las fases seleccionadas.
          </p>

          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <TriangleAlert className="w-4 h-4 flex-shrink-0" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleImport}
              disabled={isPending || selectedPhaseIds.size === 0}
            >
              {isPending ? "Agregando…" : `Agregar ${selectedPhaseIds.size > 0 ? selectedPhaseIds.size : ""} fase${selectedPhaseIds.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PsOption({ ps, isSelected, onSelect, highlight }: {
  ps: PhaseSet; isSelected: boolean; onSelect: () => void; highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors",
        isSelected && "bg-primary/5",
        highlight && !isSelected && "bg-emerald-50/50 dark:bg-emerald-950/20",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium truncate", highlight && "text-emerald-700 dark:text-emerald-400")}>
          {ps.name}
        </p>
        <p className="text-xs text-muted-foreground">{ps.phases.length} fase{ps.phases.length !== 1 ? "s" : ""}</p>
      </div>
      {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
    </button>
  )
}
