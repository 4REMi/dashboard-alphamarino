"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { processStandup } from "@/lib/actions/standup"
import { createTask } from "@/lib/actions/tasks"
import { addLogEntry } from "@/lib/actions/projects"
import { Loader2, Sparkles, X, Check, ClipboardList, MessageSquare, Lock, Users } from "lucide-react"
import type { Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

// Same sentinel as tasks-client.tsx's PERSONAL_KEY — duplicated as a literal
// (rather than imported) to avoid a circular import between the two client
// components; it's just used to find the matching "Mi lista" tile's
// data-tile-key for the fly-to-folder animation below.
const PERSONAL_KEY = "personal"

interface ProjectOption { id: string; name: string }

interface EditableItem {
  key: string
  tipo: "tarea" | "nota_proyecto"
  title: string        // tarea: título. nota_proyecto: cuerpo (multilinea)
  projectId: string    // "" = sin proyecto (solo válido para tarea)
  assigneeId: string   // solo tarea
  dueDate: string       // solo tarea, YYYY-MM-DD o ""
  // Solo tarea + con proyecto: mantiene el proyecto para agruparla en "Mi
  // lista", pero la saca del tablero compartido — para detalles que no le
  // importan al resto del equipo aunque estén ligados a un proyecto real.
  isPersonal: boolean
}

interface Flight {
  key: string
  tipo: "tarea" | "nota_proyecto"
  from: DOMRect
  to: DOMRect
}

// Which overview tile a confirmed item should "fly" to: notes always belong
// to their project; a task goes to "Mi lista" whenever it has no project or
// was marked personal, otherwise to that project's own tile.
function destinationTileKey(it: EditableItem): string {
  if (it.tipo === "nota_proyecto") return it.projectId
  if (!it.projectId || it.isPersonal) return PERSONAL_KEY
  return it.projectId
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
  const [flights, setFlights] = useState<Flight[]>([])
  const [closingAfterFlights, setClosingAfterFlights] = useState(false)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Close on Escape, like the Dialog primitive did.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  // Once every flying chip has landed, actually refresh and close.
  useEffect(() => {
    if (closingAfterFlights && flights.length === 0) {
      onCreated()
      onClose()
    }
  }, [closingAfterFlights, flights, onCreated, onClose])

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
          isPersonal: false,
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

  function removeFlight(key: string) {
    setFlights((prev) => prev.filter((f) => f.key !== key))
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
        fd.set("is_personal", String(!!it.projectId && it.isPersonal))
        if (it.dueDate) fd.set("due_date", it.dueDate)
        if (it.assigneeId) fd.set("assignee_id", it.assigneeId)
        await createTask(fd)
      }
    }))
    setConfirming(false)

    // Capture each succeeded card's on-screen position (and its tile's)
    // BEFORE removing anything from state — the DOM still reflects the
    // pre-confirm layout at this point.
    const succeeded = items.filter((_, i) => results[i].status === "fulfilled")
    const failed = items.filter((_, i) => results[i].status === "rejected")

    const newFlights = succeeded.flatMap((it) => {
      const fromEl = cardRefs.current[it.key]
      const toEl = document.querySelector<HTMLElement>(`[data-tile-key="${destinationTileKey(it)}"]`)
      if (!fromEl || !toEl) return []
      return [{ key: it.key, tipo: it.tipo, from: fromEl.getBoundingClientRect(), to: toEl.getBoundingClientRect() }]
    })

    if (failed.length > 0) {
      setError(`${failed.length} de ${items.length} no se pudieron crear — intenta de nuevo con esas.`)
      setItems(failed)
    } else {
      setItems([])
    }

    if (newFlights.length > 0) {
      setFlights((prev) => [...prev, ...newFlights])
      setClosingAfterFlights(failed.length === 0)
    } else if (failed.length === 0) {
      // Nothing to animate (tile not found, e.g.) — still finish normally.
      onCreated()
      onClose()
    }
  }

  return (
    <>
      {/* Click-away layer — intentionally transparent (no dark backdrop) so
          the project overview stays visible and legible behind the panel
          while the user is writing. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Bottom sheet, not a side panel — a side panel still covered several
          tiles on wide grids. Anchored to the bottom and capped in height
          so the full project overview stays visible above it. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[60vh] bg-card border-t border-border shadow-2xl rounded-t-2xl flex flex-col animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="w-4 h-4 text-violet-500" />
            Captura rápida
          </h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {error && <p className="text-xs text-destructive">{error}</p>}

          {items === null ? (
            <div className="max-w-2xl w-full mx-auto flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Escribe todos los pendientes y actualizaciones que se te ocurran, de cualquier proyecto — el sistema los separa en tareas y notas de bitácora por proyecto antes de crear nada. Puedes seguir viendo tus proyectos arriba mientras escribes.
              </p>
              <AutoTextarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="Ej. Para Alpha Marino hay que revisar el brief de campaña, asígnasela a Karla. Nota para NUACEL: el cliente pidió mover el checkout a fin de mes. Recordar renovar el dominio de Driink…"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Nada se ha creado todavía. Revisa y corrige proyecto/responsable antes de confirmar — descarta lo que no aplique.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8 sm:col-span-2 xl:col-span-3">No queda nada por confirmar.</p>
                )}
                {items.map((it) => (
                  <div
                    key={it.key}
                    ref={(el) => { cardRefs.current[it.key] = el }}
                    className="border rounded-xl p-3 space-y-2.5"
                  >
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
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Input
                          type="date"
                          value={it.dueDate}
                          onChange={(e) => updateItem(it.key, { dueDate: e.target.value })}
                          className="text-xs w-36"
                        />
                        {/* Alcance visible y obligatorio de revisar — nunca un
                            default silencioso. Con proyecto, alterna entre
                            "todo el equipo la ve" y "solo yo la veo (pero
                            sigue agrupada en el proyecto en Mi lista)". Sin
                            proyecto ya es personal por definición, así que
                            solo se informa, no se puede tocar. */}
                        {it.projectId ? (
                          <button
                            type="button"
                            onClick={() => updateItem(it.key, { isPersonal: !it.isPersonal })}
                            className={cn(
                              "flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full transition-colors",
                              it.isPersonal
                                ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                                : "bg-muted text-muted-foreground hover:bg-muted/70"
                            )}
                            title="Click para cambiar el alcance"
                          >
                            {it.isPersonal ? <Lock className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                            {it.isPersonal ? "Solo yo la veo" : "Visible para el equipo"}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
                            <Lock className="w-3 h-3" />
                            Solo yo la veo — sin proyecto
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border flex-shrink-0">
          {items === null ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleProcess} disabled={!text.trim() || processing}>
                {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                Procesar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={items.length === 0 || confirming}>
                {confirming ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                Confirmar ({items.length})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Fly-to-folder animation — one dot per confirmed item, traveling
          from its card to the destination tile (portaled to <body> so the
          panel's own overflow/scroll never clips it). */}
      {typeof document !== "undefined" && createPortal(
        flights.map((f) => (
          <FlyingChip key={f.key} flight={f} onDone={() => removeFlight(f.key)} />
        )),
        document.body
      )}
    </>
  )
}

function FlyingChip({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const start = {
    x: flight.from.left + flight.from.width / 2,
    y: flight.from.top + flight.from.height / 2,
  }
  const end = {
    x: flight.to.left + flight.to.width / 2,
    y: flight.to.top + flight.to.height / 2,
  }
  const [pos, setPos] = useState({ ...start, scale: 1, opacity: 1 })

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setPos({ ...end, scale: 0.3, opacity: 0 })
    })
    const timer = setTimeout(onDone, 650)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed left-0 top-0 z-[100] pointer-events-none w-3.5 h-3.5 rounded-full shadow-md"
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) scale(${pos.scale})`,
        opacity: pos.opacity,
        transition: "transform 600ms cubic-bezier(0.22, 0.8, 0.3, 1), opacity 600ms ease-in",
        backgroundColor: flight.tipo === "tarea" ? "#8b5cf6" : "#3b82f6",
      }}
    />
  )
}
