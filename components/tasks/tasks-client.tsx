"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { TaskTable } from "@/components/tasks/task-table"
import { TaskForm } from "@/components/tasks/task-form"
import { StandupDump } from "@/components/tasks/standup-dump"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { ChevronLeft, ClipboardList, FolderKanban, ShieldCheck, Sparkles, HelpCircle, ChevronsUpDown, AlertTriangle, Trash2 } from "lucide-react"
import { deleteTask } from "@/lib/actions/tasks"
import type { Task, Profile, Deliverable, Sop } from "@/lib/types"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

// Exported so StandupDump can target the matching tile by the same key when
// animating a confirmed item flying to its destination.
export const PERSONAL_KEY = "personal"

interface ProjectOption {
  id: string
  name: string
  project_type?: { name: string; icon: string | null; color: string | null } | null
}

interface Props {
  tasks: Task[]
  employees: Profile[]
  projects: ProjectOption[]
  sops: Sop[]
  deliverablesByTaskId: Record<string, Deliverable>
  isAdmin: boolean
  currentUserId: string
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}

// ── Overview screen — one tile per project (+ a personal one) ──────────────

function ProjectTile({
  tileKey, label, count, icon, iconStyle, accent, onClick,
}: {
  tileKey: string
  label: string
  count: number
  icon: React.ReactNode
  iconStyle?: React.CSSProperties
  accent?: boolean
  onClick: () => void
}) {
  return (
    <button
      data-tile-key={tileKey}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-3 p-5 rounded-xl border bg-card hover:shadow-sm transition-all text-left",
        accent ? "border-violet-200 hover:border-violet-400" : "border-border hover:border-primary/40"
      )}
    >
      <div
        className={cn(
          "relative w-10 h-10 rounded-lg flex items-center justify-center",
          accent ? "bg-violet-100 text-violet-600" : "bg-muted text-muted-foreground"
        )}
        style={iconStyle}
      >
        {icon}
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center leading-none shadow-sm">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </div>
      <div className="w-full flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{label}</p>
          {accent && <p className="text-[11px] text-violet-500 font-medium">Personal</p>}
        </div>
      </div>
    </button>
  )
}

