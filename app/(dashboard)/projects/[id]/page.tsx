import { notFound } from "next/navigation"
import Link from "next/link"
import { getProject, getProjectCycles, getProjectLog, getProjectMembers } from "@/lib/actions/projects"
import { getEmployees } from "@/lib/actions/employees"
import { getIncome, getProjectExpenses } from "@/lib/actions/finances"
import { getProjectTypes, getPhaseSets } from "@/lib/actions/config"
import { getCustomers } from "@/lib/actions/customers"
import { ProjectActions } from "@/components/projects/project-actions"
import { ApplyPhasesButton } from "@/components/projects/apply-phases-button"
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
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft, CalendarDays, Plus } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Customer, Profile, Project, Task, ProjectType, PaidMediaContext, PaidMediaCycle, WebProjectContext, ProjectLogEntry, ProjectPhase } from "@/lib/types"
import { can } from "@/lib/permissions"

const statusConfig = {
  Planning:    { label: "Planificación", variant: "secondary" as const },
  "In Progress": { label: "En Progreso",  variant: "info"      as const },
  Review:      { label: "Revisión",      variant: "warning"   as const },
  Completed:   { label: "Completado",    variant: "success"   as const },
  Archived:    { label: "Archivado",     variant: "secondary" as const },
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let project: Awaited<ReturnType<typeof getProject>> | null = null
  try { project = await getProject(id) } catch { notFound() }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role, permissions").eq("id", user!.id).single()
  const role = profile?.role ?? "employee"
  const isAdmin = role === "admin"
  const isAdminOrSubadmin = role === "admin" || role === "subadmin"

  const canViewFinancials = can(profile as Profile, "view_project_financials")
  const canEditProjects   = can(profile as Profile, "edit_projects")
  const canManageTeam     = can(profile as Profile, "manage_team")
  const canManageTasks    = can(profile as Profile, "manage_tasks")

  const projectType = project.project_type as { name: string } | null
  const isPaidMedia = projectType?.name?.toLowerCase().includes("paid media") || projectType?.name?.toLowerCase().includes("media")
  const hasPhases   = (project.phases ?? []).length > 0
  const isArchived  = project.status === "Archived"

  const [employees, customers, projectTypes, phaseSets, income, expenses, cycles, logEntries, members] = await Promise.all([
    getEmployees().catch(() => []),
    getCustomers().catch(() => []),
    getProjectTypes().catch(() => []),
    getPhaseSets().catch(() => []),
    canViewFinancials ? getIncome(id).catch(() => [])            : Promise.resolve([]),
    canViewFinancials ? getProjectExpenses(id).catch(() => [])   : Promise.resolve([]),
    isPaidMedia       ? getProjectCycles(id).catch(() => [])     : Promise.resolve([]),
    getProjectLog(id).catch(() => []),
    getProjectMembers(id).catch(() => []),
  ])

  const tasks  = (project.tasks  ?? []) as Task[]
  const phases = (project.phases ?? []) as ProjectPhase[]

  function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
    if (Array.isArray(val)) return val[0] ?? null
    return val ?? null
  }
  const paidMediaContext = unwrapSingle(project.paid_media_context)  as PaidMediaContext   | null
  const webContext       = unwrapSingle(project.web_project_context) as WebProjectContext  | null

  const activeCycle   = (cycles as PaidMediaCycle[]).find((c) =>  c.is_active) ?? null
  const historyCycles = (cycles as PaidMediaCycle[]).filter((c) => !c.is_active)

  const totalIncome      = income.reduce((s, i) => s + Number(i.amount), 0)
  const totalExpenses    = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const projectValue     = project.project_value ?? 0
  const accountsReceivable = projectValue - totalIncome

  const config = statusConfig[project.status as keyof typeof statusConfig] ?? statusConfig["Planning"]

  // Team member initials helper
  function initials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  }

  const memberProfiles = members as Profile[]
  const VISIBLE_AVATARS = 5

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Compact header ──────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40 sticky top-0 z-10">
        <div className="px-6 pt-4 pb-3 max-w-7xl">

          {/* Row 1: back + name + badges + actions */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/projects"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <h1 className="text-lg font-bold truncate flex-1">{project.name}</h1>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant={config.variant} className="text-xs">{config.label}</Badge>
              {projectType && (
                <span className="hidden sm:inline text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">
                  {projectType.name}
                </span>
              )}
            </div>

            <ProjectActions
              projectId={project.id}
              isArchived={isArchived}
              isAdmin={isAdmin}
              isAdminOrSubadmin={canEditProjects}
              project={canEditProjects ? project as Project : undefined}
              customers={customers as Customer[]}
              projectTypes={projectTypes as ProjectType[]}
              canViewFinancials={canViewFinancials}
            />
          </div>

          {/* Row 2: meta + progress */}
          <div className="flex items-center gap-4 mt-2 ml-9">
            {project.customer && (
              <Link
                href={`/customers/${project.customer_id}`}
                className="text-xs text-muted-foreground hover:text-primary transition-colors truncate"
              >
                {(project.customer as { name: string }).name}
              </Link>
            )}
            {(project.start_date || project.end_date) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                <CalendarDays className="w-3.5 h-3.5" />
                {project.start_date && formatDate(project.start_date)}
                {project.start_date && project.end_date && " → "}
                {project.end_date && formatDate(project.end_date)}
              </div>
            )}
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <Progress value={project.progress} className="h-1.5 flex-1" />
              <span className="text-xs font-semibold text-primary flex-shrink-0">{project.progress}%</span>
            </div>
            {project.description && (
              <p className="hidden lg:block text-xs text-muted-foreground truncate max-w-sm">{project.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Body: 2-column grid ─────────────────────────────────────────── */}
      <div className="flex-1 p-6">
        <div className="max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* ── Main column ──────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Tasks */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Tareas
                  <span className="ml-2 text-muted-foreground font-normal">({tasks.length})</span>
                </h2>
                {canManageTasks && (
                  <TaskForm
                    projectId={project.id}
                    employees={employees as Profile[]}
                    trigger={
                      <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Nueva tarea
                      </button>
                    }
                  />
                )}
              </div>
              <TaskTable
                tasks={tasks}
                projectId={project.id}
                employees={employees as Profile[]}
                isAdmin={canManageTasks}
              />
            </section>

            {/* Phases */}
            {(hasPhases || (isAdminOrSubadmin && phaseSets.length > 0)) && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Fases del Proyecto</h2>
                  {isAdminOrSubadmin && phaseSets.length > 0 && (
                    <ApplyPhasesButton
                      projectId={project.id}
                      phaseSets={phaseSets as Parameters<typeof ApplyPhasesButton>[0]["phaseSets"]}
                      defaultPhaseSetId={(project.project_type as { default_phase_set_id?: string } | null)?.default_phase_set_id ?? null}
                    />
                  )}
                </div>
                {(!isPaidMedia || webContext !== null) && (
                  <WebContextCard
                    projectId={project.id}
                    context={webContext}
                    canEdit={isAdminOrSubadmin}
                  />
                )}
                <ProjectPhases
                  projectId={project.id}
                  initialPhases={phases}
                  canEdit={isAdminOrSubadmin}
                />
              </section>
            )}

            {/* Paid Media Hub */}
            {isPaidMedia && (
              <section className="space-y-4">
                <h2 className="text-sm font-semibold">Hub Paid Media</h2>
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
                />
                {historyCycles.length > 0 && <PaidMediaCycleHistory cycles={historyCycles} />}
              </section>
            )}
          </div>

          {/* ── Sidebar ───────────────────────────────────────────────────── */}
          <div className="space-y-4 lg:sticky lg:top-[89px]">

            {/* Team */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Equipo</h3>
                  <span className="text-xs text-muted-foreground">{memberProfiles.length} miembros</span>
                </div>

                {/* Avatar stack + names */}
                <div className="space-y-2">
                  {memberProfiles.slice(0, VISIBLE_AVATARS).map((member) => (
                    <Link
                      key={member.id}
                      href={`/employees/${member.id}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors group"
                    >
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        {member.avatar_url ? (
                          <img src={member.avatar_url} alt={member.full_name} className="h-full w-full object-cover" />
                        ) : (
                          <AvatarFallback className="text-xs">{initials(member.full_name)}</AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{member.full_name}</p>
                        {member.position && (
                          <p className="text-xs text-muted-foreground truncate">{member.position}</p>
                        )}
                      </div>
                    </Link>
                  ))}

                  {memberProfiles.length > VISIBLE_AVATARS && (
                    <p className="text-xs text-muted-foreground pl-2">
                      +{memberProfiles.length - VISIBLE_AVATARS} más
                    </p>
                  )}

                  {memberProfiles.length === 0 && (
                    <p className="text-xs text-muted-foreground py-1">Sin miembros asignados</p>
                  )}
                </div>

                {/* Add member control */}
                {canManageTeam && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <TeamManager
                      projectId={project.id}
                      members={memberProfiles}
                      allEmployees={employees as Profile[]}
                      isAdmin={canManageTeam}
                      addOnly
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Log */}
            <ProjectLog
              projectId={project.id}
              initialEntries={logEntries as ProjectLogEntry[]}
              currentUserId={user!.id}
              isAdmin={isAdmin}
              compact
            />

            {/* Finances */}
            {canViewFinancials && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Finanzas</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Valor del proyecto</span>
                      <span className="text-xs font-semibold">{formatCurrency(projectValue)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Cobrado</span>
                      <span className="text-xs font-semibold text-green-600">{formatCurrency(totalIncome)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t pt-2">
                      <span className="text-xs text-muted-foreground">Por cobrar</span>
                      <span className={`text-xs font-semibold ${accountsReceivable > 0 ? "text-amber-500" : "text-green-600"}`}>
                        {formatCurrency(accountsReceivable)}
                      </span>
                    </div>
                    {project.monthly_fee && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Fee mensual</span>
                        <span className="text-xs font-semibold">{formatCurrency(project.monthly_fee)}</span>
                      </div>
                    )}
                    {totalExpenses > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Gastos</span>
                        <span className="text-xs font-semibold text-red-500">{formatCurrency(totalExpenses)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
