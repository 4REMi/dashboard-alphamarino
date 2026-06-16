"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus, Trash2, LayoutList, Link2, Pencil, Check, X, Upload, Download, Paperclip, GripVertical, BookOpen, Search, Lock, ListChecks, AlertCircle, Copy, Sparkles } from "lucide-react"
import { PanelHeader, EmptyPanel, InlineInput, InlineSelect } from "@/components/lab/shared"
import type { ProjectType, PhaseSet, PhaseSetPhase, TaskSet, TaskSetTask, TaskSetChecklistItem, Profile, Sop, Position } from "@/lib/types"
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
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { AiTaskSuggester } from "@/components/operations/ai-task-suggester"
// TaskPriority intentionally removed — tasks now use is_urgent boolean
import {
  createProjectType, updateProjectType, deleteProjectType,
  createPhaseSet, updatePhaseSet, deletePhaseSet, addPhaseToSet, updatePhaseInSet, deletePhaseFromSet,
  linkPhaseSetToProjectType, linkTaskSetToPhase, clonePhaseSet, clonePhaseIntoPhaseSet,
  createTaskSet, updateTaskSet, deleteTaskSet, addTaskToSet, updateTaskInSet, deleteTaskFromSet,
  reorderTasksInSet, reorderPhaseInSet,
  importOperationsTemplate,
  addChecklistItemToSetTask, updateSetTaskChecklistItem, deleteSetTaskChecklistItem,
  reorderSetTaskChecklistItems, cloneTaskInTaskSet,
} from "@/lib/actions/config"
import { cn } from "@/lib/utils"
import { exportToXlsx } from "@/lib/utils/export-xlsx"
import { ChecklistEditorModal, type ChecklistModalItem } from "@/components/ui/checklist-editor-modal"

interface Props {
  projectTypes: ProjectType[]
  phaseSets: PhaseSet[]
  taskSets: TaskSet[]
  employees: Profile[]
  positions: Position[]
  sops: Sop[]
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
  const general = PROJECT_TYPE_ICONS.filter((e) => e.group === "general")
  const brands  = PROJECT_TYPE_ICONS.filter((e) => e.group === "brand")

