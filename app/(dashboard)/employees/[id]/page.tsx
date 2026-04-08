import { notFound } from "next/navigation"
import Link from "next/link"
import { getEmployee } from "@/lib/actions/employees"
import { createClient } from "@/lib/supabase/server"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, Mail, Phone, Briefcase, FolderKanban, CheckSquare, CalendarDays } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { EmployeeEditActions } from "@/components/employees/employee-edit-actions"
import { EmployeePermissions } from "@/components/employees/employee-permissions"
import type { Task, Profile } from "@/lib/types"

const taskStatusConfig = {
  Todo: { label: "Por Hacer", variant: "secondary" as const },
  "In Progress": { label: "En Progreso", variant: "info" as const },
  Done: { label: "Hecho", variant: "success" as const },
}

const priorityColors = {
  Low: "text-gray-500",
  Medium: "text-yellow-600",
  High: "text-red-600",
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let data: Awaited<ReturnType<typeof getEmployee>> | null = null
  try {
    data = await getEmployee(id)
  } catch {
    notFound()
  }

  const { profile, projects, tasks } = data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentProfile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()
  const isAdmin = currentProfile?.role === "admin"

  const initials = profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
  const pendingTasks = (tasks as Task[]).filter((t) => t.status !== "Done")
  const doneTasks = (tasks as Task[]).filter((t) => t.status === "Done")

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/employees">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
            Empleados
          </Button>
        </Link>
      </div>

      {/* Profile Header */}
      <div className="flex items-start gap-6">
        <Avatar className="h-20 w-20">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} className="aspect-square h-full w-full object-cover" />
          ) : (
            <AvatarFallback className="text-2xl font-bold">{initials}</AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{profile.full_name}</h1>
              <Badge variant={profile.role === "admin" ? "default" : profile.role === "subadmin" ? "info" : "secondary"}>
                {profile.role === "admin" ? "Administrador" : profile.role === "subadmin" ? "Subadmin" : "Empleado"}
              </Badge>
            </div>
            <EmployeeEditActions
              profile={profile as Profile}
              isAdmin={isAdmin}
              isSelf={user!.id === profile.id}
            />
          </div>
          <div className="flex flex-col gap-1 mt-2">
            {profile.position && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Briefcase className="w-4 h-4" />
                {profile.position}
              </p>
            )}
            {profile.email && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-4 h-4" />
                <a href={`mailto:${profile.email}`} className="hover:text-primary">{profile.email}</a>
              </p>
            )}
            {profile.phone && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4" />
                {profile.phone}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Permissions (admin only, not shown for other admins) */}
      {isAdmin && profile.role !== "admin" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Permisos</CardTitle>
          </CardHeader>
          <CardContent>
            <EmployeePermissions employee={profile as Profile} />
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FolderKanban className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Proyectos</span>
            </div>
            <p className="text-2xl font-bold">{projects.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Tareas Pendientes</span>
            </div>
            <p className="text-2xl font-bold">{pendingTasks.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Tareas Completadas</span>
            </div>
            <p className="text-2xl font-bold">{doneTasks.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Proyectos Asignados</h2>
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {projects.map((project: any) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium">{project.name}</p>
                        {project.customer && (
                          <p className="text-xs text-muted-foreground">{project.customer.name}</p>
                        )}
                      </div>
                      <Badge variant={project.status === "Completed" ? "success" : project.status === "In Progress" ? "info" : "secondary"}>
                        {project.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={project.progress} className="flex-1 h-2" />
                      <span className="text-xs text-muted-foreground w-8 text-right">{project.progress}%</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Tareas Asignadas</h2>
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarea</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Proyecto</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Prioridad</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vence</th>
                </tr>
              </thead>
              <tbody>
                {(tasks as Task[]).map((task) => (
                  <tr key={task.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className={cn("font-medium", task.status === "Done" && "line-through text-muted-foreground")}>
                        {task.title}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {(task.project as { name: string } | undefined)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={taskStatusConfig[task.status].variant}>
                        {taskStatusConfig[task.status].label}
                      </Badge>
                    </td>
                    <td className={cn("px-4 py-3 text-xs font-medium", priorityColors[task.priority])}>
                      {task.priority}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {task.due_date ? (
                        <div className="flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {formatDate(task.due_date)}
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
