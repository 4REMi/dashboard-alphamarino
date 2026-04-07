"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { applyPhaseSetToProject } from "@/lib/actions/projects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { GitBranch } from "lucide-react"

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
  const [selectedSetId, setSelectedSetId] = useState(defaultPhaseSetId ?? phaseSets[0]?.id ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedSet = phaseSets.find((ps) => ps.id === selectedSetId)

  function handleApply() {
    if (!selectedSetId) return
    setError(null)
    startTransition(async () => {
      try {
        await applyPhaseSetToProject(projectId, selectedSetId)
        setOpen(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al aplicar fases")
      }
    })
  }

  if (phaseSets.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              <p className="text-xs font-medium text-muted-foreground mb-2">Fases que se agregarán:</p>
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

          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">Si el proyecto ya tiene fases, serán reemplazadas.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleApply} disabled={isPending || !selectedSetId}>
            {isPending ? "Aplicando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
