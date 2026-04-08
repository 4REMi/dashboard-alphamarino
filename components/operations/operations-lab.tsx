"use client"

import { useState, useTransition } from "react"
import { ChevronRight, Plus, Trash2, LayoutList, Link2, Pencil, Check, X } from "lucide-react"
import type { ProjectType, PhaseSet, PhaseSetPhase, TaskSet, TaskSetTask, Profile } from "@/lib/types"
import {
  createProjectType,
  updateProjectType,
  deleteProjectType,
  createPhaseSet,
  deletePhaseSet,
  addPhaseToSet,
  deletePhaseFromSet,
  linkPhaseSetToProjectType,
  linkTaskSetToPhase,
  createTaskSet,
  deleteTaskSet,
  addTaskToSet,
  deleteTaskFromSet,
} from "@/lib/actions/config"

interface Props {
  projectTypes: ProjectType[]
  phaseSets: PhaseSet[]
  taskSets: TaskSet[]
  employees: Profile[]
}

const PRIORITY_PILL: Record<string, string> = {
  Low: "bg-gray-100 text-gray-600",
  Medium: "bg-amber-100 text-amber-700",
  High: "bg-red-100 text-red-700",
}
const PRIORITY_LABEL: Record<string, string> = { Low: "Baja", Medium: "Media", High: "Alta" }

// ─── tiny reusable inline input ───────────────────────────────────────────────
function InlineInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded border border-input bg-background px-2 py-1.5 text-sm " +
        "focus:outline-none focus:ring-1 focus:ring-ring " +
        (props.className ?? "")
      }
    />
  )
}

function InlineSelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className={
        "w-full rounded border border-input bg-background px-2 py-1.5 text-sm " +
        "focus:outline-none focus:ring-1 focus:ring-ring " +
        (props.className ?? "")
      }
    />
  )
}

