"use client"

import { useState, useTransition } from "react"
import { updateUserPermissions } from "@/lib/actions/employees"
import { can } from "@/lib/permissions"
import type { UserPermissions } from "@/lib/permissions"
import type { Profile } from "@/lib/types"

const PERMISSION_LABELS: { key: keyof UserPermissions; label: string; description: string }[] = [
  {
    key: "view_project_financials",
    label: "Ver finanzas de proyectos",
    description: "Valor del proyecto, ingresos y gastos por proyecto",
  },
  {
    key: "view_global_finances",
    label: "Ver sección Finanzas",
    description: "Acceso completo a /finanzas con MRR, gastos fijos e ingresos",
  },
  {
    key: "view_domains",
    label: "Ver Dominios",
    description: "Acceso a la sección de Dominios, independiente de Finanzas",
  },
  {
    key: "edit_projects",
    label: "Editar proyectos",
    description: "Crear, editar y archivar proyectos",
  },
  {
    key: "manage_team",
    label: "Gestionar equipo",
    description: "Agregar y remover miembros de proyectos",
  },
  {
    key: "view_all_projects",
    label: "Ver todos los proyectos",
    description: "Ver proyectos donde no es miembro",
  },
  {
    key: "manage_tasks",
    label: "Gestionar tareas",
    description: "Crear, editar y eliminar tareas en proyectos",
  },
  {
    key: "request_sops",
    label: "Solicitar SOPs",
    description: "Solicitar la creación de un SOP para una tarea específica",
  },
  {
    key: "assign_sops",
    label: "Asignar SOPs",
    description: "Asignar SOPs a tareas y plantillas del banco",
  },
]

interface Props {
  employee: Profile
}

export function EmployeePermissions({ employee }: Props) {
  const [permissions, setPermissions] = useState<UserPermissions>(
    (employee.permissions ?? {}) as UserPermissions
  )
  const [isPending, startTransition] = useTransition()

  function handleToggle(key: keyof UserPermissions) {
    // Current effective value (respecting defaults)
    const current = can({ role: employee.role, permissions }, key)
    const next = !current

    const updated = { ...permissions, [key]: next }
    setPermissions(updated)

    startTransition(async () => {
      await updateUserPermissions(employee.id, updated)
    })
  }

  if (employee.role === "admin") return null

  return (
    <div className="space-y-1">
      {PERMISSION_LABELS.map(({ key, label, description }) => {
        const value = can({ role: employee.role, permissions }, key)
        return (
          <div
            key={key}
            className="flex items-center justify-between py-3 px-1 border-b border-border/50 last:border-0"
          >
            <div className="flex-1 min-w-0 pr-4">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <button
              onClick={() => handleToggle(key)}
              disabled={isPending}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
                value ? "bg-primary" : "bg-muted-foreground/30"
              }`}
              role="switch"
              aria-checked={value}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition duration-200 ${
                  value ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground pt-2">
        Los cambios aplican de inmediato en la próxima carga de página del empleado.
      </p>
    </div>
  )
}
