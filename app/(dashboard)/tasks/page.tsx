import { createClient } from "@/lib/supabase/server"
import { getTasks } from "@/lib/actions/tasks"
import { getEmployees } from "@/lib/actions/employees"
import { getProjects } from "@/lib/actions/projects"
import { TaskTable } from "@/components/tasks/task-table"
import { Badge } from "@/components/ui/badge"
import type { Task, Profile } from "@/lib/types"

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role, id").eq("id", user!.id).single()
  const isAdmin = profile?.role === "admin"

  let tasks: Task[] = []

  if (isAdmin) {
    tasks = (await getTasks()) as Task[]
  } else {
    // Employees only see their assigned tasks
    const allTasks = (await getTasks()) as Task[]
    tasks = allTasks.filter((t) => t.assignee_id === user!.id)
  }

  const employees = (await getEmployees()) as Profile[]

  const todo = tasks.filter((t) => t.status === "Todo")
  const inProgress = tasks.filter((t) => t.status === "In Progress")
  const done = tasks.filter((t) => t.status === "Done")

  // Group by project for display
  const byProject = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = (task.project as { id: string; name: string } | undefined)?.id ?? "no-project"
    if (!acc[key]) acc[key] = []
    acc[key].push(task)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tareas</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin ? "Todas las tareas" : "Mis tareas asignadas"}
        </p>
      </div>

      <div className="flex gap-3">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <span className="text-sm font-medium">Por Hacer</span>
          <Badge variant="secondary">{todo.length}</Badge>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
          <span className="text-sm font-medium text-blue-700">En Progreso</span>
          <Badge variant="info">{inProgress.length}</Badge>
        </div>
        <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2">
          <span className="text-sm font-medium text-green-700">Hechas</span>
          <Badge variant="success">{done.length}</Badge>
        </div>
      </div>

      {Object.entries(byProject).map(([projectId, projectTasks]) => {
        const projectName = (projectTasks[0]?.project as { name: string } | undefined)?.name ?? "Sin proyecto"
        return (
          <section key={projectId}>
            <h2 className="text-base font-semibold mb-3 border-b pb-2">{projectName}</h2>
            <TaskTable
              tasks={projectTasks}
              projectId={projectId}
              employees={employees}
              isAdmin={isAdmin}
            />
          </section>
        )
      })}

      {tasks.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No hay tareas</p>
          <p className="text-sm mt-1">Las tareas se crean desde los proyectos</p>
        </div>
      )}
    </div>
  )
}
