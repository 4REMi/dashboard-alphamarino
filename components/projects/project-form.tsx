"use client"

import { useState, useTransition } from "react"
import { createProject, updateProject } from "@/lib/actions/projects"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Plus } from "lucide-react"
import type { Project, Customer, ProjectType, PhaseSetPhase } from "@/lib/types"

interface ProjectFormProps {
  project?: Project
  customers: Customer[]
  projectTypes: ProjectType[]
  trigger?: React.ReactNode
}

export function ProjectForm({ project, customers, projectTypes, trigger }: ProjectFormProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string>(project?.status ?? "Planning")
  const [customerId, setCustomerId] = useState(project?.customer_id ?? "none")
  const [projectTypeId, setProjectTypeId] = useState(project?.project_type_id ?? "none")
  const [selectedPhaseIds, setSelectedPhaseIds] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  // Get the selected project type and its default phase set
  const selectedType = projectTypes.find((pt) => pt.id === projectTypeId)
  const defaultPhaseSet = selectedType?.default_phase_set as { phases?: PhaseSetPhase[] } | undefined
  const availablePhases: PhaseSetPhase[] = defaultPhaseSet?.phases ?? []

  function handleTypeChange(typeId: string) {
    setProjectTypeId(typeId)
    // Auto-select all phases of the new type's default phase set
    const type = projectTypes.find((pt) => pt.id === typeId)
    const phases = (type?.default_phase_set as { phases?: PhaseSetPhase[] } | undefined)?.phases ?? []
    setSelectedPhaseIds(phases.map((p) => p.id))
  }

  function togglePhase(phaseId: string) {
    setSelectedPhaseIds((prev) =>
      prev.includes(phaseId) ? prev.filter((id) => id !== phaseId) : [...prev, phaseId]
    )
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("status", status)
    formData.set("customer_id", customerId === "none" ? "" : customerId)
    formData.set("project_type_id", projectTypeId === "none" ? "" : projectTypeId)

    startTransition(async () => {
      if (project) {
        await updateProject(project.id, formData)
      } else {
        await createProject(formData, selectedPhaseIds.length > 0 ? selectedPhaseIds : undefined)
      }
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="w-4 h-4" />
            Nuevo Proyecto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Editar Proyecto" : "Nuevo Proyecto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" name="name" defaultValue={project?.name} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Proyecto</Label>
              <Select value={projectTypeId} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin tipo</SelectItem>
                  {projectTypes.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cliente</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Planning">Planificación</SelectItem>
                <SelectItem value="In Progress">En Progreso</SelectItem>
                <SelectItem value="Review">Revisión</SelectItem>
                <SelectItem value="Completed">Completado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project_value">Valor del Proyecto ($)</Label>
              <Input id="project_value" name="project_value" type="number" min="0" step="0.01"
                defaultValue={project?.project_value ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_fee">Fee Mensual ($)</Label>
              <Input id="monthly_fee" name="monthly_fee" type="number" min="0" step="0.01"
                defaultValue={project?.monthly_fee ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Fecha Inicio</Label>
              <Input id="start_date" name="start_date" type="date" defaultValue={project?.start_date ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">Fecha Fin Estimada</Label>
              <Input id="end_date" name="end_date" type="date" defaultValue={project?.end_date ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={project?.description ?? ""}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Phase set checkboxes — only when creating and type has phases */}
          {!project && availablePhases.length > 0 && (
            <div className="space-y-2 border border-border rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Fases a incluir ({selectedPhaseIds.length}/{availablePhases.length})
              </p>
              <div className="space-y-1.5">
                {availablePhases.map((phase) => (
                  <label key={phase.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPhaseIds.includes(phase.id)}
                      onChange={() => togglePhase(phase.id)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm text-foreground">{phase.name}</span>
                    {phase.description && (
                      <span className="text-xs text-muted-foreground">— {phase.description}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : project ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