// ─── panel header ──────────────────────────────────────────────────────────────
function PanelHeader({
  title,
  subtitle,
  onAdd,
  onDelete,
}: {
  title: string
  subtitle?: string
  onAdd?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-start justify-between gap-2 flex-shrink-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
        {onDelete && (
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {onAdd && (
          <button
            onClick={onAdd}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── empty state ───────────────────────────────────────────────────────────────
function EmptyPanel({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
      <Icon className="w-8 h-8 text-muted-foreground/25" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

// ─── main component ────────────────────────────────────────────────────────────
export function OperationsLab({ projectTypes: init, phaseSets: initPS, taskSets: initTS, employees }: Props) {
  const [types, setTypes] = useState<ProjectType[]>(init)
  const [phaseSets, setPhaseSets] = useState<PhaseSet[]>(initPS)
  const [taskSets, setTaskSets] = useState<TaskSet[]>(initTS)

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(init[0]?.id ?? null)
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)

  // form open flags
  const [showNewType, setShowNewType] = useState(false)
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null)
  const [showNewPS, setShowNewPS] = useState(false)
  const [showAddPhase, setShowAddPhase] = useState(false)
  const [showNewTS, setShowNewTS] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)

  const [isPending, startTransition] = useTransition()

  // ── derived ──────────────────────────────────────────────────────────────────
  const selectedType = types.find((t) => t.id === selectedTypeId) ?? null
  const linkedPS = selectedType?.default_phase_set_id
    ? phaseSets.find((ps) => ps.id === selectedType.default_phase_set_id) ?? null
    : null
  const phases = (linkedPS?.phases ?? []) as PhaseSetPhase[]
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) ?? null
  const linkedTS = selectedPhase?.default_task_set_id
    ? taskSets.find((ts) => ts.id === selectedPhase.default_task_set_id) ?? null
    : null
  const tasks = (linkedTS?.tasks ?? []) as TaskSetTask[]

  // ── helpers ──────────────────────────────────────────────────────────────────
  function run(fn: () => Promise<void>) {
    startTransition(async () => { try { await fn() } catch { /* show nothing */ } })
  }

  // ── Project Type CRUD ────────────────────────────────────────────────────────
  function handleCreateType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    run(async () => {
      const created = await createProjectType(fd) as ProjectType
      setTypes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedTypeId(created.id)
      setSelectedPhaseId(null)
      setShowNewType(false)
      form.reset()
    })
  }

  function handleUpdateType(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    // preserve existing phase set link
    const type = types.find((t) => t.id === id)
    if (type?.default_phase_set_id) fd.set("default_phase_set_id", type.default_phase_set_id)
    run(async () => {
      const updated = await updateProjectType(id, fd) as ProjectType
      setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)))
      setEditingTypeId(null)
    })
  }

  function handleDeleteType(id: string) {
    if (!confirm("¿Eliminar este tipo de proyecto?")) return
    run(async () => {
      await deleteProjectType(id)
      setTypes((prev) => prev.filter((t) => t.id !== id))
      if (selectedTypeId === id) { setSelectedTypeId(types.find((t) => t.id !== id)?.id ?? null); setSelectedPhaseId(null) }
    })
  }

  function handleLinkPS(psId: string | null) {
    if (!selectedType) return
    run(async () => {
      await linkPhaseSetToProjectType(selectedType.id, psId)
      setTypes((prev) => prev.map((t) => t.id === selectedType.id ? { ...t, default_phase_set_id: psId } : t))
      setSelectedPhaseId(null)
    })
  }

  // ── Phase Set CRUD ───────────────────────────────────────────────────────────
  function handleCreatePS(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    run(async () => {
      const created = await createPhaseSet(fd) as PhaseSet
      const newPS: PhaseSet = { ...created, phases: [] }
      setPhaseSets((prev) => [...prev, newPS].sort((a, b) => a.name.localeCompare(b.name)))
      // auto-link to selected type
      if (selectedType) {
        await linkPhaseSetToProjectType(selectedType.id, created.id)
        setTypes((prev) => prev.map((t) => t.id === selectedType.id ? { ...t, default_phase_set_id: created.id } : t))
      }
      setShowNewPS(false)
      setSelectedPhaseId(null)
      form.reset()
    })
  }

  function handleDeletePS(id: string) {
    if (!confirm("¿Eliminar este phase set y todas sus fases?")) return
    run(async () => {
      await deletePhaseSet(id)
      setPhaseSets((prev) => prev.filter((ps) => ps.id !== id))
      setTypes((prev) => prev.map((t) => t.default_phase_set_id === id ? { ...t, default_phase_set_id: null } : t))
      setSelectedPhaseId(null)
    })
  }

  // ── Phase CRUD ───────────────────────────────────────────────────────────────
  function handleAddPhase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!linkedPS) return
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    run(async () => {
      const created = await addPhaseToSet(linkedPS.id, fd) as PhaseSetPhase
      setPhaseSets((prev) => prev.map((ps) =>
        ps.id === linkedPS.id ? { ...ps, phases: [...(ps.phases ?? []), created] } : ps
      ))
      setShowAddPhase(false)
      form.reset()
    })
  }

  function handleDeletePhase(phaseId: string) {
    if (!confirm("¿Eliminar esta fase?")) return
    if (!linkedPS) return
    run(async () => {
      await deletePhaseFromSet(phaseId)
      setPhaseSets((prev) => prev.map((ps) =>
        ps.id === linkedPS.id ? { ...ps, phases: (ps.phases ?? []).filter((p) => p.id !== phaseId) } : ps
      ))
      if (selectedPhaseId === phaseId) setSelectedPhaseId(null)
    })
  }

  function handleLinkTS(tsId: string | null) {
    if (!selectedPhase || !linkedPS) return
    run(async () => {
      await linkTaskSetToPhase(selectedPhase.id, tsId)
      setPhaseSets((prev) => prev.map((ps) =>
        ps.id === linkedPS.id
          ? { ...ps, phases: (ps.phases ?? []).map((p) => p.id === selectedPhase.id ? { ...p, default_task_set_id: tsId } : p) }
          : ps
      ))
    })
  }

  // ── Task Set CRUD ────────────────────────────────────────────────────────────
  function handleCreateTS(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    run(async () => {
      const created = await createTaskSet(fd) as TaskSet
      const assigneeId = fd.get("default_assignee_id") as string
      const assignee = employees.find((emp) => emp.id === assigneeId) ?? null
      const newTS: TaskSet = { ...created, tasks: [], default_assignee: assignee }
      setTaskSets((prev) => [...prev, newTS].sort((a, b) => a.name.localeCompare(b.name)))
      // auto-link to selected phase
      if (selectedPhase && linkedPS) {
        await linkTaskSetToPhase(selectedPhase.id, created.id)
        setPhaseSets((prev) => prev.map((ps) =>
          ps.id === linkedPS.id
            ? { ...ps, phases: (ps.phases ?? []).map((p) => p.id === selectedPhase.id ? { ...p, default_task_set_id: created.id } : p) }
            : ps
        ))
      }
      setShowNewTS(false)
      form.reset()
    })
  }

  function handleDeleteTS(id: string) {
    if (!confirm("¿Eliminar este task set?")) return
    run(async () => {
      await deleteTaskSet(id)
      setTaskSets((prev) => prev.filter((ts) => ts.id !== id))
      setPhaseSets((prev) => prev.map((ps) => ({
        ...ps,
        phases: (ps.phases ?? []).map((p) => p.default_task_set_id === id ? { ...p, default_task_set_id: null } : p),
      })))
    })
  }

  function handleAddTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!linkedTS) return
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    run(async () => {
      const created = await addTaskToSet(linkedTS.id, fd) as TaskSetTask
      setTaskSets((prev) => prev.map((ts) =>
        ts.id === linkedTS.id ? { ...ts, tasks: [...(ts.tasks ?? []), created] } : ts
      ))
      setShowAddTask(false)
      form.reset()
    })
  }

  function handleDeleteTask(taskId: string) {
    if (!confirm("¿Eliminar esta tarea?")) return
    if (!linkedTS) return
    run(async () => {
      await deleteTaskFromSet(taskId)
      setTaskSets((prev) => prev.map((ts) =>
        ts.id === linkedTS.id ? { ...ts, tasks: (ts.tasks ?? []).filter((t) => t.id !== taskId) } : ts
      ))
    })
  }

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex border border-border rounded-xl overflow-hidden bg-card" style={{ height: "calc(100vh - 160px)", minHeight: 480 }}>

      {/* ── PANEL 1: Project Types ─────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 flex flex-col border-r border-border">
        <PanelHeader
          title="Tipos de Proyecto"
          subtitle={`${types.length} tipos`}
          onAdd={() => { setShowNewType(true); setEditingTypeId(null) }}
        />

        <div className="flex-1 overflow-y-auto">
          {/* new type form */}
          {showNewType && (
            <form onSubmit={handleCreateType} className="p-3 space-y-2 border-b border-border bg-primary/5">
              <InlineInput name="name" required autoFocus placeholder="Nombre…" />
              <InlineInput name="description" placeholder="Descripción (opcional)" />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowNewType(false)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                <button type="submit" disabled={isPending}
                  className="p-1 rounded text-primary hover:text-primary/80 disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
              </div>
            </form>
          )}

          {types.length === 0 && !showNewType && (
            <p className="text-xs text-muted-foreground text-center py-10 px-3">Sin tipos. Usa + para crear.</p>
          )}

          {types.map((type) => {
            const isSelected = type.id === selectedTypeId
            const psName = type.default_phase_set_id
              ? phaseSets.find((ps) => ps.id === type.default_phase_set_id)?.name
              : null

            if (editingTypeId === type.id) {
              return (
                <form key={type.id} onSubmit={(e) => handleUpdateType(type.id, e)}
                  className="p-3 space-y-2 border-b border-border bg-muted/30">
                  <InlineInput name="name" defaultValue={type.name} required autoFocus />
                  <InlineInput name="description" defaultValue={type.description ?? ""} placeholder="Descripción" />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setEditingTypeId(null)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                    <button type="submit" disabled={isPending}
                      className="p-1 rounded text-primary hover:text-primary/80 disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
                  </div>
                </form>
              )
            }

            return (
              <div
                key={type.id}
                onClick={() => { setSelectedTypeId(type.id); setSelectedPhaseId(null) }}
                className={`group flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${
                  isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{type.name}</p>
                  <p className={`text-xs truncate mt-0.5 ${psName ? "text-primary/80" : "text-muted-foreground"}`}>
                    {psName ?? "Sin phase set"}
                  </p>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setEditingTypeId(type.id); setShowNewType(false) }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteType(type.id) }}
                    className="p-1 rounded text-muted-foreground hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── PANEL 2: Phase Set ────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-border">
        <PanelHeader
          title={linkedPS ? linkedPS.name : "Phase Set"}
          subtitle={
            !selectedType ? "Selecciona un tipo"
            : linkedPS ? `${phases.length} fases`
            : "Sin phase set asignado"
          }
          onAdd={linkedPS ? () => setShowAddPhase(true) : undefined}
          onDelete={linkedPS ? () => handleDeletePS(linkedPS.id) : undefined}
        />

        <div className="flex-1 overflow-y-auto">
          {!selectedType && <EmptyPanel icon={LayoutList} text="Selecciona un tipo de proyecto" />}

          {selectedType && !linkedPS && (
            <div className="p-4 space-y-3">
              {phaseSets.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Vincular existente</p>
                  <InlineSelect defaultValue="none" onChange={(e) => e.target.value !== "none" && handleLinkPS(e.target.value)}>
                    <option value="none">Seleccionar phase set…</option>
                    {phaseSets.map((ps) => <option key={ps.id} value={ps.id}>{ps.name}</option>)}
                  </InlineSelect>
                </div>
              )}
              {showNewPS ? (
                <form onSubmit={handleCreatePS} className="space-y-2">
                  <InlineInput name="name" required autoFocus placeholder="Nombre del phase set…" />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowNewPS(false)}
                      className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                    <button type="submit" disabled={isPending}
                      className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
                      Crear y vincular
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setShowNewPS(true)}
                  className="w-full py-2.5 rounded-lg border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors">
                  + Crear nuevo phase set
                </button>
              )}
            </div>
          )}

          {selectedType && linkedPS && (
            <>
              {/* switcher: change which phase set is linked */}
              <div className="px-3 py-2 border-b border-border/50 bg-muted/20">
                <InlineSelect
                  value={linkedPS.id}
                  onChange={(e) => handleLinkPS(e.target.value)}
                  className="text-xs text-muted-foreground"
                >
                  {phaseSets.map((ps) => <option key={ps.id} value={ps.id}>{ps.name}</option>)}
                </InlineSelect>
              </div>

              {/* phases */}
              {phases.map((phase, i) => {
                const isSelPhase = phase.id === selectedPhaseId
                const tsName = phase.default_task_set_id
                  ? taskSets.find((ts) => ts.id === phase.default_task_set_id)?.name
                  : null

                return (
                  <div
                    key={phase.id}
                    onClick={() => setSelectedPhaseId(isSelPhase ? null : phase.id)}
                    className={`group flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${
                      isSelPhase ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{phase.name}</p>
                      <p className={`text-xs truncate mt-0.5 ${tsName ? "text-primary/80" : "text-muted-foreground"}`}>
                        {tsName ?? "Sin task set"}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePhase(phase.id) }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {isSelPhase && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                  </div>
                )
              })}

              {phases.length === 0 && !showAddPhase && (
                <p className="text-xs text-muted-foreground text-center py-6">Sin fases. Usa + para agregar.</p>
              )}

              {/* add phase form */}
              {showAddPhase && (
                <form onSubmit={handleAddPhase} className="px-3 py-3 space-y-2 bg-muted/20 border-t border-border">
                  <InlineInput name="name" required autoFocus placeholder="Nombre de la fase…" />
                  <InlineInput name="description" placeholder="Descripción (opcional)" />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowAddPhase(false)}
                      className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                    <button type="submit" disabled={isPending}
                      className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
                      Agregar
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── PANEL 3: Task Set ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <PanelHeader
          title={linkedTS ? linkedTS.name : "Task Set"}
          subtitle={
            !selectedPhase ? "Selecciona una fase"
            : linkedTS ? `${tasks.length} tareas plantilla`
            : "Sin task set vinculado"
          }
          onAdd={linkedTS ? () => setShowAddTask(true) : undefined}
          onDelete={linkedTS ? () => handleDeleteTS(linkedTS.id) : undefined}
        />

        <div className="flex-1 overflow-y-auto">
          {!selectedPhase && <EmptyPanel icon={Link2} text="Selecciona una fase" />}

          {selectedPhase && !linkedTS && (
            <div className="p-4 space-y-3">
              {taskSets.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Vincular existente</p>
                  <InlineSelect defaultValue="none" onChange={(e) => e.target.value !== "none" && handleLinkTS(e.target.value)}>
                    <option value="none">Seleccionar task set…</option>
                    {taskSets.map((ts) => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
                  </InlineSelect>
                </div>
              )}
              {showNewTS ? (
                <form onSubmit={handleCreateTS} className="space-y-2">
                  <InlineInput name="name" required autoFocus placeholder="Nombre del task set…" />
                  <InlineSelect name="default_assignee_id" defaultValue="none">
                    <option value="none">Sin asignar por defecto</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                  </InlineSelect>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowNewTS(false)}
                      className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                    <button type="submit" disabled={isPending}
                      className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
                      Crear y vincular
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setShowNewTS(true)}
                  className="w-full py-2.5 rounded-lg border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors">
                  + Crear nuevo task set
                </button>
              )}
            </div>
          )}

          {selectedPhase && linkedTS && (
            <>
              {/* switcher */}
              <div className="px-3 py-2 border-b border-border/50 bg-muted/20">
                <InlineSelect
                  value={linkedTS.id}
                  onChange={(e) => handleLinkTS(e.target.value)}
                  className="text-xs text-muted-foreground"
                >
                  {taskSets.map((ts) => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
                </InlineSelect>
              </div>

              {/* tasks */}
              {tasks.map((task, i) => (
                <div key={task.id}
                  className="group flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
                    )}
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${PRIORITY_PILL[task.priority]}`}>
                    {PRIORITY_LABEL[task.priority]}
                  </span>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {tasks.length === 0 && !showAddTask && (
                <p className="text-xs text-muted-foreground text-center py-6">Sin tareas. Usa + para agregar.</p>
              )}

              {/* add task form */}
              {showAddTask && (
                <form onSubmit={handleAddTask} className="px-4 py-3 space-y-2 bg-muted/20 border-t border-border">
                  <InlineInput name="title" required autoFocus placeholder="Título de la tarea…" />
                  <div className="grid grid-cols-2 gap-2">
                    <InlineInput name="description" placeholder="Descripción (opcional)" />
                    <InlineSelect name="priority" defaultValue="Medium">
                      <option value="Low">Baja</option>
                      <option value="Medium">Media</option>
                      <option value="High">Alta</option>
                    </InlineSelect>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowAddTask(false)}
                      className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                    <button type="submit" disabled={isPending}
                      className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
                      Agregar
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
