"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { TaskDetailModal } from "@/components/tasks/task-table"
import { DeliverableDrawer } from "@/components/projects/deliverable-drawer"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Check, Trash2, Undo2, ListChecks, Paperclip, Bell, RotateCcw } from "lucide-react"
import { deleteTask, updateTaskStatus } from "@/lib/actions/tasks"
import type { Task, Profile, Deliverable, Sop } from "@/lib/types"
import { cn } from "@/lib/utils"

// Vista "Equipo → persona" (admin): sus pendientes agrupados por urgencia y
// lo que terminó en los últimos 14 días. Marcar como hecha NO la desaparece:
// pasa a "Hechas" (con deshacer). Clic en una tarea abre el mismo modal de
// detalle que en los proyectos, con el proyecto de esa tarea.

const DONE_WINDOW_DAYS = 14
const STALE_DAYS = 7
const DAY = 86_400_000

const iso = (d: Date) => d.toISOString().slice(0, 10)
const shortDate = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
// Cuándo se terminó: completed_at (migración 117) o, si no existe, la última actualización.
const doneAt = (t: Task) => t.completed_at ?? t.updated_at ?? t.created_at
const daysAgo = (d: string) => Math.floor((Date.now() - Date.parse(d)) / DAY)

interface Props {
  employee: Profile | undefined
  tasks: Task[]          // todas las tareas visibles; aquí se filtran por persona
  employees: Profile[]
  projects: { id: string; name: string }[]
  sops: Sop[]
  deliverablesByTaskId: Record<string, Deliverable>
  onBack: () => void
}

