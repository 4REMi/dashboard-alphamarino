import { notFound } from "next/navigation"
import Link from "next/link"
import { getProject, getProjectCycles, getProjectLog } from "@/lib/actions/projects"
import { getEmployees } from "@/lib/actions/employees"
import { getIncome, getProjectExpenses } from "@/lib/actions/finances"
import { getProjectTypes } from "@/lib/actions/config"
import { getCustomers } from "@/lib/actions/customers"
import { ProjectForm } from "@/components/projects/project-form"
import { TaskForm } from "@/components/tasks/task-form"
import { TaskTable } from "@/components/tasks/task-table"
import { TeamManager } from "@/components/projects/team-manager"
import { ProjectPhases } from "@/components/projects/project-phases"
import { PaidMediaContextCard } from "@/components/projects/hub/paid-media-context-card"
import { PaidMediaCycleCard } from "@/components/projects/hub/paid-media-cycle-card"
import { PaidMediaCycleHistory } from "@/components/projects/hub/paid-media-cycle-history"
import { WebContextCard } from "@/components/projects/hub/web-context-card"
import { ProjectLog } from "@/components/projects/hub/project-log"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft, CalendarDays, DollarSign } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Customer, Profile, Task, ProjectType, PaidMediaContext, PaidMediaCycle, WebProjectContext, ProjectLogEntry, ProjectPhase } from "@/lib/types"

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
  const role = profile?.role ?? "employee"
  const isAdmin = role === "admin"
  const isAdminOrSubadmin = role === "admin" || role === "subadmin"

  const projectType = project.project_type as { name: string } | null
  const isPaidMedia = projectType?.name?.toLowerCase().includes("paid media") || projectType?.name?.toLowerCase().includes("media")
  const hasPhases = (project.phases ?? []).length > 0

  const [employees, customers, projectTypes, income, expenses, cycles, logEntries] = await Promise.all([
    getEmployees().catch(() => []),
    getCustomers().catch(() => []),
    getProjectTypes().catch(() => []),
    isAdminOrSubadmin ? getIncome(id).catch(() => []) : Promise.resolve([]),
    isAdminOrSubadmin ? getProjectExpenses(id).catch(() => []) : Promise.resolve([]),
    isPaidMedia ? getProjectCycles(id).catch(() => []) : Promise.resolve([]),
    getProjectLog(id).catch(() => []),
  ])

  const tasks = (project.tasks ?? []) as Task[]
  const members = (project.members ?? []).map((m: { profile: Profile }) => m.profile)
  const phases = (project.phases ?? []) as ProjectPhase[]

  // Extract one-to-one relations (Supabase may return as array)
  function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
    if (Array.isArray(val)) return val[0] ?? null
    return val ?? null
  }
  const paidMediaContext = unwrapSingle(project.paid_media_context) as PaidMediaContext | null
  const webContext = unwrapSingle(project.web_project_context) as WebProjectContext | null

  const activeCycle = (cycles as PaidMediaCycle[]).find((c) => c.is_active) ?? null
  const historyCycles = (cycles as PaidMediaCycle[]).filter((c) => !c.is_active)

  const totalIncome = income.reduce((s, i) => s + Number(i.amount), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const projectValue = project.project_value ?? 0
  const cashCollected = totalIncome
  const accountsReceivable = projectValue - cashCollected

  const config = statusConfig[project.status as keyof typeof statusConfig] ?? statusConfig["Planning"]

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <Link href="/projects">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="w-4 h-4" />
          Proyectos
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Badge variant={config.variant}>{config.label}</Badge>
            {projectType && (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground font-medium">
                {projectType.name}
              </span>
            )}
          </div>
          {project.customer && (
            <Link href={`/customers/${project.customer_id}`} className="text-sm text-muted-foreground hover:text-primary mt-1 inline-block">
              {(project.customer as { name: string }).name}
            </Link>
          )}
        </div>
        {isAdminOrSubadmin && (
          <ProjectForm
            project={project as Parameters<typeof ProjectForm>[0]["project"]}
            customers={customers as Customer[]}
            projectTypes={projectTypes as ProjectType[]}
            trigger={<Button variant="outline" size="sm">Editar</Button>}
          />
        )}
      </div>

      {/* Progress card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Progreso</h2>
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
            {project.project_value && (
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                <span>Valor: {formatCurrency(project.project_value)}</span>
              </div>
            )}
          </div>
          {project.description && (
            <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{project.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Finances (admin + subadmin) */}
      {isAdminOrSubadmin && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Project Value</p>
              <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(projectValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Cash Collected</p>
              <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(cashCollected)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Por Cobrar</p>
              <p className={`text-xl font-bold mt-1 ${accountsReceivable > 0 ? "text-amber-500" : "text-green-600"}`}>
                {formatCurrency(accountsReceivable)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Paid Media Hub */}
      {isPaidMedia && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Hub Paid Media</h2>
          <PaidMediaContextCard
            projectId={project.id}
            context={paidMediaContext}
            canEdit={isAdminOrSubadmin}
          />
          <PaidMediaCycleCard
            projectId={project.id}
            activeCycle={activeCycle}
            context={paidMediaContext}
            canEdit={isAdminOrSubadmin}
            onCycleClosed={() => {}}
            onCycleCreated={() => {}}
          />
          {historyCycles.length > 0 && <PaidMediaCycleHistory cycles={historyCycles} />}
        </section>
      )}

      {/* Web Dev phases */}
      {hasPhases && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Fases del Proyecto</h2>
          {webContext !== null || !isPaidMedia ? (
            <WebContextCard
              projectId={project.id}
              context={webContext}
              canEdit={isAdminOrSubadmin}
            />
          ) : null}
          <ProjectPhases
            projectId={project.id}
            initialPhases={phases}
            canEdit={isAdminOrSubadmin}
          />
        </section>
      )}

      {/* Bitácora */}
      <ProjectLog
        projectId={project.id}
        initialEntries={logEntries as ProjectLogEntry[]}
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
          isAdmin={isAdminOrSubadmin}
        />
      </div>

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Tareas ({tasks.length})</h2>
          {isAdminOrSubadmin && (
            <TaskForm projectId={project.id} employees={employees as Profile[]} />
          )}
        </div>
        <TaskTable
          tasks={tasks}
          projectId={project.id}
          employees={employees as Profile[]}
          isAdmin={isAdminOrSubadmin}
        />
      </div>
    </div>
  )
}
