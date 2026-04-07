import { notFound } from "next/navigation"
import Link from "next/link"
import {
  getProject,
  getPaidMediaCycles,
  getWebPhases,
  getProjectLog,
} from "@/lib/actions/projects"
import { getEmployees } from "@/lib/actions/employees"
import { getIncome, getProjectExpenses } from "@/lib/actions/finances"
import { ProjectForm } from "@/components/projects/project-form"
import { TaskForm } from "@/components/tasks/task-form"
import { TaskTable } from "@/components/tasks/task-table"
import { TeamManager } from "@/components/projects/team-manager"
import { PaidMediaContextCard } from "@/components/projects/hub/paid-media-context-card"
import { PaidMediaCyclesPanel } from "@/components/projects/hub/paid-media-cycles-panel"
import { WebContextCard } from "@/components/projects/hub/web-context-card"
import { WebPhaseStepper } from "@/components/projects/hub/web-phase-stepper"
import { ProjectLog } from "@/components/projects/hub/project-log"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { getCustomers } from "@/lib/actions/customers"
import { ArrowLeft, CalendarDays, DollarSign, Users } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Customer, Profile, Task, PaidMediaContext, WebContext } from "@/lib/types"

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

  const isPaidMedia = project.project_type === "paid_media"
  const isWebProject = project.project_type === "sitio_web"

  const [employees, customers, income, expenses, paidMediaCycles, webPhases, logEntries] = await Promise.all([
    getEmployees(),
    getCustomers(),
    isAdmin ? getIncome(id) : Promise.resolve([]),
    isAdmin ? getProjectExpenses(id) : Promise.resolve([]),
    isPaidMedia ? getPaidMediaCycles(id) : Promise.resolve([]),
    isWebProject ? getWebPhases(id) : Promise.resolve([]),
    getProjectLog(id),
  ])

  const tasks = (project.tasks ?? []) as Task[]
  const members = (project.members ?? []).map((m: { profile: Profile }) => m.profile)
  const totalIncome = income.reduce((s, i) => s + Number(i.amount), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const config = statusConfig[project.status as keyof typeof statusConfig] ?? statusConfig["Planning"]

  // Extract nested hub context (Supabase returns array for one-to-one joins via select)
  const paidMediaContext = Array.isArray(project.paid_media_context)
    ? (project.paid_media_context[0] as PaidMediaContext | undefined) ?? null
    : (project.paid_media_context as PaidMediaContext | null) ?? null

  const webContext = Array.isArray(project.web_context)
    ? (project.web_context[0] as WebContext | undefined) ?? null
    : (project.web_context as WebContext | null) ?? null

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
            <span className={`text-xs px-2 py-1 rounded font-medium ${
              isWebProject
                ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            }`}>
              {isWebProject ? "Sitio Web" : "Paid Media"}
            </span>
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
              {isWebProject ? (
                <span>
                  {webPhases.filter((p) => p.status === "done").length}/{webPhases.length} fases
                </span>
              ) : (
                <span>{tasks.filter((t) => t.status === "Done").length}/{tasks.length} tareas</span>
              )}
            </div>
          </div>
          {project.description && (
            <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{project.description}</p>
          )}
        </CardContent>
      </Card>

      {/* KPI row (admin only) */}
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

      {/* ===== PAID MEDIA HUB ===== */}
      {isPaidMedia && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">Hub Paid Media</h2>
          <PaidMediaContextCard
            projectId={project.id}
            context={paidMediaContext}
            isAdmin={isAdmin}
          />
          <PaidMediaCyclesPanel
            projectId={project.id}
            initialCycles={paidMediaCycles as any}
            isAdmin={isAdmin}
          />
        </section>
      )}

      {/* ===== SITIO WEB HUB ===== */}
      {isWebProject && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">Hub Sitio Web</h2>
          <WebContextCard
            projectId={project.id}
            context={webContext}
            isAdmin={isAdmin}
          />
          <WebPhaseStepper
            projectId={project.id}
            initialPhases={webPhases as any}
            isAdmin={isAdmin}
          />
        </section>
      )}

      {/* ===== PROJECT LOG ===== */}
      <ProjectLog
        projectId={project.id}
        initialEntries={logEntries as any}
        currentUserId={user!.id}
        isAdmin={isAdmin}
      />

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

      {/* Tasks — shown for both types */}
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
