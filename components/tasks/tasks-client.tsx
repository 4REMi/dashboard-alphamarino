"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { TaskTable } from "@/components/tasks/task-table"
import { TaskForm } from "@/components/tasks/task-form"
import { StandupDump } from "@/components/tasks/standup-dump"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { ChevronLeft, ClipboardList, FolderKanban, ShieldCheck, Sparkles } from "lucide-react"
import type { Task, Profile, Deliverable, Sop } from "@/lib/types"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const PERSONAL_KEY = "personal"

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
  label, count, icon, iconStyle, accent, onClick,
}: {
  label: string
  count: number
  icon: React.ReactNode
  iconStyle?: React.CSSProperties
  accent?: boolean
  onClick: () => void
}) {
  return (
    <button
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
  const searchParams = useSearchParams()
  const selectedProject = searchParams.get("project") // null = overview screen
  const selectedEmployee = searchParams.get("employee") // admin-only audit view
  const [showStandup, setShowStandup] = useState(false)

  function selectProject(key: string) {
    router.push(`?project=${encodeURIComponent(key)}`, { scroll: false })
  }
  function selectEmployee(id: string) {
    router.push(`?employee=${encodeURIComponent(id)}`, { scroll: false })
  }
  function backToOverview() {
    router.push("?", { scroll: false })
  }

  // Pending (not Done) tasks assigned to me, grouped by project — this is
  // the count shown on each tile, always personal regardless of admin role.
  const myPendingByProject = new Map<string, number>()
  // Same, but per OTHER team member — admin-only "Equipo" audit row, to
  // check that voice/Telegram-assigned tasks actually landed on the right
  // person, without opening every project one by one.
  const teamPendingByAssignee = new Map<string, number>()
  for (const task of tasks) {
    if (task.status === "Done" || !task.assignee_id) continue
    if (task.assignee_id === currentUserId) {
      const key = task.project_id ?? PERSONAL_KEY
      myPendingByProject.set(key, (myPendingByProject.get(key) ?? 0) + 1)
    } else {
      teamPendingByAssignee.set(task.assignee_id, (teamPendingByAssignee.get(task.assignee_id) ?? 0) + 1)
    }
  }
  const teammates = employees.filter((e) => e.id !== currentUserId)

  // ── Overview ───────────────────────────────────────────────────────────
  if (selectedProject === null && selectedEmployee === null) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground text-sm mt-1">Elige un proyecto o tu lista personal.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowStandup(true)}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-violet-500" />
              Volcado rápido
            </Button>
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
            label="Mi lista"
            count={myPendingByProject.get(PERSONAL_KEY) ?? 0}
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
      .filter((task) => task.assignee_id === selectedEmployee && task.status !== "Done")
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
          <p className="text-muted-foreground text-sm mt-1">{employeeTasks.length} tarea{employeeTasks.length !== 1 ? "s" : ""} pendiente{employeeTasks.length !== 1 ? "s" : ""} — solo lectura, para verificar asignación.</p>
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

  // ── Detail screen — full task board for the selected project, or just
  // my own standalone tasks for "Mi lista" (personal, doesn't affect any
  // project's board). ─────────────────────────────────────────────────────
  const isPersonal = selectedProject === PERSONAL_KEY
  const scopedTasks = isPersonal
    ? tasks.filter((task) => !task.project_id && task.assignee_id === currentUserId)
    : tasks.filter((task) => task.project_id === selectedProject)

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
      ) : (
        <TaskTable
          tasks={scopedTasks}
          projectId={isPersonal ? null : selectedProject}
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
