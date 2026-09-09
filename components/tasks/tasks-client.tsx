"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { TaskTable } from "@/components/tasks/task-table"
import { TaskForm } from "@/components/tasks/task-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ClipboardList, FolderKanban } from "lucide-react"
import type { Task, Profile, Deliverable, Sop } from "@/lib/types"
import { useTranslations } from "next-intl"

const PERSONAL_KEY = "personal"

interface Props {
  tasks: Task[]
  employees: Profile[]
  projects: { id: string; name: string }[]
  sops: Sop[]
  deliverablesByTaskId: Record<string, Deliverable>
  isAdmin: boolean
  currentUserId: string
}

// ── Overview screen — one tile per project (+ a personal one) ──────────────

function ProjectTile({
  label, count, icon, onClick,
}: {
  label: string
  count: number
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all text-left"
    >
      <div className="relative w-10 h-10 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
        {icon}
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center leading-none shadow-sm">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </div>
      <div className="w-full flex items-start justify-between gap-2">
        <p className="font-medium text-sm">{label}</p>
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

  function selectProject(key: string) {
    router.push(`?project=${encodeURIComponent(key)}`, { scroll: false })
  }
  function backToOverview() {
    router.push("?", { scroll: false })
  }

  // Pending (not Done) tasks assigned to me, grouped by project — this is
  // the count shown on each tile, always personal regardless of admin role.
  const myPendingByProject = new Map<string, number>()
  for (const task of tasks) {
    if (task.assignee_id !== currentUserId || task.status === "Done") continue
    const key = task.project_id ?? PERSONAL_KEY
    myPendingByProject.set(key, (myPendingByProject.get(key) ?? 0) + 1)
  }

  if (selectedProject === null) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground text-sm mt-1">Elige un proyecto o tu lista personal.</p>
          </div>
          <TaskForm projects={projects} employees={employees} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <ProjectTile
            label="Mi lista"
            count={myPendingByProject.get(PERSONAL_KEY) ?? 0}
            icon={<ClipboardList className="w-5 h-5" />}
            onClick={() => selectProject(PERSONAL_KEY)}
          />
          {projects.map((p) => (
            <ProjectTile
              key={p.id}
              label={p.name}
              count={myPendingByProject.get(p.id) ?? 0}
              icon={<FolderKanban className="w-5 h-5" />}
              onClick={() => selectProject(p.id)}
            />
          ))}
        </div>
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
          projectId={isPersonal ? undefined : selectedProject}
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
