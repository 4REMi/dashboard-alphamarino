import { notFound } from "next/navigation"
import Link from "next/link"
import { getProject, getProjectCycles, getProjectLog, getProjectMembers } from "@/lib/actions/projects"
import { getEmployees } from "@/lib/actions/employees"
import { getIncome, getProjectExpenses } from "@/lib/actions/finances"
import { getProjectTypes, getPhaseSets } from "@/lib/actions/config"
import { getCustomers } from "@/lib/actions/customers"
import { getProjectDeliverables } from "@/lib/actions/deliverables"
import { getSops } from "@/lib/actions/sops"
import { getCreativeConcepts, getCreativeAssets } from "@/lib/actions/creatives"
import { getMetaCampaigns } from "@/lib/actions/meta"
import { getProjectIntegrations } from "@/lib/actions/integrations"
import { IntegrationsCard } from "@/components/projects/hub/integrations-card"
import { CreativesHub } from "@/components/projects/hub/creatives/creatives-hub"
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
import { ExpandableDescription } from "@/components/projects/expandable-description"
import { DeliverablesSectionClient } from "@/components/projects/deliverables-section"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { ArrowLeft, CalendarDays, Plus } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Customer, Profile, Project, Task, ProjectType, PaidMediaContext, PaidMediaCycle, WebProjectContext, ProjectLogEntry, ProjectPhase, Deliverable, Sop, CreativeConcept, CreativeAsset, MetaCampaign, ProjectIntegration } from "@/lib/types"
import { can } from "@/lib/permissions"
import { getProjectTypeIcon } from "@/lib/project-type-icons"


