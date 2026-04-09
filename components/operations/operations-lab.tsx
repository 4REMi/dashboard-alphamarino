"use client"

import { useState, useTransition, useRef } from "react"
import { ChevronRight, Plus, Trash2, LayoutList, Link2, Pencil, Check, X, Upload, Download, Paperclip, GripVertical } from "lucide-react"
import type { ProjectType, PhaseSet, PhaseSetPhase, TaskSet, TaskSetTask, Profile } from "@/lib/types"
import { PROJECT_TYPE_ICONS, getProjectTypeIcon } from "@/lib/project-type-icons"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
// TaskPriority intentionally removed — tasks now use is_urgent boolean
import {
  createProjectType, updateProjectType, deleteProjectType,
  createPhaseSet, deletePhaseSet, addPhaseToSet, deletePhaseFromSet,
  linkPhaseSetToProjectType, linkTaskSetToPhase,
  createTaskSet, updateTaskSet, deleteTaskSet, addTaskToSet, updateTaskInSet, deleteTaskFromSet,
  reorderTasksInSet,
  importOperationsTemplate,
} from "@/lib/actions/config"

interface Props {
  projectTypes: ProjectType[]
  phaseSets: PhaseSet[]
  taskSets: TaskSet[]
  employees: Profile[]
}


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
  const { children, ...rest } = props
  return (
    <select
      {...rest}
      className={
        "w-full rounded border border-input bg-background px-2 py-1.5 text-sm " +
        "focus:outline-none focus:ring-1 focus:ring-ring " +
        (rest.className ?? "")
      }
    >
      {children}
    </select>
  )
}

const TYPE_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#06b6d4", // cyan
  "#f97316", // orange
  "#6366f1", // indigo
  "#ec4899", // pink
  "#14b8a6", // teal
  "#84cc16", // lime
  "#ef4444", // red
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Color de etiqueta</p>
      <div className="flex flex-wrap gap-1.5">
        {TYPE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(value === c ? "" : c)}
            className="w-5 h-5 rounded-full border-2 transition-all flex-shrink-0"
            style={{
              backgroundColor: c,
              borderColor: value === c ? "#000" : "transparent",
              outline: value === c ? `2px solid ${c}` : "none",
              outlineOffset: "2px",
            }}
          />
        ))}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            title="Sin color"
            className="w-5 h-5 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground text-[9px]"
          >
            ✕
          </button>
        )}
      </div>
      {/* hidden input so FormData picks up the value */}
      <input type="hidden" name="color" value={value} />
    </div>
  )
}

function IconPicker({ value, onChange, activeColor }: { value: string; onChange: (v: string) => void; activeColor?: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Ícono</p>
      <div className="flex flex-wrap gap-1">
        {PROJECT_TYPE_ICONS.map(({ name, icon: Icon, label }) => {
          const isSelected = value === name
          return (
            <button
              key={name}
              type="button"
              title={label}
              onClick={() => onChange(isSelected ? "" : name)}
              className="w-7 h-7 rounded flex items-center justify-center transition-all border"
              style={isSelected && activeColor
                ? { backgroundColor: activeColor + "22", borderColor: activeColor + "66", color: activeColor }
                : isSelected
                ? { backgroundColor: "var(--primary)", borderColor: "transparent", color: "white" }
                : { backgroundColor: "transparent", borderColor: "transparent", color: "var(--muted-foreground)" }
              }
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          )
        })}
      </div>
      <input type="hidden" name="icon" value={value} />
    </div>
  )
}

