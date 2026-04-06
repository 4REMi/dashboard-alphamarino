import { notFound } from "next/navigation"
import Link from "next/link"
import { getProject } from "@/lib/actions/projects"
import { getEmployees } from "@/lib/actions/employees"
import { getIncome, getProjectExpenses } from "@/lib/actions/finances"
import { ProjectForm } from "@/components/projects/project-form"
import { TaskForm } from "@/components/tasks/task-form"
import { TaskTable } from "@/components/tasks/task-table"
import { TeamManager } from "@/components/projects/team-manager"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { getCustomers } from "@/lib/actions/customers"
import { ArrowLeft, CalendarDays, DollarSign, Users } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Customer, Profile, Task } from "@/lib/types"

const statusConfig = {
  Planning: { label: "Planificación", variant: "secondary" as const },
  "In Progress": { label: "En Progreso", variant: "info" as const },
  Review: { label: "Revisión", variant: "warning" as const },
  Completed: { label: "Completado", variant: "success" as const },
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let project: Awaited<ReturnType<typeof getProject>> | null = null
  try {
    project = await getProject(id)
  } catch {
    notFound()
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()
  const isAdmin = profile?.role === "admin"

  const [employees, customers, income, expenses] = await Promise.all([
    getEmployees(),
    getCustomers(),
    isAdmin ? getIncome(id) : Promise.resolve([]),
    isAdmin ? getProjectExpenses(id) : Promise.resolve([]),
  ])

  const tasks = (project.tasks ?? []) as Task[]
  const members = (project.members ?? []).map((m: { profile: Profile }) => m.profile)
  const totalIncome = income.reduce((s, i) => s + Number(i.amount), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const config = statusConfig[project.status as keyof typeof statusConfig] ?? statusConfig["Planning"]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
            Proyectos
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
          {project.customer && (
            <Link href={`/customers/${project.customer_id}`} className="text-sm text-muted-foreground hover:text-primary mt-1 inline-block">
              {(project.customer as { name: string }).name}
            </Link>
          )}
        </div>
        {isAdmin && (
          <ProjectForm
            project={project as Parameters<typeof ProjectForm>[0]["project"]}
            customers={customers as Customer[]}
            trigger={<Button variant="outline">Editar</Button>}
          />
        )}
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Progreso General</h2>
            <span className="text-2xl font-bold text-primary">{project.progress}%</span>
          </div>
          <Progress value={project.progress} className="h-3" />
          <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground flex-wrap">
            {project.start_date && (
              <div className="flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" />
                <span>Inicio: {formatDate(project.start_date)}</span>
              </div>
            )}
            {project.end_date && (
              <div className="flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" />
                <span>Fin: {formatDate(project.end_date)}</span>
              </div>
            )}
            {project.budget && (
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                <span>Presupuesto: {formatCurrency(project.budget)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>{tasks.filter((t) => t.status === "Done").length}/{tasks.length} tareas</span>
            </div>
          </div>
          {project.description && (
            <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{project.description}</p>
          )}
        </CardContent>
      </Card>

      {/* KPI row */}
      {isAdmin && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Ingresos</p>
              <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(totalIncome)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Gastos</p>
              <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(totalExpenses)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Margen</p>
              <p className={`text-xl font-bold mt-1 ${totalIncome - totalExpenses >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(totalIncome - totalExpenses)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Team */}
      <div>
        <h2 className="text-base font-semibold mb-3">Equipo ({members.length})</h2>
        <TeamManager
          projectId={project.id}
          members={members}
          allEmployees={employees as Profile[]}
          isAdmin={isAdmin}
        />
      </div>

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Tareas ({tasks.length})</h2>
          {isAdmin && (
            <TaskForm
              projectId={project.id}
              employees={employees as Profile[]}
            />
          )}
        </div>
        <TaskTable
          tasks={tasks}
          projectId={project.id}
          employees={employees as Profile[]}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  )
}