  function renderGrid(entries: typeof PROJECT_TYPE_ICONS) {
    return (
      <div className="flex flex-wrap gap-1">
        {entries.map(({ name, icon: Icon, label }) => {
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
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Ícono</p>
      {renderGrid(general)}
      <p className="text-xs text-muted-foreground pt-1">Marcas</p>
      {renderGrid(brands)}
      <input type="hidden" name="icon" value={value} />
    </div>
  )
}

// ── Import modal ──────────────────────────────────────────────────────────────
function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (json: string, mode?: "default" | "rename" | "overwrite") => Promise<{ conflict?: { suggestedName: string } }>
}) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [conflict, setConflict] = useState<{ suggestedName: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setText(ev.target?.result as string)
    reader.readAsText(file)
  }

  async function run(mode: "default" | "rename" | "overwrite") {
    setError(null)
    setConflict(null)
    setLoading(true)
    try {
      const result = await onImport(text.trim(), mode)
      if (result?.conflict) {
        setConflict(result.conflict)
      } else {
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) { setError("Pega o carga un JSON primero"); return }
    await run("default")
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
              {
                title: "Reunión con cliente",
                is_urgent: true,
                requires_deliverable: false,
                checklist: [
                  { text: "Confirmar asistencia del cliente", is_blocking: false },
                  { text: "Compartir agenda previa", is_blocking: true },
                ],
              },
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
              <AutoTextarea
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

            {conflict && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 space-y-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Ya existe un tipo con ese nombre. ¿Qué quieres hacer?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => run("rename")}
                    disabled={loading}
                    className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Importando…" : `Importar como "${conflict.suggestedName}"`}
                  </button>
                  <button
                    type="button"
                    onClick={() => run("overwrite")}
                    disabled={loading}
                    className="px-3 py-1.5 text-sm rounded-md border border-destructive/50 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                  >
                    Sobreescribir el existente
                  </button>
                  <button type="button" onClick={() => setConflict(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Cancelar
                  </button>
                </div>
                <p className="text-xs text-amber-700/70 dark:text-amber-400/70">Sobreescribir elimina el tipo, su phase set y sus task sets permanentemente.</p>
              </div>
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
            {!conflict && (
              <button type="submit" disabled={loading}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {loading ? "Importando…" : "Importar"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Sortable task row ─────────────────────────────────────────────────────────
// ── Template checklist trigger (compact inline view + modal) ──────────────────

function TemplateChecklistTrigger({
  taskTitle,
  taskSetTaskId,
  items,
  onItemsChange,
}: {
  taskTitle: string
  taskSetTaskId: string
  items: ChecklistModalItem[]
  onItemsChange: (items: ChecklistModalItem[]) => void
}) {
  const [showModal, setShowModal] = useState(false)
  const blockingCount = items.filter((i) => i.is_blocking).length

  return (
    <div className="mt-2 pl-5 border-t border-border/40 pt-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <ListChecks className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">Checklist plantilla</span>
        {blockingCount > 0 && (
          <span className="text-[11px] text-destructive/70 flex items-center gap-0.5 ml-0.5">
            <Lock className="w-2.5 h-2.5" />
            {blockingCount}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="ml-auto text-[11px] text-primary hover:underline transition-colors"
        >
          {items.length === 0 ? "+ Agregar" : "Editar"}
        </button>
      </div>

      {items.length > 0 && (
        <div className="space-y-0.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("truncate flex-1 min-w-0", item.is_blocking && "font-medium text-foreground")}>
                {item.text}
              </span>
              {item.is_blocking && <Lock className="w-2.5 h-2.5 text-destructive flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ChecklistEditorModal
          taskTitle={taskTitle}
          initialItems={items}
          onClose={() => setShowModal(false)}
          onAdd={async (text, isBlocking) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const created = await addChecklistItemToSetTask(taskSetTaskId, text, isBlocking) as any
            onItemsChange([...items, created])
            return created
          }}
          onUpdate={async (id, text, isBlocking) => {
            await updateSetTaskChecklistItem(id, { text, is_blocking: isBlocking })
            onItemsChange(items.map((i) => i.id === id ? { ...i, text, is_blocking: isBlocking } : i))
          }}
          onDelete={async (id) => {
            await deleteSetTaskChecklistItem(id)
            onItemsChange(items.filter((i) => i.id !== id))
          }}
          onReorder={async (orderedIds) => {
            await reorderSetTaskChecklistItems(taskSetTaskId, orderedIds)
            const sorted = orderedIds.map((id, index) => {
              const item = items.find((i) => i.id === id)!
              return { ...item, item_order: index }
            })
            onItemsChange(sorted)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function SortableTaskRow({
  task,
  index,
  isCopied,
  onEdit,
  onDelete,
  onCopy,
}: {
  task: TaskSetTask
  index: number
  isCopied?: boolean
  onEdit: (task: TaskSetTask) => void
  onDelete: (id: string) => void
  onCopy?: () => void
  sops?: Sop[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const [checklistItems, setChecklistItems] = useState<ChecklistModalItem[]>(
    (task.checklist_items ?? []) as ChecklistModalItem[]
  )

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
      className={cn(
        "group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card",
        isCopied && "ring-2 ring-inset ring-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <button
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors flex-shrink-0 touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
          {index + 1}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>}
        </div>

        {checklistItems.length > 0 && (
          <span className={cn(
            "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0",
            checklistItems.some((i) => i.is_blocking)
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          )}>
            {checklistItems.some((i) => i.is_blocking) && <Lock className="w-2.5 h-2.5" />}
            {checklistItems.length}
          </span>
        )}
        {task.requires_deliverable && <Paperclip className="w-3.5 h-3.5 text-info flex-shrink-0" />}
        {task.is_urgent && (
          <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-destructive/10 text-destructive">Urgente</span>
        )}
        {task.default_position_id && (
          <span
            title={(task.default_position as { name?: string } | null)?.name ?? "Puesto asignado"}
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 bg-violet-100 text-violet-700 max-w-[80px] truncate"
          >
            {(task.default_position as { name?: string } | null)?.name ?? "Puesto"}
          </span>
        )}
        {task.sop_id && (
          <span
            title={(task.sop as { title?: string } | null)?.title ?? "SOP asignado"}
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-primary/10 text-primary"
          >
            <BookOpen className="w-3 h-3" />
            <span className="hidden sm:inline max-w-[80px] truncate">
              {(task.sop as { title?: string } | null)?.title ?? "SOP"}
            </span>
          </span>
        )}
        <button
          onClick={() => onEdit(task)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
        >
          <Pencil className="w-3 h-3" />
        </button>
        {onCopy && (
          <button
            onClick={onCopy}
            title={isCopied ? "Cancelar copia" : "Copiar tarea"}
            className={cn(
              "p-1 rounded transition-all flex-shrink-0",
              isCopied
                ? "text-emerald-600 dark:text-emerald-400"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
            )}
          >
            <Copy className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <TemplateChecklistTrigger
          taskTitle={task.title}
          taskSetTaskId={task.id}
          items={checklistItems}
          onItemsChange={setChecklistItems}
        />
      </div>
    </div>
  )
}

// ── Inline checklist add sub-component ───────────────────────────────────────
function InlineChecklistAdd({ taskSetTaskId, onAdd }: { taskSetTaskId: string; onAdd: (item: ChecklistModalItem) => void }) {
  const [text, setText] = useState("")
  const [blocking, setBlocking] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setIsAdding(true)
    try {
      const created = await addChecklistItemToSetTask(taskSetTaskId, text.trim(), blocking) as ChecklistModalItem
      onAdd(created)
      setText("")
      setBlocking(false)
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <form onSubmit={handleAdd} className="flex items-center gap-2 px-2 py-1">
      <Plus className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Nuevo ítem…"
        className="flex-1 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30 min-w-0"
      />
      <button
        type="button"
        onClick={() => setBlocking((b) => !b)}
        title={blocking ? "Obligatorio" : "Opcional"}
        className={cn("flex-shrink-0 p-1 rounded transition-colors", blocking ? "text-destructive" : "text-muted-foreground/30 hover:text-muted-foreground")}
      >
        <Lock className="w-3 h-3" />
      </button>
      <button
        type="submit"
        disabled={!text.trim() || isAdding}
        className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
      >
        Agregar
      </button>
    </form>
  )
}

// ── Edit task modal ───────────────────────────────────────────────────────────
function EditTaskModal({
  task,
  sops,
  positions,
  isPending,
  onClose,
  onSubmit,
  taskSetTaskId,
  checklistItems,
  onChecklistChange,
}: {
  task: TaskSetTask
  sops: Sop[]
  positions: Position[]
  isPending: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  taskSetTaskId: string
  checklistItems: ChecklistModalItem[]
  onChecklistChange: (items: ChecklistModalItem[]) => void
}) {
  const [sopId, setSopId] = useState(task.sop_id ?? "")
  const [sopSearch, setSopSearch] = useState("")
  const [showSopPicker, setShowSopPicker] = useState(false)

  const filteredSops = sops.filter((s) =>
    s.title.toLowerCase().includes(sopSearch.toLowerCase()) ||
    (s.category ?? "").toLowerCase().includes(sopSearch.toLowerCase())
  )
  const selectedSop = sops.find((s) => s.id === sopId) ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="font-semibold text-sm">Editar tarea</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* ── Section: Contenido ── */}
          <div className="border-t border-border/50 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Contenido</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título *</label>
                <InlineInput name="title" required defaultValue={task.title} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descripción</label>
                <AutoTextarea
                  name="description"
                  rows={3}
                  defaultValue={task.description ?? ""}
                  placeholder="Descripción detallada de la tarea…"
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
            </div>
          </div>

          {/* ── Section: Configuración ── */}
          <div className="border-t border-border/50 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">Configuración</p>
            <div className="space-y-3">
              {/* Compact pill toggles */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 h-7 px-3 rounded-full border cursor-pointer select-none text-xs font-medium transition-colors [&:has(input:checked)]:bg-destructive/10 [&:has(input:checked)]:border-destructive/40 [&:has(input:checked)]:text-destructive hover:bg-muted">
                  <input type="checkbox" name="is_urgent" value="true" defaultChecked={task.is_urgent} className="sr-only" />
                  <AlertCircle className="w-3 h-3" />
                  Urgente
                </label>
                <label className="flex items-center gap-1.5 h-7 px-3 rounded-full border cursor-pointer select-none text-xs font-medium transition-colors [&:has(input:checked)]:bg-blue-50 [&:has(input:checked)]:border-blue-300 [&:has(input:checked)]:text-blue-700 hover:bg-muted">
                  <input type="checkbox" name="requires_deliverable" value="true" defaultChecked={task.requires_deliverable} className="sr-only peer" />
                  <Paperclip className="w-3 h-3" />
                  Requiere entregable
                </label>
              </div>

              {/* Deliverable instructions — shown when requires_deliverable is checked */}
              {task.requires_deliverable && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Instrucciones del entregable</label>
                  <AutoTextarea
                    name="deliverable_instructions"
                    rows={2}
                    defaultValue={(task as TaskSetTask & { deliverable_instructions?: string | null }).deliverable_instructions ?? ""}
                    placeholder="Ej. Compartir link al Google Drive con los accesos del dominio y hosting…"
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
              )}

              {positions.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Puesto responsable</label>
                  <InlineSelect name="default_position_id" defaultValue={task.default_position_id ?? "none"}>
                    <option value="none">Sin puesto asignado</option>
                    {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </InlineSelect>
                </div>
              )}

              {/* SOP picker */}
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-1">
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">SOP asignado</span>
                </div>
                {selectedSop ? (
                  <div className="flex items-center gap-2 h-8 px-3 rounded-full border border-primary/30 bg-primary/5 text-sm w-fit max-w-full">
                    <BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span className="text-xs font-medium text-primary truncate max-w-xs">{selectedSop.title}</span>
                    {selectedSop.category && <span className="text-[10px] text-muted-foreground">{selectedSop.category}</span>}
                    <button type="button" onClick={() => { setSopId(""); setSopSearch("") }} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowSopPicker((v) => !v)}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Asignar SOP
                    </button>
                    {showSopPicker && (
                      <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border rounded-xl shadow-lg z-10 p-2 space-y-1.5">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            autoFocus
                            type="text"
                            value={sopSearch}
                            onChange={(e) => setSopSearch(e.target.value)}
                            placeholder="Buscar SOP…"
                            className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        {sops.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-1 py-1.5">No hay SOPs en el banco aún.</p>
                        ) : filteredSops.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-1 py-1.5">Sin resultados.</p>
                        ) : (
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
                            {filteredSops.map((sop) => (
                              <button
                                key={sop.id}
                                type="button"
                                onClick={() => { setSopId(sop.id); setSopSearch(""); setShowSopPicker(false) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                <span className="flex-1 min-w-0 text-sm truncate">{sop.title}</span>
                                {sop.category && <span className="text-xs text-muted-foreground flex-shrink-0">{sop.category}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                <input type="hidden" name="sop_id" value={sopId} />
              </div>
            </div>
          </div>

          {/* ── Section: Checklist ── */}
          <div className="border-t border-border/50 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Checklist</p>
            {checklistItems.length > 0 && (
              <div className="space-y-0.5 mb-2">
                {checklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 group">
                    <span className={cn("flex-1 min-w-0 text-sm truncate", item.is_blocking && "font-medium")}>{item.text}</span>
                    {item.is_blocking && <Lock className="w-3 h-3 text-destructive flex-shrink-0" />}
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteSetTaskChecklistItem(item.id)
                        onChecklistChange(checklistItems.filter((i) => i.id !== item.id))
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <InlineChecklistAdd
              taskSetTaskId={taskSetTaskId}
              onAdd={(item) => onChecklistChange([...checklistItems, item])}
            />
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
export function OperationsLab({ projectTypes: init, phaseSets: initPS, taskSets: initTS, employees, positions, sops }: Props) {
  const router = useRouter()
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
  const [showAI, setShowAI] = useState(false)
  const [showNewPS, setShowNewPS] = useState(false)
  const [renamingPS, setRenamingPS] = useState(false)
  const [renamePSValue, setRenamePSValue] = useState("")
  const [showAddPhase, setShowAddPhase] = useState(false)
  const [editingTS, setEditingTS] = useState(false)
  const [showNewTS, setShowNewTS] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskSetTask | null>(null)
  const [editingTaskChecklist, setEditingTaskChecklist] = useState<ChecklistModalItem[]>([])
  const [showImport, setShowImport] = useState(false)
  const [copiedPhaseId, setCopiedPhaseId] = useState<string | null>(null)
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)

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

  function handleClonePS() {
    if (!linkedPS) return
    run(async () => {
      await clonePhaseSet(linkedPS.id)
      router.refresh()
    })
  }

  function handleClonePhaseInto(phaseId: string, targetPhaseSetId: string, afterPhaseId?: string | null) {
    run(async () => {
      const result = await clonePhaseIntoPhaseSet(phaseId, targetPhaseSetId, afterPhaseId) as { phase: PhaseSetPhase; taskSet: TaskSet | null }
      // Update phaseSets state: insert new phase at correct position
      setPhaseSets((prev) => prev.map((ps) => {
        if (ps.id !== targetPhaseSetId) return ps
        const existing = (ps.phases ?? []) as PhaseSetPhase[]
        let updated: PhaseSetPhase[]
        if (afterPhaseId) {
          const anchorIdx = existing.findIndex((p) => p.id === afterPhaseId)
          updated = anchorIdx >= 0
            ? [...existing.slice(0, anchorIdx + 1), result.phase, ...existing.slice(anchorIdx + 1)]
            : [...existing, result.phase]
        } else {
          // prepend (paste at inicio)
          updated = [result.phase, ...existing]
        }
        return { ...ps, phases: updated }
      }))
      // Update taskSets state with the new task set
      if (result.taskSet) {
        setTaskSets((prev) => [...prev, result.taskSet as TaskSet])
      }
      setCopiedPhaseId(null)
    })
  }

  function handleCloneTaskInto(taskId: string, targetTaskSetId: string, afterTaskId?: string | null) {
    run(async () => {
      const newTask = await cloneTaskInTaskSet(taskId, targetTaskSetId, afterTaskId) as TaskSetTask
      setTaskSets((prev) => prev.map((ts) => {
        if (ts.id !== targetTaskSetId) return ts
        const existing = (ts.tasks ?? []) as TaskSetTask[]
        let updated: TaskSetTask[]
        if (afterTaskId) {
          const anchorIdx = existing.findIndex((t) => t.id === afterTaskId)
          updated = anchorIdx >= 0
            ? [...existing.slice(0, anchorIdx + 1), newTask, ...existing.slice(anchorIdx + 1)]
            : [...existing, newTask]
        } else {
          updated = [newTask, ...existing]
        }
        return { ...ts, tasks: updated }
      }))
      setCopiedTaskId(null)
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

  function handleUpdatePhase(phaseId: string, name: string, description: string) {
    if (!linkedPS) return
    const fd = new FormData()
    fd.set("name", name)
    fd.set("description", description)
    setPhaseSets((prev) => prev.map((ps) =>
      ps.id === linkedPS.id
        ? { ...ps, phases: (ps.phases ?? []).map((p) => p.id === phaseId ? { ...p, name, description: description || null } : p) }
        : ps
    ))
    run(async () => { await updatePhaseInSet(phaseId, fd) })
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
      const newTS: TaskSet = { ...created, tasks: [] }
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
      setTaskSets((prev) => prev.map((ts) =>
        ts.id === linkedTS.id
          ? { ...ts, name: fd.get("name") as string }
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
      setEditingTaskChecklist([])
    })
  }

  function handlePhaseDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !linkedPS) return
    const oldPhases = (linkedPS.phases ?? []) as PhaseSetPhase[]
    const oldIndex = oldPhases.findIndex((p) => p.id === active.id)
    const newIndex = oldPhases.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(oldPhases, oldIndex, newIndex)
    setPhaseSets((prev) => prev.map((ps) =>
      ps.id === linkedPS.id ? { ...ps, phases: reordered } : ps
    ))
    run(async () => {
      await reorderPhaseInSet(linkedPS.id, reordered.map((p) => p.id))
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
  async function handleImport(jsonStr: string, mode: "default" | "rename" | "overwrite" = "default"): Promise<{ conflict?: { suggestedName: string } }> {
    const result = await importOperationsTemplate(jsonStr, mode) as
      | { conflict: true; suggestedName: string }
      | { conflict?: never; replacedName: string | null; projectType: ProjectType; phaseSet: PhaseSet | null; taskSets: Array<{ id: string; name: string; tasks: TaskSetTask[] }> }

    if (result.conflict) return { conflict: { suggestedName: result.suggestedName } }

    // Remove overwritten entries from state
    if (result.replacedName) {
      setTypes((prev) => prev.filter((t) => t.name !== result.replacedName))
    }

    if (result.phaseSet) {
      setPhaseSets((prev) => [...prev, result.phaseSet!].sort((a, b) => a.name.localeCompare(b.name)))
    }
    for (const ts of result.taskSets) {
      setTaskSets((prev) => [...prev, ts as TaskSet].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setTypes((prev) => [...prev, result.projectType].sort((a, b) => a.name.localeCompare(b.name)))
    setSelectedTypeId(result.projectType.id)
    return {}
    setSelectedPhaseId(null)
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  const [showExportMenu, setShowExportMenu] = useState(false)

  function buildExportData() {
    if (!selectedType) return null
    return {
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
                requires_deliverable: t.requires_deliverable ?? false,
                ...(((t.checklist_items ?? []) as TaskSetChecklistItem[]).length > 0 && {
                  checklist: ((t.checklist_items ?? []) as TaskSetChecklistItem[])
                    .sort((a, b) => a.item_order - b.item_order)
                    .map((ci) => ({ text: ci.text, is_blocking: ci.is_blocking })),
                }),
              })),
            } : null,
          }
        }),
      } : null,
    }
  }

  function handleExportJson() {
    if (!selectedType) return
    const data = buildExportData()
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${selectedType.name.replace(/\s+/g, "-").toLowerCase()}-template.json`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }

  function handleExportXlsx() {
    if (!selectedType) return
    exportToXlsx(
      selectedType.name,
      selectedType.description ?? null,
      linkedPS?.name ?? null,
      phases,
      taskSets,
    )
    setShowExportMenu(false)
  }

  // ── Phase set rename ─────────────────────────────────────────────────────────
  async function handleRenamePS(name: string) {
    if (!linkedPS || !name.trim()) return
    const fd = new FormData()
    fd.set("name", name.trim())
    await updatePhaseSet(linkedPS.id, fd)
    setPhaseSets((prev) => prev.map((ps) => ps.id === linkedPS.id ? { ...ps, name: name.trim() } : ps))
    setRenamingPS(false)
  }

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 mb-3">
        {selectedType && (
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar tipo seleccionado
              <ChevronRight className={`w-3 h-3 transition-transform ${showExportMenu ? "rotate-90" : ""}`} />
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-border bg-card shadow-md overflow-hidden">
                  <button
                    onClick={handleExportJson}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                  >
                    <span className="text-muted-foreground">{ }</span>
                    JSON (.json)
                  </button>
                  <button
                    onClick={handleExportXlsx}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                  >
                    <span className="text-muted-foreground">{ }</span>
                    Excel (.xlsx)
                  </button>
                </div>
              </>
            )}
          </div>
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
          {renamingPS && linkedPS ? (
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 flex-shrink-0">
              <input
                autoFocus
                value={renamePSValue}
                onChange={(e) => setRenamePSValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleRenamePS(renamePSValue) }
                  if (e.key === "Escape") setRenamingPS(false)
                }}
                className="flex-1 min-w-0 text-sm font-semibold rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={() => handleRenamePS(renamePSValue)} className="p-1 rounded text-primary hover:text-primary/80"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setRenamingPS(false)} className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
          <PanelHeader
            title={linkedPS ? linkedPS.name : "Phase Set"}
            subtitle={!selectedType ? "Selecciona un tipo" : linkedPS ? `${phases.length} fases` : "Sin phase set asignado"}
            onAdd={linkedPS ? () => setShowAddPhase(true) : undefined}
            onDelete={linkedPS ? () => handleDeletePS(linkedPS.id) : undefined}
            extraActions={linkedPS ? (
              <>
                <button
                  onClick={() => { setRenamePSValue(linkedPS.name); setRenamingPS(true) }}
                  title="Renombrar phase set"
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleClonePS}
                  disabled={isPending}
                  title="Clonar phase set completo (copia independiente)"
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </>
            ) : undefined}
          />
          )}
          <div className="flex-1 overflow-y-auto">
            {!selectedType && <EmptyPanel icon={LayoutList} text="Selecciona un tipo de proyecto" />}

            {selectedType && !linkedPS && (
              <div className="p-4 space-y-3">
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
                {copiedPhaseId && (
                  <div className="px-3 py-1.5 border-b border-border bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between">
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Fase copiada — haz clic en "Pegar" para insertarla</span>
                    <button onClick={() => setCopiedPhaseId(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors"><X className="w-3 h-3" /></button>
                  </div>
                )}

                {copiedPhaseId && (
                  <PasteZone onClick={() => handleClonePhaseInto(copiedPhaseId, linkedPS.id, null)} label="Pegar al inicio" />
                )}

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhaseDragEnd}>
                  <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    {phases.map((phase, i) => (
                      <div key={phase.id}>
                        <SortablePhaseRow
                          phase={phase}
                          index={i}
                          isSelected={phase.id === selectedPhaseId}
                          isCopied={copiedPhaseId === phase.id}
                          tsName={phase.default_task_set_id ? (taskSets.find((ts) => ts.id === phase.default_task_set_id)?.name ?? null) : null}
                          onSelect={() => { if (!copiedPhaseId) { setSelectedPhaseId(phase.id === selectedPhaseId ? null : phase.id); setEditingTS(false) } }}
                          onDelete={() => handleDeletePhase(phase.id)}
                          onUpdate={(name, desc) => handleUpdatePhase(phase.id, name, desc)}
                          onCopy={() => setCopiedPhaseId(copiedPhaseId === phase.id ? null : phase.id)}
                        />
                        {copiedPhaseId && copiedPhaseId !== phase.id && (
                          <PasteZone onClick={() => handleClonePhaseInto(copiedPhaseId, linkedPS.id, phase.id)} />
                        )}
                      </div>
                    ))}
                  </SortableContext>
                </DndContext>

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
            onAdd={linkedTS && !editingTS ? () => { setShowAddTask(true); setShowAI(false) } : undefined}
            onDelete={linkedTS && !editingTS ? () => handleDeleteTS(linkedTS.id) : undefined}
            extraActions={linkedTS && !editingTS ? (
              <>
                <button
                  onClick={() => { setShowAI((v) => !v); setShowAddTask(false) }}
                  title="Sugerir tarea con IA"
                  className={cn("p-1 rounded transition-colors", showAI ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground")}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingTS(true)}
                  title="Editar nombre del task set"
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            ) : undefined}
          />

          <div className="flex-1 overflow-y-auto">
            {copiedTaskId && (
              <div className="px-3 py-1.5 border-b border-border bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  Tarea copiada — navega a cualquier fase y haz clic en "Pegar"
                </span>
                <button onClick={() => setCopiedTaskId(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors"><X className="w-3 h-3" /></button>
              </div>
            )}

            {!selectedPhase && <EmptyPanel icon={Link2} text="Selecciona una fase" />}

            {selectedPhase && !linkedTS && (
              <div className="p-4 space-y-3">
                {showNewTS ? (
                  <form onSubmit={handleCreateTS} className="space-y-2">
                    <InlineInput name="name" required autoFocus placeholder="Nombre del task set…" />
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
                {/* Edit task set form */}
                {editingTS && (
                  <form onSubmit={handleUpdateTS} className="px-4 py-3 space-y-2 bg-muted/20 border-b border-border">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
                      <InlineInput name="name" required defaultValue={linkedTS.name} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setEditingTS(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                      <button type="submit" disabled={isPending} className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">Guardar</button>
                    </div>
                  </form>
                )}

                {/* Tasks list — sortable */}
                {copiedTaskId && (
                  <PasteZone onClick={() => handleCloneTaskInto(copiedTaskId, linkedTS.id, null)} label="Pegar al inicio" />
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {tasks.map((task, i) => (
                      <div key={task.id}>
                        <SortableTaskRow
                          task={task}
                          index={i}
                          isCopied={copiedTaskId === task.id}
                          onEdit={(t) => { setEditingTask(t); setEditingTaskChecklist((t.checklist_items ?? []) as ChecklistModalItem[]) }}
                          onDelete={handleDeleteTask}
                          onCopy={() => setCopiedTaskId(copiedTaskId === task.id ? null : task.id)}
                        />
                        {copiedTaskId && copiedTaskId !== task.id && (
                          <PasteZone onClick={() => handleCloneTaskInto(copiedTaskId, linkedTS.id, task.id)} />
                        )}
                      </div>
                    ))}
                  </SortableContext>
                </DndContext>

                {tasks.length === 0 && !showAddTask && !copiedTaskId && (
                  <p className="text-xs text-muted-foreground text-center py-6">Sin tareas. Usa + para agregar.</p>
                )}
                {tasks.length === 0 && copiedTaskId && (
                  <PasteZone onClick={() => handleCloneTaskInto(copiedTaskId, linkedTS.id, null)} label="Pegar tarea aquí" />
                )}

                {showAddTask && (
                  <form onSubmit={handleAddTask} className="px-4 py-3 space-y-2 bg-muted/20 border-t border-border">
                    <InlineInput name="title" required autoFocus placeholder="Título de la tarea…" />
                    <div className="grid grid-cols-2 gap-2">
                      <InlineInput name="description" placeholder="Descripción (opcional)" />
                      <InlineSelect name="default_position_id" defaultValue="none">
                        <option value="none">Sin puesto asignado</option>
                        {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </InlineSelect>
                    </div>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 px-2 py-1.5 rounded border border-input bg-background text-sm cursor-pointer select-none">
                        <input type="checkbox" name="is_urgent" value="true" className="accent-destructive" />
                        Urgente
                      </label>
                      <label className="flex items-center gap-2 px-2 py-1.5 rounded border border-input bg-background text-sm cursor-pointer select-none">
                        <input type="checkbox" name="requires_deliverable" value="true" className="accent-info" />
                        Entregable
                      </label>
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

          {/* ── AI Task Suggester ── */}
          {showAI && linkedTS && selectedPhase && (
            <AiTaskSuggester
              context={{
                projectTypeName: selectedType?.name ?? null,
                phaseSetName: linkedPS?.name ?? "",
                allPhases: phases.map((p) => p.name),
                currentPhaseName: selectedPhase.name,
                currentPhaseIndex: phases.findIndex((p) => p.id === selectedPhase.id),
                existingTasks: tasks.map((t) => t.title),
                availablePositions: positions.map((p) => p.name),
              }}
              positions={positions}
              onAccept={async (proposal) => {
                startTransition(async () => {
                  const fd = new FormData()
                  fd.set("title", proposal.title)
                  fd.set("description", proposal.description)
                  if (proposal.is_urgent) fd.set("is_urgent", "true")
                  if (proposal.requires_deliverable) fd.set("requires_deliverable", "true")
                  if (proposal.default_position_id) fd.set("default_position_id", proposal.default_position_id)
                  const task = await addTaskToSet(linkedTS.id, fd) as TaskSetTask
                  // Add checklist items sequentially
                  for (const item of proposal.checklist) {
                    if (item.text.trim()) {
                      await addChecklistItemToSetTask(task.id, item.text, item.is_blocking)
                    }
                  }
                  setPhaseSets((prev) => prev.map((ps) =>
                    ps.id !== linkedPS!.id ? ps : {
                      ...ps,
                      phases: (ps.phases ?? []).map((ph) =>
                        ph.id !== selectedPhase.id ? ph : ph
                      ),
                    }
                  ))
                  setTaskSets((prev) => prev.map((ts) =>
                    ts.id !== linkedTS.id ? ts : {
                      ...ts,
                      tasks: [...(ts.tasks ?? []), { ...task, checklist_items: proposal.checklist.map((c, i) => ({ id: crypto.randomUUID(), task_set_task_id: task.id, text: c.text, is_blocking: c.is_blocking, item_order: i, created_at: "" })) }],
                    }
                  ))
                  setShowAI(false)
                })
              }}
              onClose={() => setShowAI(false)}
            />
          )}
        </div>
      </div>

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />
      )}

      {editingTask && linkedTS && (
        <EditTaskModal
          task={editingTask}
          sops={sops}
          positions={positions}
          isPending={isPending}
          onClose={() => { setEditingTask(null); setEditingTaskChecklist([]) }}
          onSubmit={(e) => handleUpdateTask(editingTask.id, linkedTS.id, e)}
          taskSetTaskId={editingTask.id}
          checklistItems={editingTaskChecklist}
          onChecklistChange={setEditingTaskChecklist}
        />
      )}
    </>
  )
}

// ── Paste zone ────────────────────────────────────────────────────────────────

function PasteZone({ onClick, label = "Pegar aquí" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 py-1 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-y border-emerald-200 dark:border-emerald-800 transition-colors"
    >
      <Copy className="w-3 h-3" />
      {label}
    </button>
  )
}

// ── Sortable phase row ────────────────────────────────────────────────────────

interface SortablePhaseRowProps {
  phase: PhaseSetPhase
  index: number
  isSelected: boolean
  isCopied: boolean
  tsName: string | null
  onSelect: () => void
  onDelete: () => void
  onUpdate: (name: string, description: string) => void
  onCopy: () => void
}

function SortablePhaseRow({ phase, index, isSelected, isCopied, tsName, onSelect, onDelete, onUpdate, onCopy }: SortablePhaseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id })
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(phase.name)
  const [descVal, setDescVal] = useState(phase.description ?? "")

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setNameVal(phase.name)
    setDescVal(phase.description ?? "")
    setEditing(true)
  }

  function commit() {
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== phase.name || descVal !== (phase.description ?? "")) {
      onUpdate(trimmed || phase.name, descVal.trim())
    }
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commit() }
    if (e.key === "Escape") setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={editing ? undefined : onSelect}
      className={cn(
        "group flex items-center gap-2 px-3 py-3 border-b border-border/50 transition-colors",
        editing ? "bg-muted/30" : isSelected ? "bg-primary/10 border-l-2 border-l-primary cursor-pointer" : "hover:bg-muted/40 cursor-pointer",
        isCopied && "ring-2 ring-inset ring-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20",
        isDragging && "opacity-70 shadow-md z-10 relative bg-card",
      )}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        {...attributes}
        {...listeners}
        tabIndex={-1}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">{index + 1}</span>

      {editing ? (
        <div className="flex-1 min-w-0 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            className="w-full rounded border border-input bg-background px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={descVal}
            onChange={(e) => setDescVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            placeholder="Descripción (opcional)"
            className="w-full rounded border border-input bg-background px-2 py-0.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      ) : (
        <div className="flex-1 min-w-0" onDoubleClick={startEdit}>
          <p className="text-sm font-medium truncate">{phase.name}</p>
          <p className={`text-xs truncate mt-0.5 ${tsName ? "text-primary/80" : "text-muted-foreground"}`}>{tsName ?? (phase.description ?? "Sin task set")}</p>
        </div>
      )}

      {!editing && (
        <>
          <button
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy() }}
            title={isCopied ? "Cancelar copia" : "Copiar fase"}
            className={cn(
              "p-1 rounded transition-all flex-shrink-0",
              isCopied
                ? "text-emerald-600 dark:text-emerald-400"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
            )}
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
          {isSelected && <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
        </>
      )}
    </div>
  )
}