function PanelHeader({
  title, subtitle, onAdd, onDelete,
}: {
  title: string; subtitle?: string; onAdd?: () => void; onDelete?: () => void
}) {
  return (
    <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-start justify-between gap-2 flex-shrink-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
        {onDelete && (
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {onAdd && (
          <button onClick={onAdd} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyPanel({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
      <Icon className="w-8 h-8 text-muted-foreground/25" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

// ── Import modal ──────────────────────────────────────────────────────────────
function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (json: string) => Promise<void>
}) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setText(ev.target?.result as string)
    reader.readAsText(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) { setError("Pega o carga un JSON primero"); return }
    setError(null)
    setLoading(true)
    try {
      await onImport(text.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar")
    } finally {
      setLoading(false)
    }
  }

  const example = JSON.stringify({
    projectType: { name: "Paid Media", description: "Campañas digitales" },
    phaseSet: {
      name: "Sprint Paid Media",
      phases: [
        {
          name: "Discovery",
          description: "Auditoría inicial",
          taskSet: {
            name: "Tareas Discovery",
            tasks: [
              { title: "Reunión con cliente", is_urgent: true, requires_deliverable: false },
              { title: "Brief del cliente", is_urgent: false, requires_deliverable: true },
            ],
          },
        },
        { name: "Setup", description: "Configuración de cuentas", taskSet: null },
      ],
    },
  }, null, 2)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Importar plantilla</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">JSON</label>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" /> Cargar archivo .json
                </button>
                <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFile} />
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder={example}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
            )}

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors">Ver estructura esperada</summary>
              <pre className="mt-2 bg-muted rounded-md p-3 overflow-x-auto text-xs leading-relaxed">{example}</pre>
            </details>
          </div>

          <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {loading ? "Importando…" : "Importar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Sortable task row ─────────────────────────────────────────────────────────
function SortableTaskRow({
  task,
  index,
  onEdit,
  onDelete,
}: {
  task: TaskSetTask
  index: number
  onEdit: (task: TaskSetTask) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 px-3 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors bg-card"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        tabIndex={-1}
        className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors flex-shrink-0 touch-none"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">{index + 1}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{task.title}</p>
        {task.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>}
      </div>

      {task.requires_deliverable && (
        <Paperclip className="w-3.5 h-3.5 text-info flex-shrink-0" />
      )}
      {task.is_urgent && (
        <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-destructive/10 text-destructive">Urgente</span>
      )}
      <button
        onClick={() => onEdit(task)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── Edit task modal ───────────────────────────────────────────────────────────
function EditTaskModal({
  task,
  isPending,
  onClose,
  onSubmit,
}: {
  task: TaskSetTask
  isPending: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">Editar tarea</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título *</label>
            <InlineInput name="title" required defaultValue={task.title} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descripción</label>
            <textarea
              name="description"
              rows={4}
              defaultValue={task.description ?? ""}
              placeholder="Descripción detallada de la tarea…"
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 px-3 py-2 rounded border border-input bg-background text-sm cursor-pointer select-none flex-1">
              <input type="checkbox" name="is_urgent" value="true" defaultChecked={task.is_urgent} className="accent-destructive" />
              Urgente
            </label>
            <label className="flex items-center gap-2 px-3 py-2 rounded border border-input bg-background text-sm cursor-pointer select-none flex-1">
              <input type="checkbox" name="requires_deliverable" value="true" defaultChecked={task.requires_deliverable} className="accent-info" />
              Requiere entregable
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export function OperationsLab({ projectTypes: init, phaseSets: initPS, taskSets: initTS, employees }: Props) {
  const [types, setTypes] = useState<ProjectType[]>(init)
  const [phaseSets, setPhaseSets] = useState<PhaseSet[]>(initPS)
  const [taskSets, setTaskSets] = useState<TaskSet[]>(initTS)

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(init[0]?.id ?? null)
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)

  const [showNewType, setShowNewType] = useState(false)
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null)
  const [newTypeColor, setNewTypeColor] = useState("")
  const [editTypeColor, setEditTypeColor] = useState("")
  const [newTypeIcon, setNewTypeIcon] = useState("")
  const [editTypeIcon, setEditTypeIcon] = useState("")
  const [showNewPS, setShowNewPS] = useState(false)
  const [showAddPhase, setShowAddPhase] = useState(false)
  const [editingTS, setEditingTS] = useState(false)
  const [showNewTS, setShowNewTS] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskSetTask | null>(null)
  const [showImport, setShowImport] = useState(false)

  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // ── derived ─────────────────────────────────────────────────────────────────
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

  function run(fn: () => Promise<void>) {
    startTransition(async () => { try { await fn() } catch { /* ignore */ } })
  }

  // ── Project Type CRUD ────────────────────────────────────────────────────────
  function handleCreateType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); const form = e.currentTarget
    run(async () => {
      const created = await createProjectType(fd) as ProjectType
      setTypes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedTypeId(created.id); setSelectedPhaseId(null); setShowNewType(false); setNewTypeColor(""); setNewTypeIcon(""); form.reset()
    })
  }

  function handleUpdateType(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget)
    const type = types.find((t) => t.id === id)
    if (type?.default_phase_set_id) fd.set("default_phase_set_id", type.default_phase_set_id)
    run(async () => {
      const updated = await updateProjectType(id, fd) as ProjectType
      setTypes((prev) => prev.map((t) => t.id === id ? { ...t, ...updated } : t))
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
    e.preventDefault(); const fd = new FormData(e.currentTarget); const form = e.currentTarget
    run(async () => {
      const created = await createPhaseSet(fd) as PhaseSet
      const newPS: PhaseSet = { ...created, phases: [] }
      setPhaseSets((prev) => [...prev, newPS].sort((a, b) => a.name.localeCompare(b.name)))
      if (selectedType) {
        await linkPhaseSetToProjectType(selectedType.id, created.id)
        setTypes((prev) => prev.map((t) => t.id === selectedType.id ? { ...t, default_phase_set_id: created.id } : t))
      }
      setShowNewPS(false); setSelectedPhaseId(null); form.reset()
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
    e.preventDefault(); if (!linkedPS) return
    const fd = new FormData(e.currentTarget); const form = e.currentTarget
    run(async () => {
      const created = await addPhaseToSet(linkedPS.id, fd) as PhaseSetPhase
      setPhaseSets((prev) => prev.map((ps) =>
        ps.id === linkedPS.id ? { ...ps, phases: [...(ps.phases ?? []), created] } : ps
      ))
      setShowAddPhase(false); form.reset()
    })
  }

  function handleDeletePhase(phaseId: string) {
    if (!confirm("¿Eliminar esta fase?") || !linkedPS) return
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
    e.preventDefault(); const fd = new FormData(e.currentTarget); const form = e.currentTarget
    run(async () => {
      const created = await createTaskSet(fd) as TaskSet
      const assigneeId = fd.get("default_assignee_id") as string
      const assignee = employees.find((emp) => emp.id === assigneeId) ?? null
      const newTS: TaskSet = { ...created, tasks: [], default_assignee: assignee }
      setTaskSets((prev) => [...prev, newTS].sort((a, b) => a.name.localeCompare(b.name)))
      if (selectedPhase && linkedPS) {
        await linkTaskSetToPhase(selectedPhase.id, created.id)
        setPhaseSets((prev) => prev.map((ps) =>
          ps.id === linkedPS.id
            ? { ...ps, phases: (ps.phases ?? []).map((p) => p.id === selectedPhase.id ? { ...p, default_task_set_id: created.id } : p) }
            : ps
        ))
      }
      setShowNewTS(false); form.reset()
    })
  }

  function handleUpdateTS(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!linkedTS) return
    const fd = new FormData(e.currentTarget)
    run(async () => {
      await updateTaskSet(linkedTS.id, fd)
      const assigneeId = fd.get("default_assignee_id") as string
      const assignee = employees.find((emp) => emp.id === assigneeId) ?? null
      setTaskSets((prev) => prev.map((ts) =>
        ts.id === linkedTS.id
          ? { ...ts, name: fd.get("name") as string, default_assignee: assignee }
          : ts
      ))
      setEditingTS(false)
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
      setEditingTS(false)
    })
  }

  function handleAddTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!linkedTS) return
    const fd = new FormData(e.currentTarget); const form = e.currentTarget
    run(async () => {
      const created = await addTaskToSet(linkedTS.id, fd) as TaskSetTask
      setTaskSets((prev) => prev.map((ts) =>
        ts.id === linkedTS.id ? { ...ts, tasks: [...(ts.tasks ?? []), created] } : ts
      ))
      setShowAddTask(false); form.reset()
    })
  }

  function handleDeleteTask(taskId: string) {
    if (!confirm("¿Eliminar esta tarea?") || !linkedTS) return
    run(async () => {
      await deleteTaskFromSet(taskId)
      setTaskSets((prev) => prev.map((ts) =>
        ts.id === linkedTS.id ? { ...ts, tasks: (ts.tasks ?? []).filter((t) => t.id !== taskId) } : ts
      ))
    })
  }

  function handleUpdateTask(taskId: string, taskSetId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    run(async () => {
      const updated = await updateTaskInSet(taskId, fd) as TaskSetTask
      setTaskSets((prev) => prev.map((ts) =>
        ts.id === taskSetId
          ? { ...ts, tasks: (ts.tasks ?? []).map((t) => t.id === taskId ? { ...t, ...updated } : t) }
          : ts
      ))
      setEditingTask(null)
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !linkedTS) return
    const oldTasks = (linkedTS.tasks ?? []) as TaskSetTask[]
    const oldIndex = oldTasks.findIndex((t) => t.id === active.id)
    const newIndex = oldTasks.findIndex((t) => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(oldTasks, oldIndex, newIndex)
    // Optimistic update
    setTaskSets((prev) => prev.map((ts) =>
      ts.id === linkedTS.id ? { ...ts, tasks: reordered } : ts
    ))
    // Persist
    run(async () => {
      await reorderTasksInSet(linkedTS.id, reordered.map((t) => t.id))
    })
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  async function handleImport(jsonStr: string) {
    const result = await importOperationsTemplate(jsonStr) as {
      projectType: ProjectType
      phaseSet: PhaseSet | null
      taskSets: Array<{ id: string; name: string; tasks: TaskSetTask[] }>
    }

    if (result.phaseSet) {
      setPhaseSets((prev) => [...prev, result.phaseSet!].sort((a, b) => a.name.localeCompare(b.name)))
    }
    for (const ts of result.taskSets) {
      setTaskSets((prev) => [...prev, { ...ts, default_assignee: null } as TaskSet].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setTypes((prev) => [...prev, result.projectType].sort((a, b) => a.name.localeCompare(b.name)))
    setSelectedTypeId(result.projectType.id)
    setSelectedPhaseId(null)
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  function handleExport() {
    if (!selectedType) return
    const data = {
      projectType: { name: selectedType.name, description: selectedType.description ?? null },
      phaseSet: linkedPS ? {
        name: linkedPS.name,
        phases: phases.map((phase) => {
          const ts = phase.default_task_set_id ? taskSets.find((ts) => ts.id === phase.default_task_set_id) ?? null : null
          return {
            name: phase.name,
            description: (phase as { description?: string | null }).description ?? null,
            taskSet: ts ? {
              name: ts.name,
              tasks: ((ts.tasks ?? []) as TaskSetTask[]).map((t) => ({
                title: t.title,
                description: t.description ?? null,
                is_urgent: t.is_urgent ?? false,
              })),
            } : null,
          }
        }),
      } : null,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${selectedType.name.replace(/\s+/g, "-").toLowerCase()}-template.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 mb-3">
        {selectedType && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar tipo seleccionado
          </button>
        )}
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Importar plantilla
        </button>
      </div>

      <div className="flex border border-border rounded-xl overflow-hidden bg-card" style={{ height: "calc(100vh - 200px)", minHeight: 480 }}>

        {/* ── PANEL 1: Project Types ─────────────────────────────────── */}
        <div className="w-56 flex-shrink-0 flex flex-col border-r border-border">
          <PanelHeader
            title="Tipos de Proyecto"
            subtitle={`${types.length} tipos`}
            onAdd={() => { setShowNewType(true); setEditingTypeId(null) }}
          />
          <div className="flex-1 overflow-y-auto">
            {showNewType && (
              <form onSubmit={handleCreateType} className="p-3 space-y-2 border-b border-border bg-primary/5">
                <InlineInput name="name" required autoFocus placeholder="Nombre…" />
                <InlineInput name="description" placeholder="Descripción (opcional)" />
                <ColorPicker value={newTypeColor} onChange={setNewTypeColor} />
                <IconPicker value={newTypeIcon} onChange={setNewTypeIcon} activeColor={newTypeColor} />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowNewType(false)} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                  <button type="submit" disabled={isPending} className="p-1 rounded text-primary hover:text-primary/80 disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
                </div>
              </form>
            )}
            {types.length === 0 && !showNewType && (
              <p className="text-xs text-muted-foreground text-center py-10 px-3">Sin tipos. Usa + para crear.</p>
            )}
            {types.map((type) => {
              const isSelected = type.id === selectedTypeId
              const psName = type.default_phase_set_id ? phaseSets.find((ps) => ps.id === type.default_phase_set_id)?.name : null

              if (editingTypeId === type.id) {
                return (
                  <form key={type.id} onSubmit={(e) => handleUpdateType(type.id, e)} className="p-3 space-y-2 border-b border-border bg-muted/30">
                    <InlineInput name="name" defaultValue={type.name} required autoFocus />
                    <InlineInput name="description" defaultValue={type.description ?? ""} placeholder="Descripción" />
                    <ColorPicker value={editTypeColor} onChange={setEditTypeColor} />
                    <IconPicker value={editTypeIcon} onChange={setEditTypeIcon} activeColor={editTypeColor} />
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setEditingTypeId(null)} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                      <button type="submit" disabled={isPending} className="p-1 rounded text-primary disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
                    </div>
                  </form>
                )
              }

              return (
                <div
                  key={type.id}
                  onClick={() => { setSelectedTypeId(type.id); setSelectedPhaseId(null); setEditingTS(false) }}
                  className={`group flex items-center gap-2 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const Icon = getProjectTypeIcon(type.icon)
                        if (Icon) return <Icon className="w-3.5 h-3.5 flex-shrink-0" style={type.color ? { color: type.color } : undefined} />
                        if (type.color) return <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: type.color }} />
                        return null
                      })()}
                      <p className="text-sm font-medium truncate">{type.name}</p>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${psName ? "text-primary/80" : "text-muted-foreground"}`}>{psName ?? "Sin phase set"}</p>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setEditingTypeId(type.id); setEditTypeColor(type.color ?? ""); setEditTypeIcon(type.icon ?? ""); setShowNewType(false) }} className="p-1 rounded text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteType(type.id) }} className="p-1 rounded text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                  </div>
                  {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── PANEL 2: Phase Set ─────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-border">
          <PanelHeader
            title={linkedPS ? linkedPS.name : "Phase Set"}
            subtitle={!selectedType ? "Selecciona un tipo" : linkedPS ? `${phases.length} fases` : "Sin phase set asignado"}
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
                      <button type="button" onClick={() => setShowNewPS(false)} className="text-xs text-muted-foreground">Cancelar</button>
                      <button type="submit" disabled={isPending} className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">Crear y vincular</button>
                    </div>
                  </form>
                ) : (
                  <button onClick={() => setShowNewPS(true)} className="w-full py-2.5 rounded-lg border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors">
                    + Crear nuevo phase set
                  </button>
                )}
              </div>
            )}

            {selectedType && linkedPS && (
              <>
                <div className="px-3 py-2 border-b border-border/50 bg-muted/20">
                  <InlineSelect value={linkedPS.id} onChange={(e) => handleLinkPS(e.target.value)} className="text-xs text-muted-foreground">
                    {phaseSets.map((ps) => <option key={ps.id} value={ps.id}>{ps.name}</option>)}
                  </InlineSelect>
                </div>

                {phases.map((phase, i) => {
                  const isSelPhase = phase.id === selectedPhaseId
                  const tsName = phase.default_task_set_id ? taskSets.find((ts) => ts.id === phase.default_task_set_id)?.name : null
                  return (
                    <div
                      key={phase.id}
                      onClick={() => { setSelectedPhaseId(isSelPhase ? null : phase.id); setEditingTS(false) }}
                      className={`group flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-border/50 transition-colors ${isSelPhase ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"}`}
                    >
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{phase.name}</p>
                        <p className={`text-xs truncate mt-0.5 ${tsName ? "text-primary/80" : "text-muted-foreground"}`}>{tsName ?? "Sin task set"}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeletePhase(phase.id) }} className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all flex-shrink-0"><X className="w-3 h-3" /></button>
                      {isSelPhase && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    </div>
                  )
                })}

                {phases.length === 0 && !showAddPhase && (
                  <p className="text-xs text-muted-foreground text-center py-6">Sin fases. Usa + para agregar.</p>
                )}

                {showAddPhase && (
                  <form onSubmit={handleAddPhase} className="px-3 py-3 space-y-2 bg-muted/20 border-t border-border">
                    <InlineInput name="name" required autoFocus placeholder="Nombre de la fase…" />
                    <InlineInput name="description" placeholder="Descripción (opcional)" />
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setShowAddPhase(false)} className="text-xs text-muted-foreground">Cancelar</button>
                      <button type="submit" disabled={isPending} className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">Agregar</button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── PANEL 3: Task Set ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <PanelHeader
            title={linkedTS ? linkedTS.name : "Task Set"}
            subtitle={!selectedPhase ? "Selecciona una fase" : linkedTS ? `${tasks.length} tareas plantilla` : "Sin task set vinculado"}
            onAdd={linkedTS && !editingTS ? () => setShowAddTask(true) : undefined}
            onDelete={linkedTS && !editingTS ? () => handleDeleteTS(linkedTS.id) : undefined}
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
                      <button type="button" onClick={() => setShowNewTS(false)} className="text-xs text-muted-foreground">Cancelar</button>
                      <button type="submit" disabled={isPending} className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">Crear y vincular</button>
                    </div>
                  </form>
                ) : (
                  <button onClick={() => setShowNewTS(true)} className="w-full py-2.5 rounded-lg border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors">
                    + Crear nuevo task set
                  </button>
                )}
              </div>
            )}

            {selectedPhase && linkedTS && (
              <>
                {/* Task set switcher + edit toggle */}
                <div className="px-3 py-2 border-b border-border/50 bg-muted/20 flex items-center gap-2">
                  <InlineSelect value={linkedTS.id} onChange={(e) => { handleLinkTS(e.target.value); setEditingTS(false) }} className="text-xs text-muted-foreground flex-1">
                    {taskSets.map((ts) => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
                  </InlineSelect>
                  <button
                    onClick={() => setEditingTS(!editingTS)}
                    title="Editar nombre y asignado"
                    className={`p-1 rounded transition-colors flex-shrink-0 ${editingTS ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Edit task set form */}
                {editingTS && (
                  <form onSubmit={handleUpdateTS} className="px-4 py-3 space-y-2 bg-muted/20 border-b border-border">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
                      <InlineInput name="name" required defaultValue={linkedTS.name} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Asignado por defecto</label>
                      <InlineSelect name="default_assignee_id" defaultValue={(linkedTS.default_assignee as Profile | null)?.id ?? "none"}>
                        <option value="none">Sin asignar</option>
                        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                      </InlineSelect>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setEditingTS(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                      <button type="submit" disabled={isPending} className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">Guardar</button>
                    </div>
                  </form>
                )}

                {/* Tasks list — sortable */}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {tasks.map((task, i) => (
                      <SortableTaskRow
                        key={task.id}
                        task={task}
                        index={i}
                        onEdit={setEditingTask}
                        onDelete={handleDeleteTask}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {tasks.length === 0 && !showAddTask && (
                  <p className="text-xs text-muted-foreground text-center py-6">Sin tareas. Usa + para agregar.</p>
                )}

                {showAddTask && (
                  <form onSubmit={handleAddTask} className="px-4 py-3 space-y-2 bg-muted/20 border-t border-border">
                    <InlineInput name="title" required autoFocus placeholder="Título de la tarea…" />
                    <div className="grid grid-cols-2 gap-2">
                      <InlineInput name="description" placeholder="Descripción (opcional)" />
                      <div className="flex gap-2">
                        <label className="flex items-center gap-2 px-2 py-1.5 rounded border border-input bg-background text-sm cursor-pointer select-none flex-1">
                          <input type="checkbox" name="is_urgent" value="true" className="accent-destructive" />
                          Urgente
                        </label>
                        <label className="flex items-center gap-2 px-2 py-1.5 rounded border border-input bg-background text-sm cursor-pointer select-none flex-1">
                          <input type="checkbox" name="requires_deliverable" value="true" className="accent-info" />
                          Entregable
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setShowAddTask(false)} className="text-xs text-muted-foreground">Cancelar</button>
                      <button type="submit" disabled={isPending} className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">Agregar</button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />
      )}

      {editingTask && linkedTS && (
        <EditTaskModal
          task={editingTask}
          isPending={isPending}
          onClose={() => setEditingTask(null)}
          onSubmit={(e) => handleUpdateTask(editingTask.id, linkedTS.id, e)}
        />
      )}
    </>
  )
}
