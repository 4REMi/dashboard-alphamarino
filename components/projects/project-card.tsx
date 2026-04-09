"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CalendarDays, DollarSign, AlertTriangle } from "lucide-react"
import { formatDate, formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Project } from "@/lib/types"
import { getProjectTypeIcon } from "@/lib/project-type-icons"
import { phaseColor } from "@/lib/phase-colors"

interface Member { id: string; full_name: string; avatar_url: string | null }
interface Phase  { id: string; name: string; status: string; phase_order: number }

interface ProjectCardProps {
  project: Project & {
    customer?: { name: string; company?: string | null } | null
    project_type?: { name: string; color?: string | null; icon?: string | null } | null
    members?: Member[]
    phases?: Phase[]
    income?: { amount: number }[]
    attention?: {
      hasOverdueTasks: boolean
      hasBlockedPhase: boolean
      hasPendingCycleReport: boolean
      inactiveForDays: number
    }
  }
  canViewFinancials?: boolean
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

function currentPhase(phases: Phase[] | undefined): Phase | null {
  if (!phases || phases.length === 0) return null
  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order)
  const blocked    = sorted.find((p) => p.status === "blocked")
  const inProgress = sorted.find((p) => p.status === "in_progress")
  if (blocked)    return blocked
  if (inProgress) return inProgress
  const last = sorted[sorted.length - 1]
  if (last?.status === "completed") return last
  return null
}

export function ProjectCard({ project, canViewFinancials = false }: ProjectCardProps) {
  const t = useTranslations("projects")
  const attention = project.attention
  const needsAttention = attention && (
    attention.hasOverdueTasks ||
    attention.hasBlockedPhase ||
    attention.inactiveForDays > 7
  )

  // Type badge
  const pt   = project.project_type
  const Icon = getProjectTypeIcon(pt?.icon ?? null)
  const colorStyle = pt?.color ? {
    backgroundColor: pt.color + "22",
    color: pt.color,
    border: `1px solid ${pt.color}44`,
  } : undefined

  // Team avatars (max 3 + overflow)
  const members  = (project.members ?? []).slice(0, 4)
  const shown    = members.slice(0, 3)
  const overflow = members.length > 3 ? members.length - 3 : 0

  // Current phase
  const phase = currentPhase(project.phases)

  // Financials
  const totalIncome     = (project.income ?? []).reduce((s, i) => s + (i.amount ?? 0), 0)
  const projectValue    = project.project_value ?? 0
  const receivable      = Math.max(0, projectValue - totalIncome)

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className={cn(
        "hover:shadow-md transition-all cursor-pointer group",
        needsAttention && "border-amber-400/50"
      )}>
        <CardContent className="p-5 flex flex-col gap-3">

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
                  {project.name}
                </h3>
                {pt && (
                  Icon ? (
                    <span
                      title={pt.name}
                      className={cn("p-1 rounded flex-shrink-0 inline-flex items-center justify-center", !pt.color && "bg-secondary text-secondary-foreground")}
                      style={colorStyle}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span
                      className={cn("text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0", !pt.color && "bg-secondary text-secondary-foreground")}
                      style={colorStyle}
                    >
                      {pt.name}
                    </span>
                  )
                )}
                {needsAttention && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
              </div>
              {project.customer && (
                <p className="text-xs text-muted-foreground mt-0.5">{(project.customer as { name: string }).name}</p>
              )}
            </div>
            {project.status === "Completed" && (
              <Badge variant="success" className="flex-shrink-0">{t("completed")}</Badge>
            )}
          </div>

          {/* ── Progress ────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("progress")}</span>
              <span className="font-semibold text-foreground">{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-1.5" />
          </div>

          {/* ── Current phase ───────────────────────────────────── */}
          {phase && (() => {
            const pc = phaseColor(phase.phase_order)
            return (
              <div className="flex items-center gap-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", pc.bg)} />
                <span className={cn("text-xs truncate", pc.text)}>
                  {phase.name}
                </span>
                {phase.status === "blocked" && (
                  <span className="text-xs text-destructive flex-shrink-0">· {t("blockedLabel")}</span>
                )}
              </div>
            )
          })()}

          {/* ── Footer ──────────────────────────────────────────── */}
          <div className="flex items-end justify-between gap-2 pt-1">
            <div className="space-y-1 min-w-0">
              {/* Date */}
              {project.end_date && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="w-3 h-3 flex-shrink-0" />
                  <span>{formatDate(project.end_date)}</span>
                </div>
              )}
              {/* Financials */}
              {canViewFinancials && projectValue > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    {formatCurrency(projectValue)}
                  </span>
                  {receivable > 0 && (
                    <span className="text-warning font-medium">
                      · {formatCurrency(receivable)} p/c
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Team avatars */}
            {shown.length > 0 && (
              <div className="flex items-center flex-shrink-0">
                {shown.map((m, i) => (
                  <Avatar
                    key={m.id}
                    className="w-6 h-6 border-2 border-card"
                    style={{ marginLeft: i === 0 ? 0 : "-6px", zIndex: shown.length - i }}
                  >
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.full_name} className="h-full w-full object-cover" />
                    ) : (
                      <AvatarFallback className="text-[9px] bg-muted">{initials(m.full_name)}</AvatarFallback>
                    )}
                  </Avatar>
                ))}
                {overflow > 0 && (
                  <span
                    className="w-6 h-6 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[9px] font-semibold text-muted-foreground"
                    style={{ marginLeft: "-6px" }}
                  >
                    +{overflow}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Attention flags */}
          {needsAttention && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {attention?.hasOverdueTasks && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{t("attention.overdueTasks")}</span>
              )}
              {attention?.hasBlockedPhase && (
                <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">{t("attention.blockedPhase")}</span>
              )}
              {attention?.inactiveForDays > 7 && (
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t("attention.inactiveDays", { days: attention.inactiveForDays })}</span>
              )}
            </div>
          )}

        </CardContent>
      </Card>
    </Link>
  )
}
