"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { processStandup } from "@/lib/actions/standup"
import { createTask } from "@/lib/actions/tasks"
import { addLogEntry } from "@/lib/actions/projects"
import { Loader2, Sparkles, X, Check, ClipboardList, MessageSquare } from "lucide-react"
import type { Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ProjectOption { id: string; name: string }

interface EditableItem {
  key: string
  tipo: "tarea" | "nota_proyecto"
  title: string        // tarea: título. nota_proyecto: cuerpo (multilinea)
  projectId: string    // "" = sin proyecto (solo válido para tarea)
  assigneeId: string   // solo tarea
  dueDate: string       // solo tarea, YYYY-MM-DD o ""
}

interface Props {
  projects: ProjectOption[]
  employees: Profile[]
  currentUserId: string
  onClose: () => void
  onCreated: () => void
}

export function StandupDump({ projects, employees, currentUserId, onClose, onCreated }: Props) {
  const [text, setText] = useState("")
  const [processing, setProcessing] = useState(false)
  const [items, setItems] = useState<EditableItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function handleProcess() {
    if (!text.trim()) return
    setError(null)
    setProcessing(true)
    processStandup(text)
      .then((results) => {
        setItems(results.map((r, i) => ({
          key: `${i}-${Date.now()}`,
          tipo: r.tipo,
          title: r.tipo === "tarea" ? (r.titulo ?? "") : (r.descripcion ?? ""),
          projectId: r.projectIdGuess ?? "",
          assigneeId: r.assigneeIdGuess ?? currentUserId,
          dueDate: r.fecha ?? "",
        })))
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo interpretar el texto"))
      .finally(() => setProcessing(false))
  }

  function updateItem(key: string, patch: Partial<EditableItem>) {
    setItems((prev) => prev?.map((it) => it.key === key ? { ...it, ...patch } : it) ?? null)
  }

  function discardItem(key: string) {
    setItems((prev) => prev?.filter((it) => it.key !== key) ?? null)
  }

  async function handleConfirm() {
    if (!items || items.length === 0) return
    // Notas SIEMPRE necesitan proyecto — no tiene sentido una bitácora suelta.
    const missingProject = items.find((it) => it.tipo === "nota_proyecto" && !it.projectId)
    if (missingProject) {
      setError("Hay una nota sin proyecto asignado — elige uno o descártala.")
      return
    }

    setConfirming(true)
    setError(null)
    const results = await Promise.allSettled(items.map(async (it) => {
      if (it.tipo === "nota_proyecto") {
        await addLogEntry(it.projectId, it.title)
      } else {
        const fd = new FormData()
        if (it.projectId) fd.set("project_id", it.projectId)
        fd.set("title", it.title)
        fd.set("status", "Todo")
        fd.set("is_urgent", "false")
        fd.set("requires_deliverable", "false")
        if (it.dueDate) fd.set("due_date", it.dueDate)
        if (it.assigneeId) fd.set("assignee_id", it.assigneeId)
        await createTask(fd)
      }
    }))
    setConfirming(false)

    const failed = results.filter((r) => r.status === "rejected").length
    if (failed > 0) {
      setError(`${failed} de ${items.length} no se pudieron crear — intenta de nuevo con esas.`)
      // Deja en la lista solo las que fallaron, para reintentar sin repetir las que sí se crearon.
      setItems((prev) => (prev ?? []).filter((_, i) => results[i].status === "rejected"))
      return
    }

    onCreated()
    onClose()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Volcado rápido
          </DialogTitle>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {items === null ? (
          <>
            <p className="text-xs text-muted-foreground">
              Escribe todos los pendientes y actualizaciones que se te ocurran, de cualquier proyecto — el sistema los separa en tareas y notas de bitácora por proyecto antes de crear nada.
            </p>
            <AutoTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Ej. Para Alpha Marino hay que revisar el brief de campaña, asígnasela a Karla. Nota para NUACEL: el cliente pidió mover el checkout a fin de mes. Recordar renovar el dominio de Driink…"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleProcess} disabled={!text.trim() || processing}>
                {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                Procesar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Nada se ha creado todavía. Revisa y corrige proyecto/responsable antes de confirmar — descarta lo que no aplique.
            </p>
            <div className="flex-1 overflow-y-auto space-y-3 py-1">
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No queda nada por confirmar.</p>
              )}
              {items.map((it) => (
                <div key={it.key} className="border rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                      it.tipo === "tarea" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {it.tipo === "tarea" ? <ClipboardList className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                      {it.tipo === "tarea" ? "Tarea" : "Nota de bitácora"}
                    </span>
                    <button onClick={() => discardItem(it.key)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {it.tipo === "tarea" ? (
                    <Input
                      value={it.title}
                      onChange={(e) => updateItem(it.key, { title: e.target.value })}
                      placeholder="Título de la tarea"
                      className="text-sm"
                    />
                  ) : (
                    <AutoTextarea
                      value={it.title}
                      onChange={(e) => updateItem(it.key, { title: e.target.value })}
                      rows={2}
                      placeholder="Cuerpo de la nota"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    />
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={it.projectId}
                      onChange={(e) => updateItem(it.key, { projectId: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                    >
                      {it.tipo === "tarea" && <option value="">Sin proyecto</option>}
                      {it.tipo === "nota_proyecto" && <option value="" disabled>Elige un proyecto</option>}
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>

                    {it.tipo === "tarea" ? (
                      <select
                        value={it.assigneeId}
                        onChange={(e) => updateItem(it.key, { assigneeId: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                      >
                        <option value="">Sin asignar</option>
                        {employees.map((e) => <option key={e.id} value={e.id}>{e.id === currentUserId ? "Tú" : e.full_name}</option>)}
                      </select>
                    ) : (
                      <div />
                    )}
                  </div>

                  {it.tipo === "tarea" && (
                    <Input
                      type="date"
                      value={it.dueDate}
                      onChange={(e) => updateItem(it.key, { dueDate: e.target.value })}
                      className="text-xs w-40"
                    />
                  )}
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2 pt-2 border-t">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={items.length === 0 || confirming}>
                {confirming ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                Confirmar ({items.length})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