export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let project: Awaited<ReturnType<typeof getProject>> | null = null
  try { project = await getProject(id) } catch { notFound() }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role, permissions").eq("id", user!.id).single()
  const role = profile?.role ?? "employee"
  const isAdmin           = role === "admin"
  const isAdminOrSubadmin = role === "admin" || role === "subadmin"

  const canViewFinancials = can(profile as Profile, "view_project_financials")
  const canEditProjects   = can(profile as Profile, "edit_projects")
  const canManageTeam     = can(profile as Profile, "manage_team")
  const canManageTasks    = can(profile as Profile, "manage_tasks")

  const projectType = project.project_type as { name: string; color?: string | null; icon?: string | null } | null
  const isPaidMedia = projectType?.name?.toLowerCase().includes("paid media") ||
                      projectType?.name?.toLowerCase().includes("media")
  const hasPhases   = (project.phases ?? []).length > 0
  const isArchived  = project.status === "Archived"

  const [employees, customers, projectTypes, phaseSets, income, expenses, cycles, logEntries, members, rawDeliverables, sops] = await Promise.all([
    getEmployees().catch(() => []),
    getCustomers().catch(() => []),
    getProjectTypes().catch(() => []),
    getPhaseSets().catch(() => []),
    canViewFinancials ? getIncome(id).catch(() => [])          : Promise.resolve([]),
    canViewFinancials ? getProjectExpenses(id).catch(() => []) : Promise.resolve([]),
    isPaidMedia       ? getProjectCycles(id).catch(() => [])   : Promise.resolve([]),
    getProjectLog(id).catch(() => []),
    getProjectMembers(id).catch(() => []),
    getProjectDeliverables(id).catch(() => []),
    isAdminOrSubadmin ? getSops().catch(() => []) : Promise.resolve([]),
  ])

  const tasks  = (project.tasks  ?? []) as Task[]
  const phases = (project.phases ?? []) as ProjectPhase[]
  const deliverables = rawDeliverables as Deliverable[]
  const deliverablesByTaskId = Object.fromEntries(
    deliverables.map((d) => [d.task_id, d])
  ) as Record<string, Deliverable>

  function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
    if (Array.isArray(val)) return val[0] ?? null
    return val ?? null
  }
  const paidMediaContext = unwrapSingle(project.paid_media_context)  as PaidMediaContext  | null
  const webContext       = unwrapSingle(project.web_project_context) as WebProjectContext | null

  const activeCycle   = (cycles as PaidMediaCycle[]).find((c) =>  c.is_active) ?? null
  const historyCycles = (cycles as PaidMediaCycle[]).filter((c) => !c.is_active)

  // Fetch initial creatives + meta campaigns + integrations for active cycle
  const [initialConcepts, initialAssets, initialMetaCampaigns, integrations] = isPaidMedia
    ? await Promise.all([
        getCreativeConcepts(id, activeCycle?.id ?? null).catch(() => []),
        getCreativeAssets(id, activeCycle?.id ?? null).catch(() => []),
        activeCycle ? getMetaCampaigns(id, activeCycle.id).catch(() => []) : Promise.resolve([]),
        getProjectIntegrations(id).catch(() => []),
      ])
    : [[], [], [], []]

  const totalIncome        = income.reduce((s, i) => s + Number(i.amount), 0)
  const totalExpenses      = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const projectValue       = project.project_value ?? 0
  const accountsReceivable = projectValue - totalIncome

  const memberProfiles = members as Profile[]

  const hasContextSection = hasPhases || (isAdminOrSubadmin && phaseSets.length > 0) || isPaidMedia

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 sticky top-0 z-10">
        <div className="px-6 pt-4 pb-3">

          {/* Row 1: back · name · badges · actions */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/projects"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <h1 className="text-lg font-bold truncate flex-1">{project.name}</h1>

            <div className="flex items-center gap-2 flex-shrink-0">
              {project.status === "Completed" && <Badge variant="success" className="text-xs">Completado</Badge>}
              {project.status === "Archived"  && <Badge variant="secondary" className="text-xs">Archivado</Badge>}
              {projectType && (() => {
                const Icon       = getProjectTypeIcon(projectType.icon ?? null)
                const colorStyle = projectType.color ? {
                  backgroundColor: projectType.color + "22",
                  color: projectType.color,
                  border: `1px solid ${projectType.color}44`,
                } : undefined
                return Icon ? (
                  <span
                    title={projectType.name}
                    className={`p-1.5 rounded inline-flex items-center justify-center${!projectType.color ? " bg-secondary text-secondary-foreground" : ""}`}
                    style={colorStyle}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                ) : (
                  <span
                    className={`hidden sm:inline text-xs px-2 py-0.5 rounded font-medium${!projectType.color ? " bg-secondary text-secondary-foreground" : ""}`}
                    style={colorStyle}
                  >
                    {projectType.name}
                  </span>
                )
              })()}
            </div>

            <ProjectActions
              projectId={project.id}
              status={project.status as import("@/lib/types").ProjectStatus}
              isAdmin={isAdmin}
              isAdminOrSubadmin={canEditProjects}
              project={canEditProjects ? project as Project : undefined}
              customers={customers as Customer[]}
              projectTypes={projectTypes as ProjectType[]}
              canViewFinancials={canViewFinancials}
            />
          </div>

          {/* Row 2: client · dates · progress */}
          <div className="flex items-center gap-4 mt-2 ml-9 flex-wrap">
            {project.customer && (
              <Link
                href={`/customers/${project.customer_id}`}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
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
            <div className="flex items-center gap-2 flex-1 max-w-xs min-w-24">
              <Progress value={project.progress} className="h-1.5 flex-1" />
              <span className="text-xs font-semibold text-primary flex-shrink-0">{project.progress}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Page body ──────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 space-y-6">

        {/* Description — full width, expandable */}
        {project.description && (
          <div className="border border-border rounded-xl px-5 py-4 bg-card">
            <ExpandableDescription text={project.description} />
          </div>
        )}

        {/* ── Phases — full width, above tasks ───────────────────────── */}
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
            <ProjectPhases
              projectId={project.id}
              initialPhases={phases}
              canEdit={isAdminOrSubadmin}
              taskCountByPhaseId={Object.fromEntries(
                phases.map((ph) => {
                  const phaseTasks = tasks.filter((t) => t.phase_id === ph.id)
                  return [ph.id, { done: phaseTasks.filter((t) => t.status === "Done").length, total: phaseTasks.length }]
                }).filter(([, v]) => (v as { total: number }).total > 0)
              )}
            />
          </section>
        )}

        {/* ── Tasks — full width ──────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">
              Tareas
              <span className="ml-2 font-normal text-muted-foreground">({tasks.length})</span>
            </h2>
            {canManageTasks && (
              <TaskForm
                projectId={project.id}
                employees={employees as Profile[]}
                trigger={
                  <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
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
            deliverablesByTaskId={deliverablesByTaskId}
            currentUserId={user!.id}
            sops={sops as Sop[]}
          />
        </section>

        {/* ── Entregables ────────────────────────────────────────────── */}
        {deliverables.length > 0 && (
          <DeliverablesSectionClient
            deliverables={deliverables}
            projectId={project.id}
            isAdmin={canManageTasks}
          />
        )}

        {/* ── Lower grid: context hubs (left) + sidebar (right) ─────── */}
        {(hasContextSection || true) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

            {/* Left: web context + paid media hub */}
            <div className="lg:col-span-2 space-y-6">
              {webContext !== null && !isPaidMedia && (
                <section>
                  <WebContextCard projectId={project.id} context={webContext} canEdit={isAdminOrSubadmin} />
                </section>
              )}

              {isPaidMedia && (
                <section className="space-y-4">
                  <h2 className="text-sm font-semibold">Hub Paid Media</h2>
                  {webContext !== null && (
                    <WebContextCard projectId={project.id} context={webContext} canEdit={isAdminOrSubadmin} />
                  )}
                  <PaidMediaContextCard projectId={project.id} context={paidMediaContext} canEdit={isAdminOrSubadmin} />
                  <IntegrationsCard     projectId={project.id} integrations={integrations as ProjectIntegration[]} canEdit={isAdminOrSubadmin} />
                  <PaidMediaCycleCard   projectId={project.id} activeCycle={activeCycle} context={paidMediaContext} canEdit={isAdminOrSubadmin} initialCampaigns={initialMetaCampaigns as MetaCampaign[]} hasMetaConnected={!!(integrations as ProjectIntegration[]).find((i) => i.platform === "meta")} />
                  {historyCycles.length > 0 && <PaidMediaCycleHistory cycles={historyCycles} />}
                </section>
              )}

              {/* Placeholder so the left column always exists and grid holds its shape */}
              {webContext === null && !isPaidMedia && <div />}
            </div>

            {/* Right: sidebar */}
            <div className="space-y-4 lg:sticky lg:top-[89px]">

              {/* Team */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Equipo</h3>
                    <span className="text-xs text-muted-foreground">{memberProfiles.length} miembros</span>
                  </div>

                  <TeamManager
                    projectId={project.id}
                    members={memberProfiles}
                    allEmployees={employees as Profile[]}
                    isAdmin={canManageTeam}
                  />
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
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold mb-3">Finanzas</h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor del proyecto</span>
                        <span className="font-semibold">{formatCurrency(projectValue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cobrado</span>
                        <span className="font-semibold text-success">{formatCurrency(totalIncome)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-muted-foreground">Por cobrar</span>
                        <span className={`font-semibold ${accountsReceivable > 0 ? "text-warning" : "text-success"}`}>
                          {formatCurrency(accountsReceivable)}
                        </span>
                      </div>
                      {project.monthly_fee && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Fee mensual</span>
                          <span className="font-semibold">{formatCurrency(project.monthly_fee)}</span>
                        </div>
                      )}
                      {totalExpenses > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Gastos del proyecto</span>
                          <span className="font-semibold text-destructive">{formatCurrency(totalExpenses)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── Creative Tracker — full width, own section ──────────────── */}
        {isPaidMedia && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Creative Tracker</h2>
            </div>
            <CreativesHub
              projectId={project.id}
              cycles={cycles as PaidMediaCycle[]}
              initialConcepts={initialConcepts as CreativeConcept[]}
              initialAssets={initialAssets as CreativeAsset[]}
              isAdminOrSubadmin={isAdminOrSubadmin}
            />
          </section>
        )}
      </div>
    </div>
  )
}
