import Link from "next/link"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CalendarDays, DollarSign, AlertTriangle } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Project } from "@/lib/types"

const statusConfig = {
  Planning: { label: "Planificación", variant: "secondary" as const },
  "In Progress": { label: "En Progreso", variant: "info" as const },
  Review: { label: "Revisión", variant: "warning" as const },
  Completed: { label: "Completado", variant: "success" as const },
  Archived: { label: "Archivado", variant: "secondary" as const },
}

interface ProjectCardProps {
  project: Project & {
    customer?: { name: string; company?: string | null } | null
    project_type?: { name: string } | null
    attention?: {
      hasOverdueTasks: boolean
      hasBlockedPhase: boolean
      hasPendingCycleReport: boolean
      inactiveForDays: number
    }
  }
  canViewFinancials?: boolean
}

export function ProjectCard({ project, canViewFinancials = false }: ProjectCardProps) {
  const config = statusConfig[project.status] ?? statusConfig["Planning"]
  const attention = project.attention
  const needsAttention = attention && (
    attention.hasOverdueTasks ||
    attention.hasBlockedPhase ||
    attention.hasPendingCycleReport ||
    attention.inactiveForDays > 7
  )

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className={`hover:shadow-md transition-all cursor-pointer group ${needsAttention ? "border-amber-400/50 dark:border-amber-600/50" : ""}`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
                  {project.name}
                </h3>
                {project.project_type && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium flex-shrink-0">
                    {project.project_type.name}
                  </span>
                )}
                {needsAttention && (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                )}
              </div>
              {project.customer && (
                <p className="text-xs text-muted-foreground mt-0.5">{project.customer.name}</p>
              )}
            </div>
            <Badge variant={config.variant} className="ml-2 flex-shrink-0">{config.label}</Badge>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progreso</span>
              <span className="font-semibold text-foreground">{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-2" />
          </div>

          {/* Attention flags */}
          {needsAttention && (
            <div className="flex flex-wrap gap-1 mb-3">
              {attention?.hasOverdueTasks && (
                <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded">Tareas vencidas</span>
              )}
              {attention?.hasBlockedPhase && (
                <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Fase bloqueada</span>
              )}
              {attention?.inactiveForDays > 7 && (
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{attention.inactiveForDays}d sin actividad</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {project.end_date && (
              <div className="flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" />
                <span>{formatDate(project.end_date)}</span>
              </div>
            )}
            {canViewFinancials && project.project_value && (
              <div className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                <span>{formatCurrency(project.project_value)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
