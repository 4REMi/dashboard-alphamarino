"use client"

import { useState } from "react"
import { createTask, updateTask } from "@/lib/actions/tasks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Plus, Flag, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Task, Profile } from "@/lib/types"
import { AutoTextarea } from "@/components/ui/auto-textarea"

interface TaskFormProps {
  projectId: string
  task?: Task
  employees: Profile[]
  trigger?: React.ReactNode
}

export function TaskForm({ projectId, task, employees, trigger }: TaskFormProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string>(task?.status ?? "Todo")
  const [assigneeId, setAssigneeId] = useState<string>(task?.assignee_id ?? "none")
  const [isUrgent, setIsUrgent] = useState(task?.is_urgent ?? false)
  const [requiresDeliverable, setRequiresDeliverable] = useState(task?.requires_deliverable ?? false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.set("status", status)
    formData.set("is_urgent", String(isUrgent))
    formData.set("requires_deliverable", String(requiresDeliverable))
    formData.set("assignee_id", assigneeId === "none" ? "" : assigneeId)
    formData.set("project_id", projectId)

    try {
      if (task) {
        await updateTask(task.id, formData)
      } else {
        await createTask(formData)
      }
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Plus className="w-4 h-4" />
            Nueva Tarea
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Editar Tarea" : "Nueva Tarea"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input id="title" name="title" defaultValue={task?.title} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <AutoTextarea
              id="description"
              name="description"
              rows={2}
              defaultValue={task?.description ?? ""}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todo">Por Hacer</SelectItem>
                  <SelectItem value="In Progress">En Progreso</SelectItem>
                  <SelectItem value="Done">Hecho</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Fecha Límite</Label>
              <Input id="due_date" name="due_date" type="date" defaultValue={task?.due_date ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Asignado a</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Urgent toggle */}
          <button
            type="button"
            onClick={() => setIsUrgent((v) => !v)}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
              isUrgent
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
            )}
          >
            <Flag className={cn("w-4 h-4 flex-shrink-0", isUrgent && "fill-current")} />
            <div className="text-left">
              <p className="font-medium">{isUrgent ? "Urgente" : "Normal"}</p>
              <p className="text-xs opacity-70">
                {isUrgent ? "Requiere atención inmediata" : "Click para marcar como urgente"}
              </p>
            </div>
            <div className={cn(
              "ml-auto w-8 h-4 rounded-full transition-colors flex-shrink-0",
              isUrgent ? "bg-destructive" : "bg-muted-foreground/30"
            )}>
              <div className={cn(
                "w-4 h-4 rounded-full bg-white shadow transition-transform",
                isUrgent ? "translate-x-4" : "translate-x-0"
              )} />
            </div>
          </button>

          {/* Requires deliverable toggle */}
          <button
            type="button"
            onClick={() => setRequiresDeliverable((v) => !v)}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
              requiresDeliverable
                ? "border-info/40 bg-info-subtle text-info-subtle-foreground"
                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
            )}
          >
            <Paperclip className="w-4 h-4 flex-shrink-0" />
            <div className="text-left">
              <p className="font-medium">{requiresDeliverable ? "Requiere entregable" : "Sin entregable"}</p>
              <p className="text-xs opacity-70">
                {requiresDeliverable ? "Este task exige que se entregue un resultado" : "Click para requerir un entregable"}
              </p>
            </div>
            <div className={cn(
              "ml-auto w-8 h-4 rounded-full transition-colors flex-shrink-0",
              requiresDeliverable ? "bg-info" : "bg-muted-foreground/30"
            )}>
              <div className={cn(
                "w-4 h-4 rounded-full bg-white shadow transition-transform",
                requiresDeliverable ? "translate-x-4" : "translate-x-0"
              )} />
            </div>
          </button>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : task ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
