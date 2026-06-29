"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { ProjectCard } from "@/components/projects/project-card"
import { ArchivedProjectsSection } from "@/components/projects/archived-projects-section"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { phaseColor } from "@/lib/phase-colors"
import { LayoutGrid, List } from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import type { Project } from "@/lib/types"

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

// Compact list row for the list view
function ProjectRow({ project, canViewFinancials }: {
  project: Parameters<typeof ProjectCard>[0]["project"]
  canViewFinancials: boolean
}) {
  const tP = useTranslations("projects")
  const pt      = project.project_type
  const Icon    = pt?.icon ? getProjectTypeIcon(pt.icon) : null
  const members = ((project.members ?? []) as Array<{ id: string; full_name: string; avatar_url: string | null }>).slice(0, 3)

  const phases     = (project.phases ?? []) as Array<{ id: string; name: string; status: string; phase_order: number }>
  const sorted     = [...phases].sort((a, b) => a.phase_order - b.phase_order)
  const activePhase = sorted.find((p) => p.status === "blocked") ?? sorted.find((p) => p.status === "in_progress")

  const projectValue = project.project_value ?? 0
  const totalIncome  = ((project.income ?? []) as { amount: number }[]).reduce((s, i) => s + i.amount, 0)
  const receivable   = Math.max(0, projectValue - totalIncome)

  return (
    <a href={`/projects/${project.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors border-b last:border-b-0">
      {/* Type icon */}
      <span
        className={cn("w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-xs font-bold",
          !pt?.color && "bg-secondary text-secondary-foreground"
        )}
        style={pt?.color ? { backgroundColor: pt.color + "22", color: pt.color } : undefined}
        title={pt?.name}
      >
        {Icon ? <Icon className="w-3.5 h-3.5" /> : (pt?.name?.slice(0, 2) ?? "—")}
      </span>

      {/* Name + customer + active phase */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{project.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {project.customer && <p className="text-xs text-muted-foreground truncate">{(project.customer as { name: string }).name}</p>}
          {activePhase && (() => {
            const pc = phaseColor(activePhase.phase_order)
            return (
              <span className={cn("text-xs flex items-center gap-1 flex-shrink-0", pc.text)}>
                <span className={cn("w-1.5 h-1.5 rounded-full inline-block flex-shrink-0", pc.bg)} />
                {activePhase.name}
                {activePhase.status === "blocked" && <span className="text-destructive">· {tP("blockedLabel")}</span>}
              </span>
            )
          })()}
        </div>
      </div>

      {/* Financials */}
      {canViewFinancials && projectValue > 0 && (
        <div className="hidden md:flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{formatCurrency(projectValue)}</span>
          {receivable > 0 && <span className="text-xs text-warning font-medium">{formatCurrency(receivable)} p/c</span>}
        </div>
      )}

      {/* Status badge — only Completed */}
      {project.status === "Completed" && (
        <span className="text-xs bg-success-subtle text-success-subtle-foreground px-2 py-0.5 rounded-full font-medium flex-shrink-0">
          {tP("completed")}
        </span>
      )}

      {/* Progress */}
      <div className="hidden sm:flex items-center gap-2 w-28 flex-shrink-0">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${project.progress}%` }} />
        </div>
        <span className="text-xs text-muted-foreground w-7 text-right">{project.progress}%</span>
      </div>

      {/* Team avatars */}
      {members.length > 0 && (
        <div className="hidden sm:flex items-center flex-shrink-0">
          {members.map((m, i) => (
            <Avatar key={m.id} className="w-6 h-6 border-2 border-card" style={{ marginLeft: i === 0 ? 0 : "-6px" }}>
              {m.avatar_url
                ? <img src={m.avatar_url} alt={m.full_name} className="h-full w-full object-cover" />
                : <AvatarFallback className="text-[9px] bg-muted">{initials(m.full_name)}</AvatarFallback>}
            </Avatar>
          ))}
        </div>
      )}
    </a>
  )
}

type ViewMode = "grid" | "list"
type StatusFilter = "active" | "completed"
type TypeFilter = string | null

interface Props {
  active: Parameters<typeof ProjectCard>[0]["project"][]
  completed: Parameters<typeof ProjectCard>[0]["project"][]
  archived: Project[]
  canViewFinancials: boolean
  canEditProjects: boolean
  isAdminOrSubadmin: boolean
}

export function ProjectsClient({ active, completed, archived, canViewFinancials, canEditProjects, isAdminOrSubadmin }: Props) {
  const tP = useTranslations("projects")
  const [view, setView] = useState<ViewMode>("grid")
  const [tab, setTab] = useState<StatusFilter>("active")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(null)

  // Persist view preference
  useEffect(() => {
    const saved = localStorage.getItem("projects-view") as ViewMode | null
    if (saved) setView(saved)
  }, [])
  function setViewPersist(v: ViewMode) {
    setView(v); localStorage.setItem("projects-view", v)
  }

  // Extract unique project types from all projects
  const allProjects = [...active, ...completed]
  const projectTypes = Array.from(
    new Map(
      allProjects
        .filter((p) => p.project_type)
        .map((p) => {
          const pt = p.project_type as { id: string; name: string; icon?: string; color?: string }
          return [pt.id, pt]
        })
    ).values()
  )

  const baseProjects = tab === "active" ? active : completed
  const projects = typeFilter
    ? baseProjects.filter((p) => (p.project_type as any)?.id === typeFilter)
    : baseProjects

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-center gap-2">
        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1 flex-1">
          {([
            { value: "active",    label: `${tP("tabActive")} (${active.length})` },
            { value: "completed", label: `${tP("tabCompleted")} (${completed.length})` },
          ] as { value: StatusFilter; label: string }[]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                tab === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        {projectTypes.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTypeFilter(null)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                !typeFilter
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              Todos
            </button>
            {projectTypes.map((pt) => {
              const Icon = pt.icon ? getProjectTypeIcon(pt.icon) : null
              const isActive = typeFilter === pt.id
              return (
                <button
                  key={pt.id}
                  onClick={() => setTypeFilter(isActive ? null : pt.id)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {pt.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Grid / List toggle */}
        <div className="flex items-center border rounded-lg overflow-hidden bg-card">
          <button
            onClick={() => setViewPersist("grid")}
            className={cn("p-2 transition-colors", view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            title={tP("viewGrid")}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewPersist("list")}
            className={cn("p-2 transition-colors", view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            title={tP("viewList")}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Project grid or list */}
      {projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {typeFilter ? "Sin proyectos de este tipo" : tab === "active" ? tP("noActive") : tP("noCompleted")}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} canViewFinancials={canViewFinancials} />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} canViewFinancials={canViewFinancials} />
          ))}
        </div>
      )}

      {/* Archived */}
      <ArchivedProjectsSection
        projects={archived}
        isAdminOrSubadmin={isAdminOrSubadmin}
      />
    </div>
  )
}
