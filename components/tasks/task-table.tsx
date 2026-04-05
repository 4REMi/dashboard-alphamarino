"use client"

import { useState } from "react"
import { deleteTask } from "@/lib/actions/tasks"
import { TaskForm } from "./task-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Pencil, Trash2, CalendarDays } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Task, Profile } from "@/lib/types"

const statusConfig = {
  Todo: { label: "Por Hacer", variant: "secondary" as const },
  "In Progress": { label: "En Progreso", variant: "info" as const },
  Done: { label: "Hecho", variant: "success" as const },
}

const priorityConfig = {
  Low: { label: "Baja", color: "text-gray-500" },
  Medium: { label: "Media", color: "text-yellow-600" },
  High: { label: "Alta", color: "text-red-600" },
}

interface TaskTableProps {
  tasks: Task[]
  projectId: string
  employees: Profile[]
  isAdmin: boolean
}

export function TaskTable({ tasks, projectId, employees, isAdmin }: TaskTableProps) {
  const [filter, setFilter] = useState<"all" | "Todo" | "In Progress" | "Done">("all")

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["all", "Todo", "In Progress", "Done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {f === "all" ? "Todas" : statusConfig[f].label}
            <span className="ml-1.5 opacity-70">
              ({f === "all" ? tasks.length : tasks.filter((t) => t.status === f).length})
            </span>
          </button>
        ))}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarea</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Prioridad</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Asignado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vence</th>
              {isAdmin && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No hay tareas en esta categoría
                </td>
              </tr>
            )}
            {filtered.map((task) => {
              const assignee = task.assignee as Profile | undefined
              const initials = assignee?.full_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)

              return (
                <tr key={task.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className={cn("font-medium", task.status === "Done" && "line-through text-muted-foreground")}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{task.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusConfig[task.status].variant}>{statusConfig[task.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs font-medium", priorityConfig[task.priority].color)}>
                      {priorityConfig[task.priority].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {assignee ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs">{assignee.full_name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {task.due_date ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {formatDate(task.due_date)}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <TaskForm
                          projectId={projectId}
                          task={task}
                          employees={employees}
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          }
                        />
                        <form
                          action={async () => {
                            if (confirm(`¿Eliminar "${task.title}"?`)) {
                              await deleteTask(task.id, projectId)
                            }
                          }}
                        >
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
