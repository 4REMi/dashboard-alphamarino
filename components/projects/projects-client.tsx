"use client"

import { useState, useEffect } from "react"
import { ProjectCard } from "@/components/projects/project-card"
import { ArchivedProjectsSection } from "@/components/projects/archived-projects-section"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { LayoutGrid, List } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Project } from "@/lib/types"

// Compact list row for the list view
function ProjectRow({ project, canViewFinancials }: {
  project: Parameters<typeof ProjectCard>[0]["project"]
  canViewFinancials: boolean
}) {
  const pt = project.project_type
  const Icon = pt?.icon ? getProjectTypeIcon(pt.icon) : null

  return (
    <a href={`/projects/${project.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors border-b last:border-b-0">
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

      {/* Name + customer */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{project.name}</p>
        {project.customer && <p className="text-xs text-muted-foreground truncate">{(project.customer as { name: string }).name}</p>}
      </div>

      {/* Status badge — only Completed */}
      {project.status === "Completed" && (
        <span className="text-xs bg-success-subtle text-success-subtle-foreground px-2 py-0.5 rounded-full font-medium flex-shrink-0">
          Completado
        </span>
      )}

      {/* Progress */}
      <div className="hidden sm:flex items-center gap-2 w-32 flex-shrink-0">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${project.progress}%` }} />
        </div>
        <span className="text-xs text-muted-foreground w-7 text-right">{project.progress}%</span>
      </div>
    </a>
  )
}

type ViewMode = "grid" | "list"
type StatusFilter = "active" | "completed"

interface Props {
  active: Parameters<typeof ProjectCard>[0]["project"][]
  completed: Parameters<typeof ProjectCard>[0]["project"][]
  archived: Project[]
  canViewFinancials: boolean
  canEditProjects: boolean
  isAdminOrSubadmin: boolean
}

export function ProjectsClient({ active, completed, archived, canViewFinancials, canEditProjects, isAdminOrSubadmin }: Props) {
  const [view, setView] = useState<ViewMode>("grid")
  const [tab, setTab] = useState<StatusFilter>("active")

  // Persist view preference
  useEffect(() => {
    const saved = localStorage.getItem("projects-view") as ViewMode | null
    if (saved) setView(saved)
  }, [])
  function setViewPersist(v: ViewMode) {
    setView(v); localStorage.setItem("projects-view", v)
  }

  const projects = tab === "active" ? active : completed

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-center gap-2">
        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1 flex-1">
          {([
            { value: "active",    label: `Activos (${active.length})` },
            { value: "completed", label: `Completados (${completed.length})` },
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

        {/* Grid / List toggle */}
        <div className="flex items-center border rounded-lg overflow-hidden bg-card">
          <button
            onClick={() => setViewPersist("grid")}
            className={cn("p-2 transition-colors", view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            title="Vista cuadrícula"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewPersist("list")}
            className={cn("p-2 transition-colors", view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            title="Vista lista"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Project grid or list */}
      {projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {tab === "active" ? "No hay proyectos activos." : "No hay proyectos completados."}
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
