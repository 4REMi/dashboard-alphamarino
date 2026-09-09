import { createClient } from "@/lib/supabase/server"
import { getTasks } from "@/lib/actions/tasks"
import { getEmployees } from "@/lib/actions/employees"
import { getProjects } from "@/lib/actions/projects"
import { getSops } from "@/lib/actions/sops"
import { getDeliverablesForTasks } from "@/lib/actions/deliverables"
import { TasksClient } from "@/components/tasks/tasks-client"
import type { Task, Profile, Deliverable } from "@/lib/types"

export default async function TasksPage() {
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

  const [employees, rawProjects, sops, rawDeliverables] = await Promise.all([
    getEmployees() as Promise<Profile[]>,
    getProjects().catch(() => []),
    getSops().catch(() => []),
    getDeliverablesForTasks(liveTasks.map((t) => t.id)).catch(() => []),
  ])

  const activeProjects = (rawProjects as { id: string; name: string; status: string; members?: { id: string }[] }[])
    .filter((p) => p.status === "Active")
  // Employees only get cards for projects they're actually a member of;
  // admins see every active project, same asymmetry the rest of the app uses.
  const visibleProjects = isAdmin
    ? activeProjects
    : activeProjects.filter((p) => (p.members ?? []).some((m) => m.id === user!.id))
  const projects = visibleProjects.map((p) => ({ id: p.id, name: p.name }))

  const deliverablesByTaskId = Object.fromEntries(
    (rawDeliverables as Deliverable[]).map((d) => [d.task_id, d])
  ) as Record<string, Deliverable>

  return (
    <div className="p-6">
      <TasksClient
        tasks={liveTasks}
        employees={employees}
        projects={projects}
        sops={sops}
        deliverablesByTaskId={deliverablesByTaskId}
        isAdmin={isAdmin}
        currentUserId={user!.id}
      />
    </div>
  )
}