export function TasksClient({ tasks, employees, projects, sops, deliverablesByTaskId, isAdmin, currentUserId }: Props) {
  const t = useTranslations("tasks")
  const tStatus = useTranslations("taskStatus")
  const router = useRouter()
  // Local state, not URL search params — this component already has every
  // task/project/employee it needs in memory, so switching screens should be
  // instant. Driving it through the URL made each click trigger a full
  // server round-trip (the layout is force-dynamic, so any query-param
  // change re-ran every fetch on the page) even though nothing new was
  // needed. onCreated below still uses router.refresh() on purpose — that's
  // the one moment new server data genuinely exists.
  const [selectedProject, setSelectedProject] = useState<string | null>(null) // null = overview screen
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null) // admin-only audit view
  const [showOrphans, setShowOrphans] = useState(false) // admin-only safety net, see below
  const [showStandup, setShowStandup] = useState(false)
  // Admin-deleted rows in the team audit view, hidden immediately without
  // waiting on a full router.refresh() — mistakes dictated over Telegram
  // sometimes land on the wrong person, and admins need to clear those out
  // without cluttering the employee's own list.
  const [deletedTaskIds, setDeletedTaskIds] = useState<Set<string>>(new Set())
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)

  function handleDeleteEmployeeTask(task: Task) {
    if (!confirm(`¿Eliminar "${task.title}"? No se puede deshacer.`)) return
    setDeletingTaskId(task.id)
    deleteTask(task.id, task.project_id ?? null)
      .then(() => setDeletedTaskIds((prev) => new Set(prev).add(task.id)))
      .catch(() => alert("No se pudo eliminar la tarea."))
      .finally(() => setDeletingTaskId(null))
  }

  function selectProject(key: string) {
    setSelectedProject(key)
  }
  function selectEmployee(id: string) {
    setSelectedEmployee(id)
  }
  function backToOverview() {
    setSelectedProject(null)
    setSelectedEmployee(null)
    setShowOrphans(false)
  }

  // Safety net: a task with neither project_id nor assignee_id is
  // structurally invisible everywhere else in this UI — it can't land on
  // any project board (no project) or in anyone's "Mi lista" (no owner).
  // This happens for real when TELEGRAM_BOT_AUTHOR_ID is missing/stale and
  // a voice-dictated task with no named project/assignee silently falls
  // through the auto-assign fallback. Surface it here so it's never just
  // silently lost again.
  const orphanTasks = tasks.filter((t) => !t.project_id && !t.assignee_id && t.status !== "Done")

  // Pending (not Done) tasks assigned to me, grouped by project — this is
  // the count shown on each project tile, always personal regardless of
  // admin role. Personal-scoped tasks never count here even when they're
  // linked to that project — they don't show on that project's board, so
  // counting them on the tile would be misleading. They count towards "Mi
  // lista" instead, alongside standalone (no-project) tasks.
  const myPendingByProject = new Map<string, number>()
  let myPersonalPending = 0
  // Same, but per OTHER team member — admin-only "Equipo" audit row, to
  // check that voice/Telegram-assigned tasks actually landed on the right
  // person, without opening every project one by one.
  const teamPendingByAssignee = new Map<string, number>()
  for (const task of tasks) {
    if (task.status === "Done" || !task.assignee_id) continue
    if (task.assignee_id === currentUserId) {
      if (!task.project_id || task.is_personal) myPersonalPending++
      else myPendingByProject.set(task.project_id, (myPendingByProject.get(task.project_id) ?? 0) + 1)
    } else {
      teamPendingByAssignee.set(task.assignee_id, (teamPendingByAssignee.get(task.assignee_id) ?? 0) + 1)
    }
  }
  const teammates = employees.filter((e) => e.id !== currentUserId)

  // ── Overview ───────────────────────────────────────────────────────────
  if (selectedProject === null && selectedEmployee === null && !showOrphans) {
    return (
      <div className="space-y-6">
        {isAdmin && orphanTasks.length > 0 && (
          <button
            onClick={() => setShowOrphans(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 transition-colors text-left"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              {orphanTasks.length} tarea{orphanTasks.length !== 1 ? "s" : ""} sin proyecto ni responsable — no aparecen en ningún tablero. Revisa y asígnalas.
            </span>
          </button>
        )}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground text-sm mt-1">Elige un proyecto o tu lista personal.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowStandup(true)}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-violet-500" />
              Captura rápida
            </Button>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="¿Cómo funciona Captura rápida?"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Escribe de corrido varios pendientes o notas de distintos proyectos y personas. El sistema los separa automáticamente y te deja revisar y corregir cada uno antes de crearlos de verdad.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TaskForm projects={projects} employees={employees} />
          </div>
        </div>

        {showStandup && (
          <StandupDump
            projects={projects}
            employees={employees}
            currentUserId={currentUserId}
            onClose={() => setShowStandup(false)}
            onCreated={() => router.refresh()}
          />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <ProjectTile
            tileKey={PERSONAL_KEY}
            label="Mi lista"
            count={myPersonalPending}
            icon={<ClipboardList className="w-5 h-5" />}
            accent
            onClick={() => selectProject(PERSONAL_KEY)}
          />
          {projects.map((p) => {
            const pt = p.project_type
            const Icon = pt?.icon ? getProjectTypeIcon(pt.icon) : null
            const iconStyle = pt?.color ? { backgroundColor: `${pt.color}22`, color: pt.color } : undefined
            return (
              <ProjectTile
                key={p.id}
                tileKey={p.id}
                label={p.name}
                count={myPendingByProject.get(p.id) ?? 0}
                icon={Icon ? <Icon className="w-5 h-5" /> : <FolderKanban className="w-5 h-5" />}
                iconStyle={iconStyle}
                onClick={() => selectProject(p.id)}
              />
            )
          })}
        </div>

        {isAdmin && teammates.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Equipo</h2>
              <p className="text-xs text-muted-foreground">— verifica lo que le está quedando asignado a cada quien</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {teammates.map((emp) => {
                const count = teamPendingByAssignee.get(emp.id) ?? 0
                return (
                  <button
                    key={emp.id}
                    onClick={() => selectEmployee(emp.id)}
                    className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-border bg-card hover:border-primary/40 transition-colors"
                  >
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                      {emp.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span className="text-xs font-medium">{emp.full_name}</span>
                    {count > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center leading-none">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Admin audit view — read-only, one teammate's pending tasks across
  // every project + standalone. Deliberately NOT the interactive TaskTable:
  // that component forwards `projectId` straight into the mutation actions
  // (updateTaskStatus, updateTaskAssignee, etc.) for permission checks and
  // cache revalidation, which breaks across a mixed-project list like this
  // one. This view exists to verify assignment, not to edit from here. ────
  if (selectedEmployee !== null) {
    const employee = employees.find((e) => e.id === selectedEmployee)
    const employeeTasks = tasks
      .filter((task) => task.assignee_id === selectedEmployee && task.status !== "Done" && !deletedTaskIds.has(task.id))
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    const today = new Date().toISOString().slice(0, 10)

    return (
      <div className="space-y-6">
        <div>
          <Button variant="ghost" size="sm" onClick={backToOverview} className="-ml-2 mb-1 text-muted-foreground">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Tareas
          </Button>
          <h1 className="text-2xl font-bold">{employee?.full_name ?? "Equipo"}</h1>
          <p className="text-muted-foreground text-sm mt-1">{employeeTasks.length} tarea{employeeTasks.length !== 1 ? "s" : ""} pendiente{employeeTasks.length !== 1 ? "s" : ""} — para verificar asignación y limpiar lo que se haya dictado mal.</p>
        </div>

        {employeeTasks.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">Sin tareas pendientes.</p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tarea</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Proyecto</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Estado</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Vence</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {employeeTasks.map((task) => {
                  const isOverdue = task.due_date && task.due_date < today
                  const projectName = task.project_id
                    ? projects.find((p) => p.id === task.project_id)?.name ?? "—"
                    : "Sin proyecto"
                  return (
                    <tr key={task.id} className="border-t">
                      <td className="px-4 py-2.5">{task.title}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{projectName}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={task.status === "In Progress" ? "info" : "secondary"}>
                          {task.status === "In Progress" ? tStatus("inProgress") : tStatus("todo")}
                        </Badge>
                      </td>
                      <td className={cn("px-4 py-2.5", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                        {task.due_date ? formatDate(task.due_date) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteEmployeeTask(task)}
                          disabled={deletingTaskId === task.id}
                          title="Eliminar tarea"
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // ── Orphan safety net — admin-only, editable (not read-only like the
  // employee audit) so fixing one is a single click here instead of
  // hunting it down through SQL. ───────────────────────────────────────────
  if (showOrphans) {
    return (
      <div className="space-y-6">
        <div>
          <Button variant="ghost" size="sm" onClick={backToOverview} className="-ml-2 mb-1 text-muted-foreground">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Tareas
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Sin proyecto ni responsable
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Asígnales un proyecto y/o responsable para que dejen de estar perdidas.</p>
        </div>
        <TaskTable
          tasks={orphanTasks}
          projectId={null}
          employees={employees}
          isAdmin={isAdmin}
          deliverablesByTaskId={deliverablesByTaskId}
          currentUserId={currentUserId}
          sops={sops}
        />
      </div>
    )
  }

  // ── Detail screen — full task board for the selected project, or my own
  // personal tasks for "Mi lista": standalone ones plus any task that's
  // linked to a project but marked personal (kept for context/grouping,
  // but never shown on that project's own board). ─────────────────────────
  const isPersonal = selectedProject === PERSONAL_KEY
  const scopedTasks = isPersonal
    ? tasks.filter((task) => task.assignee_id === currentUserId && (!task.project_id || task.is_personal))
    : tasks.filter((task) => task.project_id === selectedProject && !task.is_personal)

  const projectName = isPersonal ? "Mi lista" : projects.find((p) => p.id === selectedProject)?.name ?? t("project")

  const today = new Date().toISOString().slice(0, 10)
  const overdue = scopedTasks.filter((task) => task.status !== "Done" && task.due_date && task.due_date < today)
  const todo = scopedTasks.filter((task) => task.status === "Todo")
  const inProgress = scopedTasks.filter((task) => task.status === "In Progress")
  const done = scopedTasks.filter((task) => task.status === "Done")

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={backToOverview} className="-ml-2 mb-1 text-muted-foreground">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Proyectos
          </Button>
          <h1 className="text-2xl font-bold">{projectName}</h1>
        </div>
        <TaskForm
          projectId={isPersonal ? undefined : (selectedProject ?? undefined)}
          projects={isPersonal ? projects : undefined}
          employees={employees}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {overdue.length > 0 && (
          <div className="flex items-center gap-2 bg-destructive/10 rounded-lg px-3 py-2">
            <span className="text-sm font-medium text-destructive">Vencidas</span>
            <Badge variant="destructive">{overdue.length}</Badge>
          </div>
        )}
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <span className="text-sm font-medium">{tStatus("todo")}</span>
          <Badge variant="secondary">{todo.length}</Badge>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
          <span className="text-sm font-medium text-blue-700">{tStatus("inProgress")}</span>
          <Badge variant="info">{inProgress.length}</Badge>
        </div>
        <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2">
          <span className="text-sm font-medium text-green-700">{tStatus("done")}</span>
          <Badge variant="success">{done.length}</Badge>
        </div>
      </div>

      {scopedTasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">{t("noTasks")}</p>
        </div>
      ) : isPersonal ? (
        <PersonalTaskGroups
          tasks={scopedTasks}
          projects={projects}
          employees={employees}
          isAdmin={isAdmin}
          deliverablesByTaskId={deliverablesByTaskId}
          currentUserId={currentUserId}
          sops={sops}
        />
      ) : (
        <TaskTable
          tasks={scopedTasks}
          projectId={selectedProject}
          employees={employees}
          isAdmin={isAdmin}
          deliverablesByTaskId={deliverablesByTaskId}
          currentUserId={currentUserId}
          sops={sops}
        />
      )}
    </div>
  )
}

// ── "Mi lista" grouped by project — a personal task keeps its project_id
// for context (per user request: "que pueda verlas todas agrupadas ahí...
// panorama de lo que tengo que hacer"), so instead of one flat table we
// render one TaskTable per project (+ a "Sin proyecto" group), each with
// its own real projectId so the row actions (status/assignee/SOP/etc.)
// keep working exactly as they do on that project's own board. ───────────
function PersonalTaskGroups({
  tasks, projects, employees, isAdmin, deliverablesByTaskId, currentUserId, sops,
}: {
  tasks: Task[]
  projects: ProjectOption[]
  employees: Profile[]
  isAdmin: boolean
  deliverablesByTaskId: Record<string, Deliverable>
  currentUserId: string
  sops: Sop[]
}) {
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.project_id ?? "none"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(task)
  }

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "none") return 1
    if (b === "none") return -1
    const nameA = projects.find((p) => p.id === a)?.name ?? ""
    const nameB = projects.find((p) => p.id === b)?.name ?? ""
    return nameA.localeCompare(nameB)
  })

  // Bumped to force every project's own TaskTable below to expand all its
  // groups at once — each renders independently with its own local
  // collapsed/expanded state, so clicking through every group one by one
  // across every project got old fast.
  const [expandSignal, setExpandSignal] = useState(0)

  return (
    <div className="space-y-6">
      {sortedKeys.length > 1 && (
        <button
          onClick={() => setExpandSignal((n) => n + 1)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
          Expandir todo
        </button>
      )}
      {sortedKeys.map((key) => {
        const project = key === "none" ? null : projects.find((p) => p.id === key)
        const pt = project?.project_type
        const Icon = pt?.icon ? getProjectTypeIcon(pt.icon) : null
        const iconStyle = pt?.color ? { backgroundColor: `${pt.color}22`, color: pt.color } : undefined
        const groupTasks = groups.get(key)!

        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0",
                  !project && "bg-muted text-muted-foreground"
                )}
                style={iconStyle}
              >
                {Icon ? <Icon className="w-3.5 h-3.5" /> : <FolderKanban className="w-3.5 h-3.5" />}
              </div>
              <h3 className="text-sm font-semibold">{project?.name ?? "Sin proyecto"}</h3>
              <span className="text-xs text-muted-foreground">{groupTasks.length}</span>
            </div>
            <TaskTable
              tasks={groupTasks}
              projectId={key === "none" ? null : key}
              employees={employees}
              isAdmin={isAdmin}
              deliverablesByTaskId={deliverablesByTaskId}
              currentUserId={currentUserId}
              sops={sops}
              expandSignal={expandSignal}
            />
          </div>
        )
      })}
    </div>
  )
}
