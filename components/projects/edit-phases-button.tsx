"use client"

import { useEffect, useState, useTransition } from "react"
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useRouter } from "next/navigation"
import { deleteProjectPhases, reorderProjectPhases } from "@/lib/actions/projects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Pencil, Trash2, Loader2, GripVertical, Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Editar fases de un proyecto existente: reordenar arrastrando y quitar una
// o varias (con checkbox). Para cada fase quitada con tareas se elige qué
// hacer con ellas: moverlas a una fase que se queda, dejarlas sin fase o
// eliminarlas.

interface Props {
  projectId: string
  phases: { id: string; name: string; phase_order: number }[]
  taskCountByPhaseId: Record<string, { done: number; total: number }>
}

export function EditPhasesButton({ projectId, phases, taskCountByPhaseId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dest, setDest] = useState<Record<string, string>>({}) // phaseId → phaseId | "none" | "delete"
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [sorted, setSorted] = useState(() => [...phases].sort((a, b) => a.phase_order - b.phase_order))
  useEffect(() => { setSorted([...phases].sort((a, b) => a.phase_order - b.phase_order)) }, [phases])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const count = (id: string) => taskCountByPhaseId[id]?.total ?? 0
  const keeping = sorted.filter((p) => !selected.has(p.id))
  const chosen = sorted.filter((p) => selected.has(p.id))
  const withTasks = chosen.filter((p) => count(p.id) > 0)
  // Destino efectivo: si el elegido ya no es válido (esa fase también se va), cae a la primera que se queda.
  const destFor = (id: string) => {
    const d = dest[id]
    if (d === "none" || d === "delete") return d
    if (d && keeping.some((k) => k.id === d)) return d
    return keeping[0]?.id ?? "none"
  }

  function toggle(id: string) {
    setError(null)
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const from = sorted.findIndex((p) => p.id === e.active.id), to = sorted.findIndex((p) => p.id === e.over!.id)
    const prev = sorted
    const next = arrayMove(sorted, from, to)
    setSorted(next)
    setError(null)
    startTransition(async () => {
      try { await reorderProjectPhases(projectId, next.map((p) => p.id)); router.refresh() }
      catch (err) { setSorted(prev); setError(err instanceof Error ? err.message : String(err)) }
    })
  }

  function confirmDelete() {
    const items = chosen.map((p) => {
      const d = count(p.id) === 0 ? "delete" : destFor(p.id)
      return { phaseId: p.id, tasksTo: d === "none" ? null : d }
    })
    const deleting = withTasks.filter((p) => destFor(p.id) === "delete").reduce((s, p) => s + count(p.id), 0)
    if (deleting > 0 && !confirm(`Se eliminarán ${deleting} tarea${deleting === 1 ? "" : "s"} junto con las fases. ¿Continuar?`)) return
    startTransition(async () => {
      try {
        await deleteProjectPhases(projectId, items)
        setSorted((s) => s.filter((p) => !selected.has(p.id)))
        setSelected(new Set())
        setDest({})
        router.refresh()
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    })
  }

  const select = "h-8 rounded-md border border-input bg-background px-2 text-xs min-w-0 max-w-[60%]"

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelected(new Set()); setDest({}); setError(null) } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="w-4 h-4" />Editar fases</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] grid-cols-1 [&>*]:min-w-0">
        <DialogHeader><DialogTitle>Fases del proyecto</DialogTitle></DialogHeader>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este proyecto no tiene fases.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sorted.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border rounded-lg border border-border max-h-[50vh] overflow-y-auto">
                {sorted.map((p, i) => {
                  const on = selected.has(p.id)
                  const n = count(p.id)
                  return (
                    <Row key={p.id} id={p.id} className={cn("px-3 py-2.5", on && "bg-red-50/60 dark:bg-red-950/20")}>{(handle) => (
                      <div className="flex items-center gap-3">
                        {handle}
                        <button type="button" role="checkbox" aria-checked={on} aria-label={`Seleccionar ${p.name}`} onClick={() => toggle(p.id)}
                          className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", on ? "bg-destructive border-destructive text-white" : "border-muted-foreground/40 hover:border-foreground")}>
                          {on && <Check className="w-3 h-3" />}
                        </button>
                        <span className="w-6 h-6 rounded-full bg-muted text-[11px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                        <button type="button" onClick={() => toggle(p.id)} className="flex-1 min-w-0 text-left">
                          <span className={cn("block text-sm font-medium truncate", on && "line-through decoration-destructive/50")}>{p.name}</span>
                          <span className="block text-[11px] text-muted-foreground">{n ? `${n} tarea${n === 1 ? "" : "s"}` : "Sin tareas"}</span>
                        </button>
                      </div>
                    )}</Row>
                  )
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {chosen.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2.5">
            <p className="text-sm font-medium">Quitar {chosen.length} fase{chosen.length === 1 ? "" : "s"}</p>
            {withTasks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Qué hacer con sus tareas:</p>
                {withTasks.map((p) => (
                  <label key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{p.name} <span className="text-muted-foreground">· {count(p.id)}</span></span>
                    <select value={destFor(p.id)} onChange={(e) => setDest((d) => ({ ...d, [p.id]: e.target.value }))} className={select}>
                      {keeping.map((o) => <option key={o.id} value={o.id}>Mover a “{o.name}”</option>)}
                      <option value="none">Dejar sin fase</option>
                      <option value="delete">Eliminarlas</option>
                    </select>
                  </label>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="destructive" onClick={confirmDelete} disabled={isPending}>
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Quitar {chosen.length} fase{chosen.length === 1 ? "" : "s"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSelected(new Set()); setDest({}) }} disabled={isPending}>Cancelar</Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-[11px] text-muted-foreground">Arrastra para reordenar · marca las fases a quitar. Para reemplazar fases: quítalas aquí y agrega las nuevas con “Agregar fase”.</p>
      </DialogContent>
    </Dialog>
  )
}

function Row({ id, className, children }: { id: string; className?: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = (
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label="Arrastrar para reordenar"
      className="-ml-1 p-1 rounded text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none">
      <GripVertical className="w-4 h-4" />
    </button>
  )
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(className, !className?.includes("bg-") && "bg-card", isDragging && "relative z-10 shadow-lg ring-1 ring-border rounded-md bg-card")}>
      {children(handle)}
    </li>
  )
}
