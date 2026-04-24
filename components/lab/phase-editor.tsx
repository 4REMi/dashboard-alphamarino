"use client"

import { useState, useTransition } from "react"
import type { LabPhase, LabPhaseTask, LabPhaseTaskChecklistItem, Sop } from "@/lib/types"
import {
  createPhase, updatePhase, deletePhase, submitPhase, retractPhase,
  addPhaseTask, updatePhaseTask, deletePhaseTask,
  addTaskChecklistItem, updateTaskChecklistItem, deleteTaskChecklistItem,
} from "@/lib/actions/lab"
import {
  Plus, Trash2, Pencil, CheckCircle2, XCircle, MessageSquare,
  Send, RotateCcw, X, ChevronDown, BookOpen, Package,
} from "lucide-react"

interface Props {
  initialPhases: LabPhase[]
  sops: Sop[]
}

export function PhaseEditor({ initialPhases, sops }: Props) {
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
    draft: "Borrador", submitted: "En revisión", approved: "Aprobada", rejected: "Rechazada",
  }
  const statusColor: Record<LabPhase["status"], string> = {
    draft: "text-muted-foreground", submitted: "text-amber-600",
    approved: "text-emerald-600",  rejected: "text-destructive",
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* Left: list */}
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
            sops={sops}
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
  phase, sops, isPending, startTransition, onUpdated, onDeleted,
}: {
  phase: LabPhase
  sops: Sop[]
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

  function onTaskUpdated(id: string, patch: Partial<LabPhaseTask>) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t))
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
                <button onClick={handleSaveHeader} disabled={isPending} className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Guardar</button>
                <button onClick={() => setEditing(false)} className="text-xs px-2 py-1.5 text-muted-foreground hover:text-foreground">Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{phase.name}</h2>
              {phase.description && <p className="text-sm text-muted-foreground mt-0.5">{phase.description}</p>}
            </>
          )}
        </div>
        {isEditable && !editing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={handleDelete} disabled={isPending} className="p-1.5 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
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
        {tasks.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas aún.</p>}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            sops={sops}
            editable={isEditable}
            isPending={isPending}
            startTransition={startTransition}
            onDeleted={() => onTaskDeleted(t.id)}
            onUpdated={(patch) => onTaskUpdated(t.id, patch)}
          />
        ))}
        {isEditable && (
          <AddTaskForm
            phaseId={phase.id}
            sops={sops}
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
          {tasks.length === 0 && <p className="text-xs text-muted-foreground mt-1">Agrega al menos una tarea para enviar.</p>}
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

      {/* Review history */}
      {reviews.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Historial</p>
          {reviews.map((r) => (
            <div key={r.id} className={`flex gap-2.5 text-sm ${r.action === "approve" ? "text-emerald-700" : r.action === "reject" ? "text-destructive" : "text-foreground"}`}>
              {r.action === "approve" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
               r.action === "reject"  ? <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> :
               <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />}
              <div>
                <span className="font-medium">{(r.reviewer as { full_name?: string } | null)?.full_name ?? "Admin"}</span>
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
  task, sops, editable, isPending, startTransition, onDeleted, onUpdated,
}: {
  task: LabPhaseTask
  sops: Sop[]
  editable: boolean
  isPending: boolean
  startTransition: (fn: () => void) => void
  onDeleted: () => void
  onUpdated: (patch: Partial<LabPhaseTask>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [desc, setDesc] = useState(task.description ?? "")
  const [reqDel, setReqDel] = useState(task.requires_deliverable)
  const [sopId, setSopId] = useState(task.sop_id ?? "")
  const checklist = task.checklist_items ?? []

  function handleSave() {
    if (!title.trim()) return
    const fd = new FormData()
    fd.set("title", title.trim())
    fd.set("description", desc.trim())
    fd.set("requires_deliverable", String(reqDel))
    fd.set("sop_id", sopId)
    startTransition(async () => {
      await updatePhaseTask(task.id, fd)
      const sopObj = sops.find((s) => s.id === sopId) ?? null
      onUpdated({ title: title.trim(), description: desc.trim() || null, requires_deliverable: reqDel, sop_id: sopId || null, sop: sopObj ? { id: sopObj.id, title: sopObj.title } : null })
      setEditing(false)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deletePhaseTask(task.id)
      onDeleted()
    })
  }

  function onChecklistAdded(item: LabPhaseTaskChecklistItem) {
    onUpdated({ checklist_items: [...checklist, item] })
  }

  function onChecklistDeleted(id: string) {
    onUpdated({ checklist_items: checklist.filter((i) => i.id !== id) })
  }

  function onChecklistUpdated(id: string, text: string, isBlocking: boolean) {
    onUpdated({ checklist_items: checklist.map((i) => i.id === id ? { ...i, text, is_blocking: isBlocking } : i) })
  }

  const sopName = task.sop?.title ?? sops.find((s) => s.id === task.sop_id)?.title ?? null

  if (editing) {
    return (
      <div className="rounded-lg border border-border p-3 space-y-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Descripción (opcional)"
          rows={2}
          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={reqDel}
              onChange={(e) => setReqDel(e.target.checked)}
              className="rounded"
            />
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            Requiere entregable
          </label>
          {sops.length > 0 && (
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <select
                value={sopId}
                onChange={(e) => setSopId(e.target.value)}
                className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Sin SOP</option>
                {sops.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={isPending || !title.trim()} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Guardar</button>
          <button onClick={() => setEditing(false)} className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground">Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 px-3 py-2 group">
        {(editable || checklist.length > 0) && (
          <button onClick={() => setExpanded(!expanded)} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`} />
          </button>
        )}
        <span className="text-sm flex-1 truncate">{task.title}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {task.requires_deliverable && (
            <span title="Requiere entregable" className="text-primary/70">
              <Package className="w-3.5 h-3.5" />
            </span>
          )}
          {sopName && (
            <span title={`SOP: ${sopName}`} className="text-blue-500">
              <BookOpen className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
        {editable && (
          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
            <button onClick={() => setEditing(true)} className="p-1 rounded text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
            <button onClick={handleDelete} disabled={isPending} className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1.5">
          {task.description && (
            <p className="text-xs text-muted-foreground mb-2">{task.description}</p>
          )}
          {sopName && (
            <p className="text-xs text-blue-600 flex items-center gap-1 mb-2">
              <BookOpen className="w-3 h-3" /> SOP vinculado: <span className="font-medium">{sopName}</span>
            </p>
          )}
          {checklist.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              editable={editable}
              isPending={isPending}
              startTransition={startTransition}
              onDeleted={() => onChecklistDeleted(item.id)}
              onUpdated={(text, isBlocking) => onChecklistUpdated(item.id, text, isBlocking)}
            />
          ))}
          {editable && (
            <AddChecklistItemForm
              taskId={task.id}
              isPending={isPending}
              startTransition={startTransition}
              onAdded={onChecklistAdded}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Checklist item row ────────────────────────────────────────────────────────

function ChecklistItemRow({
  item, editable, isPending, startTransition, onDeleted, onUpdated,
}: {
  item: LabPhaseTaskChecklistItem
  editable: boolean
  isPending: boolean
  startTransition: (fn: () => void) => void
  onDeleted: () => void
  onUpdated: (text: string, isBlocking: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const [isBlocking, setIsBlocking] = useState(item.is_blocking)

  function handleSave() {
    if (!text.trim()) return
    startTransition(async () => {
      await updateTaskChecklistItem(item.id, text.trim(), isBlocking)
      onUpdated(text.trim(), isBlocking)
      setEditing(false)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteTaskChecklistItem(item.id)
      onDeleted()
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false) }}
          className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={isBlocking} onChange={(e) => setIsBlocking(e.target.checked)} className="rounded" />
          Bloqueante
        </label>
        <button onClick={handleSave} disabled={isPending} className="text-xs text-primary hover:underline">OK</button>
        <button onClick={() => setEditing(false)} className="p-0.5 text-muted-foreground"><X className="w-3 h-3" /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 group">
      <span className="w-3 h-3 rounded-sm border border-muted-foreground/40 flex-shrink-0" />
      <span className={`text-xs flex-1 ${item.is_blocking ? "font-medium" : ""}`}>{item.text}</span>
      {item.is_blocking && <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1 py-0.5 rounded">bloqueante</span>}
      {editable && (
        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
          <button onClick={() => setEditing(true)} className="p-0.5 text-muted-foreground hover:text-foreground"><Pencil className="w-2.5 h-2.5" /></button>
          <button onClick={handleDelete} disabled={isPending} className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-2.5 h-2.5" /></button>
        </div>
      )}
    </div>
  )
}

// ── Add checklist item form ───────────────────────────────────────────────────

function AddChecklistItemForm({
  taskId, isPending, startTransition, onAdded,
}: {
  taskId: string
  isPending: boolean
  startTransition: (fn: () => void) => void
  onAdded: (item: LabPhaseTaskChecklistItem) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [isBlocking, setIsBlocking] = useState(false)

  function handleAdd() {
    if (!text.trim()) return
    startTransition(async () => {
      const item = await addTaskChecklistItem(taskId, text.trim(), isBlocking)
      onAdded(item)
      setText("")
      setIsBlocking(false)
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-0.5">
        <Plus className="w-3 h-3" /> Agregar paso
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setOpen(false) }}
        placeholder="Paso del checklist…"
        className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
        <input type="checkbox" checked={isBlocking} onChange={(e) => setIsBlocking(e.target.checked)} className="rounded" />
        Bloqueante
      </label>
      <button onClick={handleAdd} disabled={isPending || !text.trim()} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">+</button>
      <button onClick={() => { setOpen(false); setText("") }} className="p-0.5 text-muted-foreground"><X className="w-3 h-3" /></button>
    </div>
  )
}

// ── Add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({
  phaseId, sops, isPending, startTransition, onAdded,
}: {
  phaseId: string
  sops: Sop[]
  isPending: boolean
  startTransition: (fn: () => void) => void
  onAdded: (task: LabPhaseTask) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [reqDel, setReqDel] = useState(false)
  const [sopId, setSopId] = useState("")

  function handleAdd() {
    if (!title.trim()) return
    const fd = new FormData()
    fd.set("title", title.trim())
    fd.set("description", "")
    fd.set("requires_deliverable", String(reqDel))
    fd.set("sop_id", sopId)
    startTransition(async () => {
      const task = await addPhaseTask(phaseId, fd)
      onAdded(task)
      setTitle("")
      setReqDel(false)
      setSopId("")
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1">
        <Plus className="w-3.5 h-3.5" /> Agregar tarea
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-3 space-y-2 mt-1">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false) }}
        placeholder="Título de la tarea…"
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
          <input type="checkbox" checked={reqDel} onChange={(e) => setReqDel(e.target.checked)} className="rounded" />
          <Package className="w-3 h-3 text-muted-foreground" />
          Requiere entregable
        </label>
        {sops.length > 0 && (
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <select
              value={sopId}
              onChange={(e) => setSopId(e.target.value)}
              className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Sin SOP</option>
              {sops.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={isPending || !title.trim()} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Agregar</button>
        <button onClick={() => { setOpen(false); setTitle(""); setReqDel(false); setSopId("") }} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}