export function TeamMemberView({ employee, tasks, employees, projects, sops, deliverablesByTaskId, onBack }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<"pending" | "done">("pending")
  const [patches, setPatches] = useState<Record<string, Partial<Task>>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)

  const mine = useMemo(() => tasks
    .map((t) => ({ ...t, ...patches[t.id] }) as Task)
    .filter((t) => t.assignee_id === employee?.id && !hidden.has(t.id)), [tasks, patches, hidden, employee])

  const today = iso(new Date())
  const weekEnd = iso(new Date(Date.now() + 7 * DAY))
  const pending = mine.filter((t) => t.status !== "Done")
  const doneSince = Date.now() - DONE_WINDOW_DAYS * DAY
  const done = mine
    .filter((t) => t.status === "Done" && (patches[t.id]?.status === "Done" || Date.parse(doneAt(t)) >= doneSince))
    .sort((a, b) => doneAt(b).localeCompare(doneAt(a)))

  const groups: { key: string; label: string; tone?: string; items: Task[] }[] = [
    { key: "overdue", label: "Vencidas", tone: "text-red-600", items: pending.filter((t) => t.due_date && t.due_date < today) },
    { key: "week", label: "Esta semana", items: pending.filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekEnd) },
    { key: "later", label: "Después", items: pending.filter((t) => t.due_date && t.due_date > weekEnd) },
    { key: "nodate", label: "Sin fecha", items: pending.filter((t) => !t.due_date) },
  ].map((g) => ({ ...g, items: g.items.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")) }))

  const projectName = (t: Task) => t.project_id ? projects.find((p) => p.id === t.project_id)?.name ?? (t.project as { name?: string } | null)?.name ?? "—" : "Sin proyecto"

  function setStatus(task: Task, status: "Done" | "Todo") {
    setBusy(task.id)
    const prev = task.status
    const now = new Date().toISOString()
    setPatches((p) => ({ ...p, [task.id]: { ...p[task.id], status, updated_at: now, completed_at: status === "Done" ? now : null } }))
    updateTaskStatus(task.id, status, task.project_id ?? null)
      .catch((e) => {
        setPatches((p) => ({ ...p, [task.id]: { ...p[task.id], status: prev } }))
        alert(e instanceof Error ? e.message : "No se pudo cambiar el estado.")
      })
      .finally(() => setBusy(null))
  }

  function remove(task: Task) {
    if (!confirm(`¿Eliminar "${task.title}"? No se puede deshacer.`)) return
    setBusy(task.id)
    deleteTask(task.id, task.project_id ?? null)
      .then(() => setHidden((s) => new Set(s).add(task.id)))
      .catch(() => alert("No se pudo eliminar la tarea."))
      .finally(() => setBusy(null))
  }

  const detail = detailId ? mine.find((t) => t.id === detailId) ?? tasks.find((t) => t.id === detailId) ?? null : null

  function Row({ task }: { task: Task }) {
    const isDone = task.status === "Done"
    const justDone = isDone && patches[task.id]?.status === "Done"
    const checklist = task.checklist_items ?? []
    const checked = checklist.filter((c) => c.is_checked).length
    const stale = !isDone && task.updated_at && daysAgo(task.updated_at) >= STALE_DAYS ? daysAgo(task.updated_at) : null
    const overdue = !isDone && task.due_date && task.due_date < today
    return (
      <li className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40">
        <button type="button" onClick={() => setStatus(task, isDone ? "Todo" : "Done")} disabled={busy === task.id}
          title={isDone ? "Reabrir" : "Marcar como hecha"}
          className={cn("mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors disabled:opacity-50",
            isDone ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30")}>
          {isDone && <Check className="w-3 h-3" />}
        </button>
        <button type="button" onClick={() => setDetailId(task.id)} className="flex-1 min-w-0 text-left">
          <span className={cn("block text-sm font-medium truncate", isDone && "line-through text-muted-foreground")}>{task.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
            <span className="truncate max-w-[14rem]">{projectName(task)}</span>
            {task.status === "In Progress" && <span className="text-sky-600">En progreso</span>}
            {checklist.length > 0 && <span className="inline-flex items-center gap-0.5"><ListChecks className="w-3 h-3" />{checked}/{checklist.length}</span>}
            {task.requires_deliverable && <span className={cn("inline-flex items-center gap-0.5", deliverablesByTaskId[task.id] && "text-emerald-600")}><Paperclip className="w-3 h-3" />{deliverablesByTaskId[task.id] ? "Entregado" : "Pide entregable"}</span>}
            {task.is_pinged && <span className="inline-flex items-center gap-0.5"><Bell className="w-3 h-3" />Aviso</span>}
            {stale != null && <span className="text-amber-600">Sin movimiento {stale} d</span>}
            {isDone && <span>Hecha {shortDate(doneAt(task))}</span>}
          </span>
          {task.description?.trim() && !isDone && <span className="block text-xs text-muted-foreground truncate mt-0.5">{task.description.trim().split("\n")[0]}</span>}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {task.due_date && !isDone && <span className={cn("text-xs tabular-nums", overdue ? "text-red-600 font-medium" : "text-muted-foreground")}>{shortDate(task.due_date)}</span>}
          {justDone && tab === "pending" && (
            <button type="button" onClick={() => setStatus(task, "Todo")} className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Undo2 className="w-3 h-3" />Deshacer</button>
          )}
          {isDone && tab === "done" && (
            <button type="button" onClick={() => setStatus(task, "Todo")} disabled={busy === task.id} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-1 rounded hover:bg-muted"><RotateCcw className="w-3 h-3" />Reabrir</button>
          )}
          <button type="button" onClick={() => remove(task)} disabled={busy === task.id} title="Eliminar"
            className="p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </li>
    )
  }

  // Las que se acaban de marcar como hechas se quedan visibles en su grupo
  // (tachadas, con deshacer) hasta salir de la vista.
  const justDoneIds = new Set(Object.entries(patches).filter(([, p]) => p.status === "Done").map(([id]) => id))
  const pendingGroups = groups.map((g) => ({ ...g, items: [...g.items, ...mine.filter((t) => t.status === "Done" && justDoneIds.has(t.id) && groupOf(t) === g.key)] }))
  function groupOf(t: Task) {
    if (!t.due_date) return "nodate"
    if (t.due_date < today) return "overdue"
    return t.due_date <= weekEnd ? "week" : "later"
  }

  return (
    <div className="space-y-5">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-1 text-muted-foreground">
          <ChevronLeft className="w-4 h-4 mr-1" />Tareas
        </Button>
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-muted overflow-hidden flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {employee?.avatar_url ? <img src={employee.avatar_url} alt="" className="w-full h-full object-cover" /> : (employee?.full_name ?? "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{employee?.full_name ?? "Equipo"}</h1>
            <p className="text-sm text-muted-foreground">
              {pending.length} pendiente{pending.length === 1 ? "" : "s"}
              {groups[0].items.length > 0 && <span className="text-red-600"> · {groups[0].items.length} vencida{groups[0].items.length === 1 ? "" : "s"}</span>}
              {" · "}{done.length} hecha{done.length === 1 ? "" : "s"} en {DONE_WINDOW_DAYS} días
            </p>
          </div>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
        {([["pending", `Pendientes · ${pending.length}`], ["done", `Hechas · ${done.length}`]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn("px-3 h-8 rounded-md text-sm font-medium transition-colors", tab === k ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "pending" ? (
        pending.length === 0 && justDoneIds.size === 0 ? (
          <p className="text-center py-16 text-muted-foreground">Sin tareas pendientes.</p>
        ) : (
          <div className="space-y-4">
            {pendingGroups.filter((g) => g.items.length).map((g) => (
              <section key={g.key}>
                <p className={cn("px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider", g.tone ?? "text-muted-foreground")}>{g.label} · {g.items.filter((t) => t.status !== "Done").length}</p>
                <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {g.items.map((t) => <Row key={t.id} task={t} />)}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : done.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">No terminó tareas en los últimos {DONE_WINDOW_DAYS} días.</p>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {done.map((t) => <Row key={t.id} task={t} />)}
        </ul>
      )}

      <DeliverableDrawer task={drawerTask} projectId={drawerTask?.project_id ?? null} deliverable={drawerTask ? deliverablesByTaskId[drawerTask.id] ?? null : null} isAdmin onClose={() => setDrawerTask(null)} />
      {detail && (
        <TaskDetailModal
          task={detail}
          projectId={detail.project_id ?? null}
          employees={employees}
          isAdmin
          sops={sops}
          deliverable={deliverablesByTaskId[detail.id] ?? null}
          onDeliverableClick={setDrawerTask}
          onClose={() => { setDetailId(null); router.refresh() }}
          allowPersonalToggle
          onTaskUpdate={(patch) => setPatches((p) => ({ ...p, [detail.id]: { ...p[detail.id], ...patch } }))}
        />
      )}
    </div>
  )
}
