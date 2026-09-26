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
import { type ProjectSignals, scopeTone, cycleNeedsAttention } from "@/lib/utils/project-signals"
import { RefreshCw, PenLine, EyeOff, Clock, Moon } from "lucide-react"

interface Member { id: string; full_name: string; avatar_url: string | null }
interface Phase  { id: string; name: string; status: string; phase_order: number }
interface TaskSummary { id: string; title: string; status: string; phase_id: string | null; task_order: number | null }

interface ProjectCardProps {
  project: Project & {
    customer?: { name: string; company?: string | null } | null
    project_type?: { name: string; color?: string | null; icon?: string | null } | null
    members?: Member[]
    phases?: Phase[]
    tasks?: TaskSummary[]
    income?: { amount: number }[]
    attention?: {
      hasOverdueTasks: boolean
      hasBlockedPhase: boolean
      hasPendingCycleReport: boolean
      hasPendingClientChanges: boolean
      inactiveForDays: number
    }
    signals?: ProjectSignals
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
  const sig = project.signals
  const needsAttention = attention && (
    attention.hasOverdueTasks ||
    attention.hasBlockedPhase ||
    attention.hasPendingClientChanges ||
    attention.inactiveForDays > 7 ||
    (sig?.scope && scopeTone(sig.scope) === "red") ||
    cycleNeedsAttention(sig?.cycle ?? null)
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

  // Current phase & active task
  const phase = currentPhase(project.phases)
  const totalIncome     = (project.income ?? []).reduce((s, i) => s + (i.amount ?? 0), 0)
  const projectValue    = project.project_value ?? 0
  const receivable      = Math.max(0, projectValue - totalIncome)

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className={cn(
        "hover:shadow-md transition-all cursor-pointer group relative hover:z-20",
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

          {/* ── Fases: mini stepper con hover (antes: fase + tarea activa en texto) ── */}
          {project.phases && project.phases.length > 0 && <MiniPhases phases={project.phases} tasks={project.tasks ?? []} current={phase} blockedLabel={t("blockedLabel")} />}

          {/* ── Señales: solo las que aplican, detalle en hover ── */}
          {sig && <SignalsRow sig={sig} />}

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

        </CardContent>
      </Card>
    </Link>
  )
}

// Hover genérico: la señal en la tarjeta, el porqué al pasar el cursor.
function Hover({ children, content, align = "left" }: { children: React.ReactNode; content: React.ReactNode; align?: "left" | "right" }) {
  return (
    <span className="relative group/hover inline-flex">
      {children}
      <span className={cn("absolute top-full pt-1.5 z-40 hidden group-hover/hover:block", align === "left" ? "left-0" : "right-0")}>
        <span className="block w-60 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-2.5 text-xs space-y-1 font-normal">
          {content}
        </span>
      </span>
    </span>
  )
}

function MiniPhases({ phases, tasks, current, blockedLabel }: { phases: Phase[]; tasks: TaskSummary[]; current: Phase | null; blockedLabel: string }) {
  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order)
  const STATUS: Record<string, string> = { completed: "Completada", in_progress: "En curso", blocked: "Bloqueada", pending: "Pendiente" }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {sorted.map((ph, i) => {
          const pc = phaseColor(ph.phase_order)
          const phTasks = tasks.filter((t) => t.phase_id === ph.id)
          const done = phTasks.filter((t) => t.status === "Done").length
          return (
            <span key={ph.id} className="flex items-center">
              <Hover content={<>
                <span className="block text-[10px] text-muted-foreground">Fase {i + 1}</span>
                <span className="block font-semibold">{ph.name}</span>
                <span className="block text-muted-foreground">{STATUS[ph.status] ?? ph.status}{phTasks.length ? ` · ${done}/${phTasks.length} tareas` : ""}</span>
              </>}>
                <span className={cn(
                  "w-3 h-3 rounded-full border-[1.5px] block",
                  pc.border,
                  ph.status === "completed" ? pc.bg : ph.status === "in_progress" ? pc.light : ph.status === "blocked" ? "bg-destructive border-destructive" : "bg-background",
                )} />
              </Hover>
              {i < sorted.length - 1 && <span className={cn("w-2 h-px", ph.status === "completed" ? pc.bg : "bg-border")} />}
            </span>
          )
        })}
      </div>
      {current && (
        <span className={cn("text-xs font-medium truncate", phaseColor(current.phase_order).text)}>
          {current.name}{current.status === "blocked" && <span className="text-destructive"> · {blockedLabel}</span>}
        </span>
      )}
    </div>
  )
}

const TONE = {
  green: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40",
  amber: "text-amber-800 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40",
  red: "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40",
  gray: "text-muted-foreground bg-muted",
}
const money = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })

