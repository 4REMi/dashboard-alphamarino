"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { deleteProjectPhase } from "@/lib/actions/projects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Pencil, Trash2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Quitar fases de un proyecto existente (p. ej. para reemplazarlas con
// "Agregar fase"). Si la fase tiene tareas, se elige qué hacer con ellas.

interface Props {
  projectId: string
  phases: { id: string; name: string; phase_order: number }[]
  taskCountByPhaseId: Record<string, { done: number; total: number }>
}

export function EditPhasesButton({ projectId, phases, taskCountByPhaseId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [dest, setDest] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order)

  function start(id: string) {
    setError(null)
    setRemoving(id)
    const other = sorted.find((p) => p.id !== id)
    setDest(other ? other.id : "none")
  }

  function confirmDelete(id: string) {
    const count = taskCountByPhaseId[id]?.total ?? 0
    const tasksTo = count === 0 ? "delete" : dest === "delete" ? "delete" : dest === "none" ? null : dest
    startTransition(async () => {
      try {
        await deleteProjectPhase(id, projectId, tasksTo)
        setRemoving(null)
        router.refresh()
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    })
  }

  const select = "h-8 rounded-md border border-input bg-background px-2 text-xs min-w-0"

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRemoving(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="w-4 h-4" />Editar fases</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Fases del proyecto</DialogTitle></DialogHeader>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este proyecto no tiene fases.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sorted.map((p, i) => {
              const count = taskCountByPhaseId[p.id]?.total ?? 0
              const isRemoving = removing === p.id
              return (
                <li key={p.id} className={cn("px-3 py-2.5", isRemoving && "bg-red-50/60 dark:bg-red-950/20")}>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-muted text-[11px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{p.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{count ? `${count} tarea${count === 1 ? "" : "s"}` : "Sin tareas"}</span>
                    </span>
                    {!isRemoving && (
                      <button type="button" onClick={() => start(p.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted" aria-label={`Quitar ${p.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {isRemoving && (
                    <div className="mt-2 pl-9 space-y-2">
                      {count > 0 && (
                        <label className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Sus {count} tarea{count === 1 ? "" : "s"}:</span>
                          <select value={dest} onChange={(e) => setDest(e.target.value)} className={select}>
                            {sorted.filter((o) => o.id !== p.id).map((o) => <option key={o.id} value={o.id}>Mover a “{o.name}”</option>)}
                            <option value="none">Dejar sin fase</option>
                            <option value="delete">Eliminarlas</option>
                          </select>
                        </label>
                      )}
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="destructive" onClick={() => confirmDelete(p.id)} disabled={isPending}>
                          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Quitar fase
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRemoving(null)} disabled={isPending}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-[11px] text-muted-foreground">Para reemplazar fases: quita las que sobran aquí y agrega las nuevas con “Agregar fase”.</p>
      </DialogContent>
    </Dialog>
  )
}
