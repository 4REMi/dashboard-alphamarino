import Link from "next/link"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CalendarDays, DollarSign, Users } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { Project } from "@/lib/types"

const statusConfig = {
  Planning: { label: "Planificación", variant: "secondary" as const },
  "In Progress": { label: "En Progreso", variant: "info" as const },
  Review: { label: "Revisión", variant: "warning" as const },
  Completed: { label: "Completado", variant: "success" as const },
}

interface ProjectCardProps {
  project: Project & {
    customer?: { name: string; company?: string | null } | null
  }
  memberCount?: number
}

export function ProjectCard({ project, memberCount }: ProjectCardProps) {
  const config = statusConfig[project.status]

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="hover:shadow-md transition-all cursor-pointer group">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
                {project.name}
              </h3>
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

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {project.end_date && (
              <div className="flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" />
                <span>{formatDate(project.end_date)}</span>
              </div>
            )}
            {project.budget && (
              <div className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                <span>{formatCurrency(project.budget)}</span>
              </div>
            )}
            {memberCount !== undefined && (
              <div className="flex items-center gap-1 ml-auto">
                <Users className="w-3.5 h-3.5" />
                <span>{memberCount}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
