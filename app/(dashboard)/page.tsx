import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getProjects } from "@/lib/actions/projects"
import { getCustomers } from "@/lib/actions/customers"
import { getTasks } from "@/lib/actions/tasks"
import { getEmployees } from "@/lib/actions/employees"
import { getFinancialSummary, getDomains } from "@/lib/actions/finances"
import { ProjectCard } from "@/components/projects/project-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Users,
  FolderKanban,
  CheckSquare,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Globe,
  Repeat,
  UserCircle,
} from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import type { ProjectWithAttention, Task, Profile, Customer, Domain } from "@/lib/types"

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user!.id)
    .single()

  const role = profile?.role as "admin" | "subadmin" | "employee" | undefined
  const isAdmin = role === "admin"
  const isAdminOrSubadmin = role === "admin" || role === "subadmin"

  // Fetch projects (RLS filters by role automatically)
  const projects = (await getProjects()) as ProjectWithAttention[]
  const activeProjects = projects.filter((p) => p.status === "In Progress")
  const attentionProjects = activeProjects.filter(
    (p) => p.attention?.hasOverdueTasks || p.attention?.hasBlockedPhase ||
           p.attention?.hasPendingCycleReport || p.attention?.inactiveForDays > 7
  )

  // Role-specific fetches
  let allTasks: Task[] = []
  let customers: Customer[] = []
  let employees: Profile[] = []
  let summary = { monthlyIncome: 0, monthlyExpenses: 0, netMargin: 0, mrr: 0, monthlyRecurring: 0, monthlyProjectExpenses: 0 }
  let domains: Domain[] = []

  if (isAdmin) {
    ;[allTasks, customers, employees, summary, domains] = await Promise.all([
      (getTasks() as Promise<Task[]>).catch(() => [] as Task[]),
      (getCustomers() as Promise<Customer[]>).catch(() => [] as Customer[]),
      (getEmployees() as Promise<Profile[]>).catch(() => [] as Profile[]),
      getFinancialSummary().catch(() => ({ monthlyIncome: 0, monthlyExpenses: 0, netMargin: 0, mrr: 0, monthlyRecurring: 0, monthlyProjectExpenses: 0 })),
      (getDomains() as Promise<Domain[]>).catch(() => [] as Domain[]),
    ])
  } else if (isAdminOrSubadmin) {
    allTasks = await (getTasks() as Promise<Task[]>).catch(() => [] as Task[])
  } else {
    const allT = await (getTasks() as Promise<Task[]>).catch(() => [] as Task[])
    allTasks = allT.filter((t) => t.assignee_id === user!.id)
  }

  const pendingTasks = allTasks.filter((t) => t.status !== "Done")
  const inProgressTasks = allTasks.filter((t) => t.status === "In Progress")
  const highPriorityTasks = allTasks.filter((t) => t.priority === "High" && t.status !== "Done")

  // Domain alerts (< 30 days)
  const today = new Date()
  const in30Days = new Date(today)
  in30Days.setDate(today.getDate() + 30)
  const expiringDomains = domains.filter((d) => {
    if (!d.renewal_date) return false
    const renewal = new Date(d.renewal_date)
    return renewal <= in30Days && renewal >= today
  })

  // Blocked phase projects
  const blockedPhaseProjects = attentionProjects.filter((p) => p.attention?.hasBlockedPhase)
  const overdueReportProjects = attentionProjects.filter((p) => p.attention?.hasPendingCycleReport)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches"
  const firstName = profile?.full_name?.split(" ")[0]

  const dateStr = new Date().toLocaleDateString("es-PA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="p-6 space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">{greeting}, {firstName}</h1>
        <p className="text-muted-foreground text-sm mt-1 capitalize">{dateStr}</p>
      </div>

      {/* ── ADMIN VIEW ── */}
      {isAdmin && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-muted-foreground">Ingresos del Mes</p>
                  <div className="p-2 bg-success-subtle rounded-lg">
                    <TrendingUp className="w-4 h-4 text-success" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-success">{formatCurrency(summary.monthlyIncome)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-muted-foreground">Gastos del Mes</p>
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <TrendingDown className="w-4 h-4 text-destructive" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(summary.monthlyExpenses)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-muted-foreground">Margen Neto</p>
                  <div className={`p-2 rounded-lg ${summary.netMargin >= 0 ? "bg-info-subtle" : "bg-destructive/10"}`}>
                    <DollarSign className={`w-4 h-4 ${summary.netMargin >= 0 ? "text-info" : "text-destructive"}`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${summary.netMargin >= 0 ? "text-info-subtle-foreground" : "text-destructive"}`}>
                  {formatCurrency(summary.netMargin)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-muted-foreground">MRR</p>
                  <div className="p-2 bg-purple-subtle rounded-lg">
                    <Repeat className="w-4 h-4 text-purple-subtle-foreground" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-purple-subtle-foreground">{formatCurrency(summary.mrr)}</p>
                <p className="text-xs text-muted-foreground mt-1">fees mensuales activos</p>
              </CardContent>
            </Card>
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-info-subtle rounded-lg">
                  <Users className="w-4 h-4 text-info" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Clientes</p>
                  <p className="text-lg font-bold">{customers.length}</p>
                  <p className="text-xs text-muted-foreground">
                    {customers.filter((c) => c.status === "Active").length} activos
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-warning-subtle rounded-lg">
                  <FolderKanban className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Proyectos Activos</p>
                  <p className="text-lg font-bold">{activeProjects.length}</p>
                  <p className="text-xs text-muted-foreground">de {projects.length} total</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-secondary rounded-lg">
                  <UserCircle className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Equipo</p>
                  <p className="text-lg font-bold">{employees.length}</p>
                  <p className="text-xs text-muted-foreground">miembros</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alerts */}
          {(expiringDomains.length > 0 || blockedPhaseProjects.length > 0 || overdueReportProjects.length > 0) && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Alertas</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {expiringDomains.length > 0 && (
                  <Link href="/finances/domains">
                    <Card className="border-warning/30 bg-warning-subtle/60 hover:bg-warning-subtle transition-colors cursor-pointer">
                      <CardContent className="p-4 flex items-start gap-3">
                        <Globe className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-warning-subtle-foreground">Dominios por vencer</p>
                          <p className="text-xs text-warning-subtle-foreground/80 mt-0.5">
                            {expiringDomains.length} dominio{expiringDomains.length !== 1 ? "s" : ""} vencen en &lt;30 días
                          </p>
                          <p className="text-xs text-warning mt-1 truncate">
                            {expiringDomains.slice(0, 2).map((d) => d.domain).join(", ")}
                            {expiringDomains.length > 2 && ` +${expiringDomains.length - 2}`}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )}

                {blockedPhaseProjects.length > 0 && (
                  <Link href="/projects">
                    <Card className="border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors cursor-pointer">
                      <CardContent className="p-4 flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-destructive">Fases bloqueadas</p>
                          <p className="text-xs text-destructive/80 mt-0.5">
                            {blockedPhaseProjects.length} proyecto{blockedPhaseProjects.length !== 1 ? "s" : ""} con fase bloqueada
                          </p>
                          <p className="text-xs text-destructive/70 mt-1 truncate">
                            {blockedPhaseProjects.slice(0, 2).map((p) => p.name).join(", ")}
                            {blockedPhaseProjects.length > 2 && ` +${blockedPhaseProjects.length - 2}`}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )}

                {overdueReportProjects.length > 0 && (
                  <Link href="/projects">
                    <Card className="border-warning/30 bg-warning-subtle/60 hover:bg-warning-subtle transition-colors cursor-pointer">
                      <CardContent className="p-4 flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-warning-subtle-foreground">Reportes pendientes</p>
                          <p className="text-xs text-warning-subtle-foreground/80 mt-0.5">
                            {overdueReportProjects.length} ciclo{overdueReportProjects.length !== 1 ? "s" : ""} sin reporte entregado
                          </p>
                          <p className="text-xs text-warning mt-1 truncate">
                            {overdueReportProjects.slice(0, 2).map((p) => p.name).join(", ")}
                            {overdueReportProjects.length > 2 && ` +${overdueReportProjects.length - 2}`}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SUBADMIN VIEW (non-financial KPIs) ── */}
      {!isAdmin && isAdminOrSubadmin && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Proyectos Activos</p>
                <div className="p-2 bg-purple-50 rounded-lg">
                  <FolderKanban className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <p className="text-2xl font-bold">{activeProjects.length}</p>
              <p className="text-xs text-muted-foreground mt-1">de {projects.length} total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Tareas Pendientes</p>
                <div className="p-2 bg-orange-50 rounded-lg">
                  <CheckSquare className="w-4 h-4 text-orange-600" />
                </div>
              </div>
              <p className="text-2xl font-bold">{pendingTasks.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{inProgressTasks.length} en progreso</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── EMPLOYEE VIEW KPIs ── */}
      {!isAdminOrSubadmin && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Mis Proyectos</p>
                <div className="p-2 bg-purple-50 rounded-lg">
                  <FolderKanban className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <p className="text-2xl font-bold">{activeProjects.length}</p>
              <p className="text-xs text-muted-foreground mt-1">activos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Mis Tareas</p>
                <div className="p-2 bg-orange-50 rounded-lg">
                  <CheckSquare className="w-4 h-4 text-orange-600" />
                </div>
              </div>
              <p className="text-2xl font-bold">{pendingTasks.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{inProgressTasks.length} en progreso</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── MAIN CONTENT GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Projects */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {isAdminOrSubadmin ? "Proyectos Activos" : "Mis Proyectos"}
            </h2>
            <Link href="/projects" className="text-xs text-primary hover:underline">
              Ver todos →
            </Link>
          </div>

          {attentionProjects.length > 0 && (
            <div className="space-y-2 mb-2">
              <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Requieren atención ({attentionProjects.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {attentionProjects.slice(0, 4).map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </div>
          )}

          {activeProjects.filter((p) => !attentionProjects.includes(p)).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeProjects
                .filter((p) => !attentionProjects.includes(p))
                .slice(0, attentionProjects.length > 0 ? 2 : 4)
                .map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
            </div>
          )}

          {activeProjects.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                No hay proyectos activos
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* High priority tasks */}
          {highPriorityTasks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  Alta Prioridad ({highPriorityTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {highPriorityTasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="flex items-start gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {(task.project as { name: string } | null | undefined)?.name ?? ""}
                      </p>
                    </div>
                    {task.due_date && (
                      <span className={`text-xs flex-shrink-0 ${new Date(task.due_date) < new Date() ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {new Date(task.due_date).toLocaleDateString("es-PA", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                ))}
                <Link href="/tasks" className="text-xs text-primary hover:underline block pt-1">
                  Ver todas las tareas →
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Employee: all pending tasks */}
          {!isAdminOrSubadmin && pendingTasks.length > 0 && highPriorityTasks.length === 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Mis Tareas Pendientes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {pendingTasks
                  .sort((a, b) => {
                    const priority = { High: 0, Medium: 1, Low: 2 }
                    return (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1)
                  })
                  .slice(0, 6)
                  .map((task) => (
                    <div key={task.id} className="flex items-start gap-2 text-sm">
                      <Badge
                        variant="secondary"
                        className={`text-xs flex-shrink-0 ${
                          task.priority === "High"
                            ? "bg-red-100 text-red-700"
                            : task.priority === "Medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {task.priority === "High" ? "Alta" : task.priority === "Medium" ? "Media" : "Baja"}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{task.title}</p>
                        {task.due_date && (
                          <p className={`text-xs ${new Date(task.due_date) < new Date() ? "text-red-600" : "text-muted-foreground"}`}>
                            {new Date(task.due_date).toLocaleDateString("es-PA", { month: "short", day: "numeric" })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {/* Admin: quick financial links */}
          {isAdmin && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Accesos Rápidos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {[
                  { href: "/finances", label: "Resumen Financiero" },
                  { href: "/finances/expenses", label: "Gastos Fijos" },
                  { href: "/finances/domains", label: "Dominios" },
                  { href: "/customers", label: "Clientes" },
                  { href: "/employees", label: "Equipo" },
                  { href: "/settings", label: "Configuración" },
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="block text-sm py-1 px-2 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {label}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
