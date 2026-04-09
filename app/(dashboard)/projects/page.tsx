import { createClient } from "@/lib/supabase/server"
import { getProjects } from "@/lib/actions/projects"
import { getCustomers } from "@/lib/actions/customers"
import { getProjectTypes } from "@/lib/actions/config"
import { ProjectForm } from "@/components/projects/project-form"
import { ProjectsClient } from "@/components/projects/projects-client"
import type { Customer, Project, ProjectType } from "@/lib/types"
import { can } from "@/lib/permissions"
import { getTranslations } from "next-intl/server"

export default async function ProjectsPage() {
  const t = await getTranslations("projects")
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role, permissions").eq("id", user!.id).single()
  const canEditProjects   = can(profile, "edit_projects")
  const canViewAll        = can(profile, "view_all_projects")
  const canViewFinancials = can(profile, "view_project_financials")
  const isAdminOrSubadmin = profile?.role === "admin" || profile?.role === "subadmin"

  const [allProjects, customers, projectTypes] = await Promise.all([
    getProjects(true).catch(() => []),
    getCustomers().catch(() => []),
    canEditProjects ? getProjectTypes().catch(() => []) : Promise.resolve([]),
  ])

  const visible = (allProjects as Project[]).filter((p) =>
    canViewAll || (p.members as unknown as string[])?.includes(user!.id)
  )

  const active    = visible.filter((p) => p.status === "Active")
  const completed = visible.filter((p) => p.status === "Completed")
  const archived  = visible.filter((p) => p.status === "Archived")

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("countLabel", { count: active.length + completed.length })}
          </p>
        </div>
        {canEditProjects && (
          <ProjectForm
            customers={customers as Customer[]}
            projectTypes={projectTypes as ProjectType[]}
            canViewFinancials={canViewFinancials}
          />
        )}
      </div>

      <ProjectsClient
        active={active as Parameters<typeof ProjectsClient>[0]["active"]}
        completed={completed as Parameters<typeof ProjectsClient>[0]["completed"]}
        archived={archived as Project[]}
        canViewFinancials={canViewFinancials}
        canEditProjects={canEditProjects}
        isAdminOrSubadmin={isAdminOrSubadmin}
      />
    </div>
  )
}