function Chip({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md", TONE[tone])}>{children}</span>
}

function List({ items, max = 5 }: { items: string[]; max?: number }) {
  return (
    <span className="block space-y-0.5">
      {items.slice(0, max).map((x, i) => <span key={i} className="block truncate">• {x}</span>)}
      {items.length > max && <span className="block text-muted-foreground">y {items.length - max} más</span>}
    </span>
  )
}

function Ring({ pct, tone }: { pct: number; tone: "green" | "amber" | "red" }) {
  const color = tone === "green" ? "#10b981" : tone === "amber" ? "#f59e0b" : "#ef4444"
  return (
    <span className="w-3 h-3 rounded-full inline-block" style={{ background: `conic-gradient(${color} ${pct * 360}deg, color-mix(in srgb, ${color} 20%, transparent) 0)` }} />
  )
}

function SignalsRow({ sig }: { sig: ProjectSignals }) {
  const items: React.ReactNode[] = []
  if (sig.scope) {
    const tone = scopeTone(sig.scope)
    const pct = sig.scope.expected ? sig.scope.done / sig.scope.expected : 1
    items.push(
      <Hover key="scope" content={<>
        <span className="block font-semibold">Entregables · {sig.scope.label}</span>
        <span className="block text-muted-foreground">{sig.scope.done} de {sig.scope.expected} entregados</span>
        {sig.scope.missing.length > 0 && <List items={sig.scope.missing} />}
        {sig.scope.prevIncomplete && <span className="block text-red-600">Periodo anterior ({sig.scope.prevIncomplete.label}) cerró con {sig.scope.prevIncomplete.done}/{sig.scope.prevIncomplete.expected}</span>}
      </>}>
        <Chip tone={tone}><Ring pct={pct} tone={tone} />{sig.scope.done}/{sig.scope.expected}</Chip>
      </Hover>,
    )
  }
  if (sig.cycle && cycleNeedsAttention(sig.cycle)) {
    const c = sig.cycle
    const tone = c.reviewPending || c.daysLeft < 0 ? "red" : "amber"
    const text = c.reviewPending ? "Repaso" : c.daysLeft < 0 ? `Vencido ${-c.daysLeft}d` : c.daysLeft <= 3 ? `${c.daysLeft}d` : "Manual"
    items.push(
      <Hover key="cycle" content={<>
        <span className="block font-semibold">Ciclo {shortDate(c.start)} – {shortDate(c.end)}</span>
        {c.reviewPending && <span className="block text-red-600">Hay un ciclo cerrado con repaso pendiente</span>}
        {!c.reviewPending && <span className="block text-muted-foreground">{c.daysLeft < 0 ? `Venció hace ${-c.daysLeft} días` : `Faltan ${c.daysLeft} días`}</span>}
        {c.metaSpend !== null && <span className="block text-muted-foreground">Gasto Meta del ciclo: {money(c.metaSpend)}</span>}
        {c.staleManual.length > 0 && <><span className="block text-amber-700">Campañas manuales sin actualizar:</span><List items={c.staleManual} /></>}
      </>}>
        <Chip tone={tone}><RefreshCw className="w-3 h-3" />{text}</Chip>
      </Hover>,
    )
  }
  if (sig.changesRequested.length) {
    items.push(
      <Hover key="changes" content={<><span className="block font-semibold">Cambios pedidos por el cliente</span><List items={sig.changesRequested} /></>}>
        <Chip tone="red"><PenLine className="w-3 h-3" />{sig.changesRequested.length}</Chip>
      </Hover>,
    )
  }
  if (sig.unpublished > 0) {
    items.push(
      <Hover key="unpub" content={<span className="block">{sig.unpublished} pieza{sig.unpublished === 1 ? "" : "s"} en borrador que el cliente aún no ve</span>}>
        <Chip tone="amber"><EyeOff className="w-3 h-3" />{sig.unpublished}</Chip>
      </Hover>,
    )
  }
  if (sig.overdueTasks.length) {
    items.push(
      <Hover key="overdue" content={<><span className="block font-semibold">Tareas vencidas</span><List items={sig.overdueTasks} max={3} /></>}>
        <Chip tone="amber"><Clock className="w-3 h-3" />{sig.overdueTasks.length}</Chip>
      </Hover>,
    )
  }
  if (sig.inactiveDays > 7) {
    items.push(
      <Hover key="inactive" align="right" content={<span className="block">Sin movimiento desde hace {sig.inactiveDays} días</span>}>
        <Chip tone="gray"><Moon className="w-3 h-3" />{sig.inactiveDays}d</Chip>
      </Hover>,
    )
  }
  if (!items.length) return null
  return <div className="flex items-center gap-1.5 flex-wrap">{items}</div>
}
