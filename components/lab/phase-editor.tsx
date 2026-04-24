"use client"

import { useState, useTransition } from "react"
import type { LabPhase, LabPhaseTask } from "@/lib/types"
import {
  createPhase, updatePhase, deletePhase, submitPhase, retractPhase,
  addPhaseTask, updatePhaseTask, deletePhaseTask,
} from "@/lib/actions/lab"
import { Plus, Trash2, Pencil, CheckCircle2, XCircle, MessageSquare, Send, RotateCcw, X } from "lucide-react"

interface Props {
  initialPhases: LabPhase[]
}

export function PhaseEditor({ initialPhases }: Props) {
  const [phases, setPhases] = useState<LabPhase[]>(initialPhases)
  const [selectedId, setSelectedId] = useState<string | null>(phases[0]?.id ?? null)
  const [showNew, setShowNew] = useState(false)
  const [isPending, startTransition] = useTransition()

  const selected = phases.find((p) => p.id === selectedId) ?? null

  function onPhaseCreated(phase: LabPhase) {
    setPhases((prev) => [phase, ...prev])
    setSelectedId(phase.id)
    setShowNew(false)
  }

  function onPhaseUpdated(id: string, patch: Partial<LabPhase>) {
    setPhases((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p))
  }

  function onPhaseDeleted(id: string) {
    setPhases((prev) => {
      const next = prev.filter((p) => p.id !== id)
      setSelectedId(next[0]?.id ?? null)
      return next
    })
  }

  const statusLabel: Record<LabPhase["status"], string> = {
    draft:     "Borrador",
    submitted: "En revisión",
    approved:  "Aprobada",
    rejected:  "Rechazada",
  }
  const statusColor: Record<LabPhase["status"], string> = {
    draft:     "text-muted-foreground",
    submitted: "text-amber-600",
    approved:  "text-emerald-600",
    rejected:  "text-destructive",
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* Left: phase list */}
      <div className="w-56 flex-shrink-0 space-y-1">
        <button
          onClick={() => setShowNew(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-primary hover:bg-primary/5 transition-colors border border-dashed border-primary/30"
        >
          <Plus className="w-3.5 h-3.5" /> Nueva fase
        </button>

        {phases.map((p) => (
          <button
            key={p.id}
            onClick={() => { setSelectedId(p.id); setShowNew(false) }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${selectedId === p.id && !showNew ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
          >
            <div className="truncate font-medium">{p.name}</div>
            <div className="flex items-center justify-between gap-1 mt-0.5">
              <span className="text-xs text-muted-foreground">{(p.tasks ?? []).length} tareas</span>
              <span className={`text-[10px] font-semibold flex-shrink-0 ${statusColor[p.status]}`}>
                {statusLabel[p.status]}
              </span>
            </div>
          </button>
        ))}

        {phases.length === 0 && !showNew && (
          <p className="text-xs text-muted-foreground px-3 py-2">Aún no hay fases.</p>
        )}
      </div>

      {/* Right: detail */}
      <div className="flex-1 min-w-0">
        {showNew ? (
          <NewPhaseForm
            isPending={isPending}
            startTransition={startTransition}
            onCreated={onPhaseCreated}
            onCancel={() => setShowNew(false)}
          />
        ) : !selected ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Selecciona o crea una fase.
          </div>
        ) : (
          <PhaseDetail
            phase={selected}
            isPending={isPending}
            startTransition={startTransition}
            onUpdated={(patch) => onPhaseUpdated(selected.id, patch)}
            onDeleted={() => onPhaseDeleted(selected.id)}
          />
        )}
      </div>
    </div>
  )
}

// ── New phase form ────────────────────────────────────────────────────────────

function NewPhaseForm({
  isPending, startTransition, onCreated, onCancel,
}: {
  isPending: boolean
  startTransition: (fn: () => void) => void
  onCreated: (phase: LabPhase) => void
  onCancel: () => void
}) {
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")

  function handleCreate() {
    if (!name.trim()) return
    const fd = new FormData()
    fd.set("name", name.trim())
    fd.set("description", desc.trim())
    startTransition(async () => {
      const phase = await createPhase(fd)
      onCreated(phase)
    })
  }

  return (
    <div className="space-y-3 max-w-lg">
      <h3 className="text-sm font-semibold">Nueva fase</h3>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la fase"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Descripción (opcional)"
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={isPending || !name.trim()}
          className="text-sm px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Crear
        </button>
        <button onClick={onCancel} className="text-sm px-3 py-1.5 text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Phase detail ──────────────────────────────────────────────────────────────

function PhaseDetail({
  phase, isPending, startTransition, onUpdated, onDeleted,
}: {
  phase: LabPhase
  isPending: boolean
  startTransition: (fn: () => void) => void
  onUpdated: (patch: Partial<LabPhase>) => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(phase.name)
  const [desc, setDesc] = useState(phase.description ?? "")
  const [tasks, setTasks] = useState<LabPhaseTask[]>(phase.tasks ?? [])

  const isEditable = phase.status === "draft" || phase.status === "rejected"
  const reviews = [...(phase.reviews ?? [])].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const lastActionReview = [...reviews].reverse().find((r) => r.action !== "comment")

  function handleSaveHeader() {
    if (!name.trim()) return
    const fd = new FormData()
    fd.set("name", name.trim())
    fd.set("description", desc.trim())
    startTransition(async () => {
      await updatePhase(phase.id, fd)
      onUpdated({ name: name.trim(), description: desc.trim() || null })
      setEditing(false)
    })
  }

  function handleDelete() {
    if (!confirm("¿Eliminar esta fase?")) return
    startTransition(async () => {
      await deletePhase(phase.id)
      onDeleted()
    })
  }

  function handleSubmit() {
    startTransition(async () => {
      await submitPhase(phase.id)
      onUpdated({ status: "submitted" })
    })
  }

  function handleRetract() {
    startTransition(async () => {
      await retractPhase(phase.id)
      onUpdated({ status: "draft" })
    })
  }

  function onTaskAdded(task: LabPhaseTask) {
    setTasks((prev) => [...prev, task])
  }

  function onTaskDeleted(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  function onTaskUpdated(id: string, title: string) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, title } : t))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Descripción (opcional)"
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveHeader}
                  disabled={isPending}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Guardar
                </button>
                <button onClick={() => setEditing(false)} className="text-xs px-2 py-1.5 text-muted-foreground hover:text-foreground">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{phase.name}</h2>
              {phase.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{phase.description}</p>
              )}
            </>
          )}
        </div>

        {isEditable && !editing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleDelete} disabled={isPending} className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Last review feedback */}
      {lastActionReview && (
        <div className={`rounded-lg px-3 py-2.5 text-sm flex items-start gap-2 ${lastActionReview.action === "approve" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {lastActionReview.action === "approve" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <div>
            <span className="font-medium">{lastActionReview.action === "approve" ? "Aprobada" : "Rechazada"}</span>
            {lastActionReview.comment && <span> — {lastActionReview.comment}</span>}
          </div>
        </div>
      )}

      {/* Tasks */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tareas</p>
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin tareas aún.</p>
        )}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            editable={isEditable}
            isPending={isPending}
            startTransition={startTransition}
            onDeleted={() => onTaskDeleted(t.id)}
            onUpdated={(title) => onTaskUpdated(t.id, title)}
          />
        ))}
        {isEditable && (
          <AddTaskForm
            phaseId={phase.id}
            isPending={isPending}
            startTransition={startTransition}
            onAdded={onTaskAdded}
          />
        )}
      </div>

      {/* Submit / retract */}
      {isEditable && (
        <div className="border-t border-border pt-4">
          <button
            onClick={handleSubmit}
            disabled={isPending || tasks.length === 0}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {phase.status === "rejected" ? "Reenviar a revisión" : "Enviar a revisión"}
          </button>
          {tasks.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">Agrega al menos una tarea para enviar.</p>
          )}
        </div>
      )}

      {phase.status === "submitted" && (
        <div className="border-t border-border pt-4 flex items-center gap-3">
          <span className="text-sm text-amber-600 font-medium">Pendiente de revisión</span>
          <button
            onClick={handleRetract}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Retirar
          </button>
        </div>
      )}

      {/* Review comments timeline */}
      {reviews.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Historial</p>
          {reviews.map((r) => (
            <div key={r.id} className={`flex gap-2.5 text-sm ${r.action === "approve" ? "text-emerald-700" : r.action === "reject" ? "text-destructive" : "text-foreground"}`}>
              {r.action === "approve" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
               r.action === "reject"  ? <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
               <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />}
              <div>
                <span className="font-medium">
                  {(r.reviewer as { full_name?: string } | null)?.full_name ?? "Admin"}
                </span>
                {r.comment && <span className="text-muted-foreground"> — {r.comment}</span>}
                <span className="text-xs text-muted-foreground ml-1">
                  {new Date(r.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task, editable, isPending, startTransition, onDeleted, onUpdated,
}: {
  task: LabPhaseTask
  editable: boolean
  isPending: boolean
  startTransition: (fn: () => void) => void
  onDeleted: () => void
  onUpdated: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)

  function handleSave() {
    if (!title.trim()) return
    const fd = new FormData()
    fd.set("title", title.trim())
    fd.set("description", task.description ?? "")
    startTransition(async () => {
      await updatePhaseTask(task.id, fd)
      onUpdated(title.trim())
      setEditing(false)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deletePhaseTask(task.id)
      onDeleted()
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false) }}
          className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button onClick={handleSave} disabled={isPending} className="text-xs text-primary hover:underline">Guardar</button>
        <button onClick={() => setEditing(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 group">
      <span className="text-muted-foreground text-sm flex-shrink-0">·</span>
      <span className="text-sm flex-1">{task.title}</span>
      {editable && (
        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
          <button onClick={() => setEditing(true)} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={handleDelete} disabled={isPending} className="p-1 rounded text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({
  phaseId, isPending, startTransition, onAdded,
}: {
  phaseId: string
  isPending: boolean
  startTransition: (fn: () => void) => void
  onAdded: (task: LabPhaseTask) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")

  function handleAdd() {
    if (!title.trim()) return
    const fd = new FormData()
    fd.set("title", title.trim())
    fd.set("description", "")
    startTransition(async () => {
      const task = await addPhaseTask(phaseId, fd)
      onAdded(task)
      setTitle("")
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="w-3.5 h-3.5" /> Agregar tarea
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setOpen(false) }}
        placeholder="Título de la tarea…"
        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button onClick={handleAdd} disabled={isPending || !title.trim()} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        Agregar
      </button>
      <button onClick={() => { setOpen(false); setTitle("") }} className="p-1 text-muted-foreground hover:text-foreground">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
