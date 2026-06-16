"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { applyPhaseSetToProject } from "@/lib/actions/projects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { GitBranch, TriangleAlert, ChevronDown, Check, ListChecks } from "lucide-react"
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

interface Props {
  projectId: string
  phaseSets: PhaseSet[]
  defaultPhaseSetId?: string | null
}

export function ApplyPhasesButton({ projectId, phaseSets, defaultPhaseSetId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"select" | "confirm">("select")
  const [selectedSetId, setSelectedSetId] = useState(defaultPhaseSetId ?? phaseSets[0]?.id ?? "")
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedSet = phaseSets.find((ps) => ps.id === selectedSetId)
  const isDefault = selectedSetId === defaultPhaseSetId

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) { setStep("select"); setDropdownOpen(false) }
  }

  function handleApply() {
    if (!selectedSetId) return
    setError(null)
    startTransition(async () => {
      try {
        await applyPhaseSetToProject(projectId, selectedSetId)
        setOpen(false)
        setStep("select")
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al aplicar fases")
      }
    })
  }

  if (phaseSets.length === 0) return null

  // Split: default on top, rest below
  const defaultPs = phaseSets.find((ps) => ps.id === defaultPhaseSetId)
  const otherPs   = phaseSets.filter((ps) => ps.id !== defaultPhaseSetId)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GitBranch className="w-4 h-4" />
          Aplicar fases
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aplicar fases al proyecto</DialogTitle>
        </DialogHeader>

        {step === "select" ? (
          <div className="space-y-5 py-1">
            {/* ── Phase set selector ── */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Phase set</p>

              {/* Custom dropdown trigger */}
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
                          <PhaseSetOption
                            ps={defaultPs}
                            isSelected={selectedSetId === defaultPs.id}
                            onSelect={() => { setSelectedSetId(defaultPs.id); setDropdownOpen(false) }}
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
                          <PhaseSetOption
                            key={ps.id}
                            ps={ps}
                            isSelected={selectedSetId === ps.id}
                            onSelect={() => { setSelectedSetId(ps.id); setDropdownOpen(false) }}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Non-default warning */}
              {selectedSetId && !isDefault && defaultPhaseSetId && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0" />
                  Este phase set no corresponde al tipo de proyecto configurado.
                </p>
              )}
            </div>

            {/* ── Phase preview ── */}
            {selectedSet && selectedSet.phases.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {selectedSet.phases.length} fase{selectedSet.phases.length !== 1 ? "s" : ""} que se crearán
                  </p>
                </div>
                <div className="divide-y divide-border/50">
                  {selectedSet.phases.map((phase, i) => (
                    <div key={phase.id} className="flex items-center gap-3 px-4 py-2.5 overflow-hidden">
                      <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0 overflow-hidden">
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
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedSet && selectedSet.phases.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Este phase set no tiene fases configuradas.</p>
            )}

            {/* ── Info footer ── */}
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              Al continuar se <strong>reemplazarán</strong> las fases y tareas actuales del proyecto. Esta acción no se puede deshacer.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => setStep("confirm")} disabled={!selectedSetId || selectedSet?.phases.length === 0}>
                Continuar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <TriangleAlert className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm font-semibold">Esta acción no se puede deshacer</p>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1.5 ml-6 list-disc">
                <li>Se eliminarán <strong>todas las tareas actuales</strong> del proyecto</li>
                <li>Se eliminarán las fases existentes</li>
                <li>Se crearán <strong>{selectedSet?.phases.length} fases nuevas</strong> con sus tareas plantilla</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 flex items-center gap-3">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Se aplicará</p>
                <p className="text-sm font-semibold">{selectedSet?.name}</p>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setStep("select")} disabled={isPending}>
                Atrás
              </Button>
              <Button variant="destructive" onClick={handleApply} disabled={isPending}>
                {isPending ? "Aplicando…" : "Sí, reemplazar todo"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Phase set option row in dropdown ────────────────────────────────────────

function PhaseSetOption({ ps, isSelected, onSelect, highlight }: {
  ps: PhaseSet
  isSelected: boolean
  onSelect: () => void
  highlight?: boolean
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
