"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { applyPhaseSetToProject } from "@/lib/actions/projects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { GitBranch, TriangleAlert } from "lucide-react"

interface PhaseSet {
  id: string
  name: string
  phases: { id: string; name: string }[]
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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedSet = phaseSets.find((ps) => ps.id === selectedSetId)

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) setStep("select")
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GitBranch className="w-4 h-4" />
          Aplicar fases
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Aplicar fases al proyecto</DialogTitle>
        </DialogHeader>

        {step === "select" ? (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Phase set</Label>
                <Select value={selectedSetId} onValueChange={setSelectedSetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {phaseSets.map((ps) => (
                      <SelectItem key={ps.id} value={ps.id}>
                        {ps.name} ({ps.phases.length} fases)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSet && selectedSet.phases.length > 0 && (
                <div className="rounded-md bg-muted/50 p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Fases que se aplicarán:</p>
                  {selectedSet.phases.map((phase, i) => (
                    <div key={phase.id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center text-xs text-muted-foreground font-medium flex-shrink-0">
                        {i + 1}
                      </span>
                      {phase.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => setStep("confirm")} disabled={!selectedSetId}>
                Continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="py-2 space-y-4">
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive">
                  <TriangleAlert className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm font-semibold">Esta acción no se puede deshacer</p>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Se eliminarán <strong>todas las tareas actuales</strong> del proyecto</li>
                  <li>Se eliminarán las fases existentes</li>
                  <li>Se crearán las nuevas fases y sus tareas plantilla</li>
                </ul>
              </div>

              <p className="text-sm text-muted-foreground">
                Se aplicará: <span className="font-medium text-foreground">{selectedSet?.name}</span>
              </p>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("select")} disabled={isPending}>
                Atrás
              </Button>
              <Button variant="destructive" onClick={handleApply} disabled={isPending}>
                {isPending ? "Aplicando…" : "Sí, reemplazar todo"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
