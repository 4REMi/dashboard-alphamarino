"use client"

import { useState, useTransition } from "react"
import type { LabProposal, LabProposalPhase, LabProposalTask } from "@/lib/types"
import {
  createProposal, updateProposal, deleteProposal, submitProposal, retractProposal,
  addProposalPhase, updateProposalPhase, deleteProposalPhase,
  addProposalTask, updateProposalTask, deleteProposalTask,
} from "@/lib/actions/lab"
import { Plus, ChevronDown, Pencil, Trash2, Check, X, Send, RotateCcw } from "lucide-react"

interface Props {
  initialProposals: LabProposal[]
}

export function ProposalEditor({ initialProposals }: Props) {
  const [proposals, setProposals] = useState<LabProposal[]>(initialProposals)
  const [selectedId, setSelectedId] = useState<string | null>(proposals[0]?.id ?? null)
  const [showNew, setShowNew] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const selected = proposals.find((p) => p.id === selectedId) ?? null

  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try { await fn() } catch (e) { setError(e instanceof Error ? e.message : "Error") }
    })
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    run(async () => {
      const created = await createProposal(fd)
      setProposals((prev) => [created, ...prev])
      setSelectedId(created.id)
      setShowNew(false)
      form.reset()
    })
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta propuesta?")) return
    run(async () => {
      await deleteProposal(id)
      setProposals((prev) => prev.filter((p) => p.id !== id))
      if (selectedId === id) setSelectedId(proposals.find((p) => p.id !== id)?.id ?? null)
    })
  }

  function handleSubmit(id: string) {
    if (!confirm("¿Enviar esta propuesta para revisión? Ya no podrás editarla hasta recibir feedback.")) return
    run(async () => {
      await submitProposal(id)
      setProposals((prev) => prev.map((p) => p.id === id ? { ...p, status: "submitted" } : p))
    })
  }

  function handleRetract(id: string) {
    run(async () => {
      await retractProposal(id)
      setProposals((prev) => prev.map((p) => p.id === id ? { ...p, status: "draft" } : p))
    })
  }

  return (
    <div className="flex gap-4 h-full min-h-[500px]">
      {/* Sidebar — proposal list */}
      <div className="w-56 flex-shrink-0 space-y-2">
        <button
          onClick={() => setShowNew(true)}
          className="w-full py-2 rounded-lg border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors"
        >
          + Nueva propuesta
        </button>

        {showNew && (
          <form onSubmit={handleCreate} className="rounded-lg border border-border p-3 space-y-2">
            <input
              name="title"
              required
              autoFocus
              placeholder="Título de la propuesta"
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-1.5">
              <button type="submit" disabled={isPending} className="flex-1 text-xs py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50">
                Crear
              </button>
              <button type="button" onClick={() => setShowNew(false)} className="text-xs px-2 py-1.5 rounded border border-border text-muted-foreground">
                ✕
              </button>
            </div>
          </form>
        )}

        <div className="space-y-1">
          {proposals.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${selectedId === p.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"}`}
            >
              <div className="truncate">{p.title}</div>
              <StatusBadge status={p.status} />
            </button>
          ))}
          {proposals.length === 0 && !showNew && (
            <p className="text-xs text-muted-foreground text-center py-4">Sin propuestas aún.</p>
          )}
        </div>
      </div>

      {/* Main — proposal detail */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Selecciona o crea una propuesta.
          </div>
        ) : (
          <ProposalDetail
            key={selected.id}
            proposal={selected}
            isPending={isPending}
            onUpdate={(updated) => setProposals((prev) => prev.map((p) => p.id === updated.id ? updated : p))}
            onDelete={() => handleDelete(selected.id)}
            onSubmit={() => handleSubmit(selected.id)}
            onRetract={() => handleRetract(selected.id)}
            run={run}
          />
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:     { label: "Borrador",  cls: "text-muted-foreground" },
    submitted: { label: "Enviada",   cls: "text-amber-600" },
    approved:  { label: "Aprobada",  cls: "text-emerald-600" },
    rejected:  { label: "Rechazada", cls: "text-destructive" },
  }
  const cfg = map[status] ?? map.draft
  return <span className={`text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>
}

// ── Proposal detail ───────────────────────────────────────────────────────────

function ProposalDetail({
  proposal, isPending, onUpdate, onDelete, onSubmit, onRetract, run,
}: {
  proposal: LabProposal
  isPending: boolean
  onUpdate: (p: LabProposal) => void
  onDelete: () => void
  onSubmit: () => void
  onRetract: () => void
  run: (fn: () => Promise<void>) => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(proposal.title)
  const [descVal, setDescVal] = useState(proposal.description ?? "")
  const [showAddPhase, setShowAddPhase] = useState(false)
  const [showAddLooseTask, setShowAddLooseTask] = useState(false)

  const isEditable = proposal.status === "draft" || proposal.status === "rejected"

  function saveTitle() {
    if (!titleVal.trim() || titleVal === proposal.title) { setEditingTitle(false); return }
    const fd = new FormData()
    fd.set("title", titleVal)
    fd.set("description", descVal)
    run(async () => {
      await updateProposal(proposal.id, fd)
      onUpdate({ ...proposal, title: titleVal, description: descVal || null })
      setEditingTitle(false)
    })
  }

  function handleAddPhase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    e.currentTarget.reset()
    run(async () => {
      const phase = await addProposalPhase(proposal.id, fd)
      onUpdate({ ...proposal, phases: [...(proposal.phases ?? []), phase] })
      setShowAddPhase(false)
    })
  }

  function handleDeletePhase(phaseId: string) {
    if (!confirm("¿Eliminar esta fase y sus tareas?")) return
    run(async () => {
      await deleteProposalPhase(phaseId)
      onUpdate({ ...proposal, phases: (proposal.phases ?? []).filter((p) => p.id !== phaseId) })
    })
  }

  function handleAddLooseTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    e.currentTarget.reset()
    run(async () => {
      const task = await addProposalTask(proposal.id, null, fd)
      onUpdate({ ...proposal, loose_tasks: [...(proposal.loose_tasks ?? []), task] })
      setShowAddLooseTask(false)
    })
  }

  function handleDeleteTask(taskId: string, phaseId: string | null) {
    run(async () => {
      await deleteProposalTask(taskId)
      if (phaseId) {
        onUpdate({ ...proposal, phases: (proposal.phases ?? []).map((ph) =>
          ph.id === phaseId ? { ...ph, tasks: (ph.tasks ?? []).filter((t) => t.id !== taskId) } : ph
        )})
      } else {
        onUpdate({ ...proposal, loose_tasks: (proposal.loose_tasks ?? []).filter((t) => t.id !== taskId) })
      }
    })
  }

  function handleAddTaskToPhase(phaseId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    e.currentTarget.reset()
    run(async () => {
      const task = await addProposalTask(proposal.id, phaseId, fd)
      onUpdate({ ...proposal, phases: (proposal.phases ?? []).map((ph) =>
        ph.id === phaseId ? { ...ph, tasks: [...(ph.tasks ?? []), task] } : ph
      )})
    })
  }

  const reviews = proposal.reviews ?? []
  const lastReview = [...reviews].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={titleVal}
                onChange={(e) => setTitleVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false) }}
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <textarea
                value={descVal}
                onChange={(e) => setDescVal(e.target.value)}
                placeholder="Descripción (opcional)"
                rows={2}
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <div className="flex gap-2">
                <button onClick={saveTitle} disabled={isPending} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50">
                  <Check className="w-3 h-3" /> Guardar
                </button>
                <button onClick={() => setEditingTitle(false)} className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{proposal.title}</h2>
                <StatusBadge status={proposal.status} />
                {isEditable && (
                  <button onClick={() => setEditingTitle(true)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {proposal.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{proposal.description}</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditable && (
            <button
              onClick={onSubmit}
              disabled={isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send className="w-3 h-3" /> Enviar
            </button>
          )}
          {proposal.status === "submitted" && (
            <button
              onClick={onRetract}
              disabled={isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Retirar
            </button>
          )}
          {isEditable && (
            <button onClick={onDelete} disabled={isPending} className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Last review feedback */}
      {lastReview && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${
          lastReview.action === "approve" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          lastReview.action === "reject"  ? "bg-red-50 border-red-200 text-red-800" :
          "bg-muted border-border text-foreground"
        }`}>
          <span className="font-medium">
            {lastReview.action === "approve" ? "✓ Aprobada" : lastReview.action === "reject" ? "✗ Rechazada" : "💬 Comentario"}
            {" "}por {(lastReview.reviewer as { full_name?: string } | null)?.full_name ?? "Admin"}
          </span>
          {lastReview.comment && <p className="mt-0.5 opacity-90">{lastReview.comment}</p>}
        </div>
      )}

      {/* Phases */}
      <div className="space-y-3">
        {(proposal.phases ?? []).map((phase) => (
          <PhaseSection
            key={phase.id}
            phase={phase}
            proposalId={proposal.id}
            isEditable={isEditable}
            isPending={isPending}
            onDeletePhase={() => handleDeletePhase(phase.id)}
            onDeleteTask={(taskId) => handleDeleteTask(taskId, phase.id)}
            onAddTask={(e) => handleAddTaskToPhase(phase.id, e)}
            onUpdatePhase={(updated) => onUpdate({ ...proposal, phases: (proposal.phases ?? []).map((p) => p.id === phase.id ? updated : p) })}
            onUpdateTask={(taskId, updated) => onUpdate({ ...proposal, phases: (proposal.phases ?? []).map((ph) =>
              ph.id === phase.id ? { ...ph, tasks: (ph.tasks ?? []).map((t) => t.id === taskId ? updated : t) } : ph
            )})}
            run={run}
          />
        ))}

        {/* Loose tasks */}
        {((proposal.loose_tasks ?? []).length > 0 || showAddLooseTask) && (
          <div className="rounded-xl border border-border bg-card">
            <div className="px-4 py-2.5 border-b border-border">
              <p className="text-sm font-medium text-muted-foreground">Tareas sin fase</p>
            </div>
            {(proposal.loose_tasks ?? []).map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isEditable={isEditable}
                isPending={isPending}
                onDelete={() => handleDeleteTask(task.id, null)}
                onUpdate={(updated) => onUpdate({ ...proposal, loose_tasks: (proposal.loose_tasks ?? []).map((t) => t.id === task.id ? updated : t) })}
                run={run}
              />
            ))}
            {isEditable && showAddLooseTask && (
              <AddTaskForm onSubmit={handleAddLooseTask} onCancel={() => setShowAddLooseTask(false)} isPending={isPending} />
            )}
          </div>
        )}

        {/* Add buttons */}
        {isEditable && (
          <div className="flex gap-2">
            {showAddPhase ? (
              <form onSubmit={handleAddPhase} className="flex-1 flex gap-2 items-end rounded-lg border border-border p-3">
                <div className="flex-1">
                  <input
                    name="name"
                    required
                    autoFocus
                    placeholder="Nombre de la fase"
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <button type="submit" disabled={isPending} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50">
                  Agregar
                </button>
                <button type="button" onClick={() => setShowAddPhase(false)} className="text-xs px-2 py-1.5 text-muted-foreground">✕</button>
              </form>
            ) : (
              <button
                onClick={() => setShowAddPhase(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar fase
              </button>
            )}
            {!showAddLooseTask && (
              <button
                onClick={() => setShowAddLooseTask(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Tarea suelta
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Phase section ─────────────────────────────────────────────────────────────

function PhaseSection({
  phase, proposalId, isEditable, isPending,
  onDeletePhase, onDeleteTask, onAddTask, onUpdatePhase, onUpdateTask, run,
}: {
  phase: LabProposalPhase
  proposalId: string
  isEditable: boolean
  isPending: boolean
  onDeletePhase: () => void
  onDeleteTask: (id: string) => void
  onAddTask: (e: React.FormEvent<HTMLFormElement>) => void
  onUpdatePhase: (updated: LabProposalPhase) => void
  onUpdateTask: (taskId: string, updated: LabProposalTask) => void
  run: (fn: () => Promise<void>) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(phase.name)
  const [showAddTask, setShowAddTask] = useState(false)

  function saveName() {
    if (!nameVal.trim() || nameVal === phase.name) { setEditingName(false); return }
    const fd = new FormData(); fd.set("name", nameVal)
    run(async () => {
      await updateProposalPhase(phase.id, fd)
      onUpdatePhase({ ...phase, name: nameVal })
      setEditingName(false)
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <button onClick={() => setCollapsed(!collapsed)} className="p-0.5 text-muted-foreground">
          <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </button>
        {editingName ? (
          <>
            <input
              autoFocus
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false) }}
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button onClick={saveName} className="p-1 rounded text-primary"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditingName(false)} className="p-1 rounded text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm font-medium">{phase.name}</span>
            <span className="text-xs text-muted-foreground">{(phase.tasks ?? []).length} tareas</span>
            {isEditable && (
              <>
                <button onClick={() => setEditingName(true)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={onDeletePhase} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {!collapsed && (
        <>
          {(phase.tasks ?? []).map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isEditable={isEditable}
              isPending={isPending}
              onDelete={() => onDeleteTask(task.id)}
              onUpdate={(updated) => onUpdateTask(task.id, updated)}
              run={run}
            />
          ))}
          {isEditable && (
            showAddTask ? (
              <AddTaskForm onSubmit={(e) => { onAddTask(e); setShowAddTask(false) }} onCancel={() => setShowAddTask(false)} isPending={isPending} />
            ) : (
              <button
                onClick={() => setShowAddTask(true)}
                className="w-full px-4 py-2 text-left text-xs text-primary hover:bg-primary/5 transition-colors"
              >
                + Agregar tarea
              </button>
            )
          )}
        </>
      )}
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task, isEditable, isPending, onDelete, onUpdate, run,
}: {
  task: LabProposalTask
  isEditable: boolean
  isPending: boolean
  onDelete: () => void
  onUpdate: (updated: LabProposalTask) => void
  run: (fn: () => Promise<void>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [titleVal, setTitleVal] = useState(task.title)
  const [descVal, setDescVal] = useState(task.description ?? "")

  function save() {
    if (!titleVal.trim()) return
    const fd = new FormData(); fd.set("title", titleVal); fd.set("description", descVal)
    run(async () => {
      await updateProposalTask(task.id, fd)
      onUpdate({ ...task, title: titleVal, description: descVal || null })
      setEditing(false)
    })
  }

  return (
    <div className="group flex items-start gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-2 flex-shrink-0" />
      {editing ? (
        <div className="flex-1 space-y-1.5">
          <input
            autoFocus
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }}
            className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            value={descVal}
            onChange={(e) => setDescVal(e.target.value)}
            placeholder="Descripción (opcional)"
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex gap-1.5">
            <button onClick={save} disabled={isPending} className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">Guardar</button>
            <button onClick={() => setEditing(false)} className="text-xs px-2 py-1 text-muted-foreground">Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-sm">{task.title}</p>
            {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
          </div>
          {isEditable && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button onClick={() => setEditing(true)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                <Pencil className="w-3 h-3" />
              </button>
              <button onClick={onDelete} disabled={isPending} className="p-1 rounded text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({ onSubmit, onCancel, isPending }: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="px-4 py-2.5 flex gap-2 items-center border-t border-border/50 bg-muted/20">
      <input
        name="title"
        required
        autoFocus
        placeholder="Título de la tarea…"
        className="flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button type="submit" disabled={isPending} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50">
        Agregar
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
    </form>
  )
}
