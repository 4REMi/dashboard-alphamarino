import { createClient } from "@/lib/supabase/server"
import { getProjects } from "@/lib/actions/projects"
import { getCustomers } from "@/lib/actions/customers"
import { getProjectTypes } from "@/lib/actions/config"
import { ProjectCard } from "@/components/projects/project-card"
import { ProjectForm } from "@/components/projects/project-form"
import { ArchivedProjectsSection } from "@/components/projects/archived-projects-section"
import type { Customer, Project, ProjectType } from "@/lib/types"
import { can } from "@/lib/permissions"

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role, permissions").eq("id", user!.id).single()
  const isAdminOrSubadmin = profile?.role === "admin" || profile?.role === "subadmin"
  const canEditProjects = can(profile, "edit_projects")
  const canViewAll = can(profile, "view_all_projects")
  const canViewFinancials = can(profile, "view_project_financials")

  const [allProjects, customers, projectTypes] = await Promise.all([
    getProjects(true).catch(() => []),
    getCustomers().catch(() => []),
    canEditProjects ? getProjectTypes().catch(() => []) : Promise.resolve([]),
  ])

  const allList = (allProjects as Project[]).filter((p) =>
    canViewAll || (p.members as unknown as string[])?.includes(user!.id)
  )
  const projectList = allList.filter((p) => p.status !== "Archived")
  const archived = allList.filter((p) => p.status === "Archived")

  const inProgress = projectList.filter((p) => p.status === "In Progress")
  const planning = projectList.filter((p) => p.status === "Planning")
  const review = projectList.filter((p) => p.status === "Review")
  const completed = projectList.filter((p) => p.status === "Completed")
  const needsAttention = projectList.filter((p) => {
    const a = (p as Project & { attention?: { hasOverdueTasks: boolean; hasBlockedPhase: boolean; inactiveForDays: number } }).attention
    return a && (a.hasOverdueTasks || a.hasBlockedPhase || a.inactiveForDays > 7)
  })

  const sections = [
    { key: "attention", label: "Requieren Atención", items: needsAttention, color: "text-amber-600" },
    { key: "inprogress", label: "En Progreso", items: inProgress, color: "text-blue-600" },
    { key: "planning", label: "Planificación", items: planning, color: "" },
    { key: "review", label: "En Revisión", items: review, color: "text-yellow-600" },
    { key: "completed", label: "Completados", items: completed, color: "text-green-600" },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proyectos</h1>
          <p className="text-muted-foreground text-sm mt-1">{projectList.length} proyectos activos</p>
        </div>
        {canEditProjects && (
          <ProjectForm
            customers={customers as Customer[]}
            projectTypes={projectTypes as ProjectType[]}
            canViewFinancials={canViewFinancials}
          />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "En Progreso", count: inProgress.length, color: "text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300" },
          { label: "Planificación", count: planning.length, color: "text-muted-foreground bg-muted/40" },
          { label: "En Revisión", count: review.length, color: "text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-300" },
          { label: "Completados", count: completed.length, color: "text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-300" },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <p className="text-2xl font-bold">{stat.count}</p>
            <p className="text-sm font-medium mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {sections.map(({ key, label, items, color }) =>
        items.length > 0 ? (
          <section key={key}>
            <h2 className={`text-base font-semibold mb-3 ${color}`}>{label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((project) => (
                <ProjectCard key={project.id} project={project as Parameters<typeof ProjectCard>[0]["project"]} canViewFinancials={canViewFinancials} />
              ))}
            </div>
          </section>
        ) : null
      )}

      {projectList.length === 0 && archived.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No hay proyectos aún</p>
          {canEditProjects && <p className="text-sm mt-1">Crea el primer proyecto usando el botón de arriba</p>}
        </div>
      )}

      <ArchivedProjectsSection
        projects={archived as Parameters<typeof ArchivedProjectsSection>[0]["projects"]}
        isAdminOrSubadmin={canEditProjects}
      />
    </div>
  )
}
