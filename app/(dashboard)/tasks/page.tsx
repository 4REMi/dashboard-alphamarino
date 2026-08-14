import { createClient } from "@/lib/supabase/server"
import { getTasks } from "@/lib/actions/tasks"
import { getEmployees } from "@/lib/actions/employees"
import { getProjects } from "@/lib/actions/projects"
import { getSops } from "@/lib/actions/sops"
import { getDeliverablesForTasks } from "@/lib/actions/deliverables"
import { TaskTable } from "@/components/tasks/task-table"
import { TaskForm } from "@/components/tasks/task-form"
import { Badge } from "@/components/ui/badge"
import type { Task, Profile, Deliverable } from "@/lib/types"
import { getTranslations } from "next-intl/server"

export default async function TasksPage() {
  const t = await getTranslations("tasks")
  const tStatus = await getTranslations("taskStatus")
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role, id").eq("id", user!.id).single()
  const isAdmin = profile?.role === "admin"

  const allTasks = (await getTasks()) as Task[]
  // Tasks with no project (standalone) always show. Tasks tied to a project
  // only show while that project is still Active — a finished/archived
  // project's leftover tasks were the biggest part of what made this page
  // huge and slow to begin with.
  const liveTasks = allTasks.filter((t) => !t.project || t.project.status === "Active")
  const tasks = isAdmin ? liveTasks : liveTasks.filter((t) => t.assignee_id === user!.id)

  const [employees, rawProjects, sops, rawDeliverables] = await Promise.all([
    getEmployees() as Promise<Profile[]>,
    getProjects().catch(() => []),
    getSops().catch(() => []),
    getDeliverablesForTasks(tasks.map((t) => t.id)).catch(() => []),
  ])
  const projects = (rawProjects as { id: string; name: string; status: string }[])
    .filter((p) => p.status === "Active")
    .map((p) => ({ id: p.id, name: p.name }))
  const deliverablesByTaskId = Object.fromEntries(
    (rawDeliverables as Deliverable[]).map((d) => [d.task_id, d])
  ) as Record<string, Deliverable>

  const today = new Date().toISOString().slice(0, 10)
  const overdue = tasks.filter((t) => t.status !== "Done" && t.due_date && t.due_date < today)
  const todo = tasks.filter((t) => t.status === "Todo")
  const inProgress = tasks.filter((t) => t.status === "In Progress")
  const done = tasks.filter((t) => t.status === "Done")

  const byProject = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = (task.project as { id: string; name: string } | undefined)?.id ?? "no-project"
    if (!acc[key]) acc[key] = []
    acc[key].push(task)
    return acc
  }, {})

  // Projects with an overdue task surface first — that's what an
  // individual agenda actually needs to draw the eye to.
  const projectEntries = Object.entries(byProject).sort(([, a], [, b]) => {
    const aOverdue = a.some((t) => t.status !== "Done" && t.due_date && t.due_date < today)
    const bOverdue = b.some((t) => t.status !== "Done" && t.due_date && t.due_date < today)
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    return 0
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isAdmin ? t("title") : t("noTasks")}
          </p>
        </div>
        <TaskForm projects={projects} employees={employees} />
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

      {projectEntries.map(([projectKey, projectTasks]) => {
        const projectName = projectKey === "no-project"
          ? "Sin proyecto"
          : (projectTasks[0]?.project as { name: string } | undefined)?.name ?? t("project")
        return (
          <section key={projectKey}>
            <h2 className="text-base font-semibold mb-3 border-b pb-2">{projectName}</h2>
            <TaskTable
              tasks={projectTasks}
              projectId={projectKey === "no-project" ? null : projectKey}
              employees={employees}
              isAdmin={isAdmin}
              deliverablesByTaskId={deliverablesByTaskId}
              currentUserId={user!.id}
              sops={sops}
            />
          </section>
        )
      })}

      {tasks.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">{t("noTasks")}</p>
          <p className="text-sm mt-1">{t("project")}</p>
        </div>
      )}
    </div>
  )
}
