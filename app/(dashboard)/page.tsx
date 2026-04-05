import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getProjects } from "@/lib/actions/projects"
import { getCustomers } from "@/lib/actions/customers"
import { getTasks } from "@/lib/actions/tasks"
import { getEmployees } from "@/lib/actions/employees"
import { getFinancialSummary } from "@/lib/actions/finances"
import { ProjectCard } from "@/components/projects/project-card"
import { CustomerStatusBadge } from "@/components/customers/customer-status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Users,
  FolderKanban,
  CheckSquare,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  UserCircle,
} from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import type { Customer, Project, Task, Profile } from "@/lib/types"

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user!.id).single()
  const isAdmin = profile?.role === "admin"

  let customers: Customer[] = []
  let allTasks: Task[] = []
  let employees: Profile[] = []
  let summary = { monthlyIncome: 0, monthlyExpenses: 0, netMargin: 0, monthlyRecurring: 0, monthlyProjectExpenses: 0 }

  const projects = (await getProjects()) as Project[]

  if (isAdmin) {
    customers = (await getCustomers()) as Customer[]
    allTasks = (await getTasks()) as Task[]
    employees = (await getEmployees()) as Profile[]
    summary = await getFinancialSummary()
  } else {
    allTasks = ((await getTasks()) as Task[]).filter((t) => t.assignee_id === user!.id)
  }

  const activeProjects = projects.filter((p) => p.status === "In Progress")
  const todoTasks = allTasks.filter((t) => t.status === "Todo")
  const inProgressTasks = allTasks.filter((t) => t.status === "In Progress")
  const highPriorityTasks = allTasks.filter((t) => t.priority === "High" && t.status !== "Done")

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches"

  return (
    <div className="p-6 space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">{greeting}, {profile?.full_name?.split(" ")[0]} 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {new Date().toLocaleDateString("es-PA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className={`grid gap-4 ${isAdmin ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"}`}>
        {isAdmin && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Clientes</p>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <p className="text-2xl font-bold">{customers.length}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {customers.filter((c) => c.status === "Active").length} activos
              </p>
            </CardContent>
          </Card>
        )}

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
            <p className="text-2xl font-bold">{todoTasks.length + inProgressTasks.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {inProgressTasks.length} en progreso
            </p>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Empleados</p>
                <div className="p-2 bg-green-50 rounded-lg">
                  <UserCircle className="w-4 h-4 text-green-600" />
                </div>
              </div>
              <p className="text-2xl font-bold">{employees.length}</p>
              <p className="text-xs text-muted-foreground mt-1">miembros del equipo</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Financial Summary (admin only) */}
      {isAdmin && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-green-200 bg-green-50/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <p className="text-xs text-muted-foreground">Ingresos del Mes</p>
              </div>
              <p className="text-xl font-bold text-green-700">{formatCurrency(summary.monthlyIncome)}</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-600" />
                <p className="text-xs text-muted-foreground">Gastos del Mes</p>
              </div>
              <p className="text-xl font-bold text-red-700">{formatCurrency(summary.monthlyExpenses)}</p>
            </CardContent>
          </Card>
          <Card className={`${summary.netMargin >= 0 ? "border-blue-200 bg-blue-50/30" : "border-red-200 bg-red-50/30"}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className={`w-4 h-4 ${summary.netMargin >= 0 ? "text-blue-600" : "text-red-600"}`} />
                <p className="text-xs text-muted-foreground">Margen Neto</p>
              </div>
              <p className={`text-xl font-bold ${summary.netMargin >= 0 ? "text-blue-700" : "text-red-700"}`}>
                {formatCurrency(summary.netMargin)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Projects */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Proyectos Activos</h2>
            <Link href="/projects" className="text-xs text-primary hover:underline">Ver todos →</Link>
          </div>
          {activeProjects.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeProjects.slice(0, 4).map((project) => (
                <ProjectCard key={project.id} project={project as Project & { customer?: { name: string; company?: string | null } | null }} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
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
                  <AlertCircle className="w-4 h-4" />
                  Alta Prioridad ({highPriorityTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {highPriorityTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-start gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {(task.project as { name: string } | undefined)?.name ?? ""}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs flex-shrink-0">{task.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent customers (admin only) */}
          {isAdmin && customers.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Clientes Recientes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {customers.slice(0, 4).map((customer) => (
                  <Link key={customer.id} href={`/customers/${customer.id}`} className="flex items-center justify-between hover:bg-muted/50 rounded-md px-1 py-0.5 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{customer.name}</p>
                      {customer.company && <p className="text-xs text-muted-foreground">{customer.company}</p>}
                    </div>
                    <CustomerStatusBadge status={customer.status} />
                  </Link>
                ))}
                <Link href="/customers" className="text-xs text-primary hover:underline block text-right">Ver todos →</Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
