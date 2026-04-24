"use client"

import { useState, useTransition, type ReactNode } from "react"
import { createEmployee } from "@/lib/actions/employees"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { UserPlus, Mail } from "lucide-react"
import type { Position } from "@/lib/types"

interface EmployeeFormProps {
  trigger?: ReactNode
  positions?: Position[]
}

export function EmployeeForm({ trigger, positions = [] }: EmployeeFormProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createEmployee(formData)
        setSuccess(true)
        setTimeout(() => {
          setOpen(false)
          setSuccess(false)
        }, 1500)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al crear el empleado")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setError(null); setSuccess(false) }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <UserPlus className="w-4 h-4 mr-2" />
            Nuevo empleado
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo empleado</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Mail className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-medium">Invitación enviada</p>
            <p className="text-sm text-muted-foreground">
              El empleado recibirá un email para establecer su contraseña.
            </p>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nombre completo *</label>
              <input
                name="full_name"
                required
                placeholder="Ana García"
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email *</label>
              <input
                name="email"
                type="email"
                required
                placeholder="ana@alphamarino.com"
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Se enviará un email de invitación a esta dirección.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cargo</label>
              <input
                name="position"
                placeholder="Diseñador, Media Buyer..."
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {positions.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Puesto (asignación automática)</label>
                <select
                  name="position_id"
                  className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="none">Sin puesto</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Usado para asignar tareas automáticamente al crear proyectos.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Teléfono</label>
              <input
                name="phone"
                type="tel"
                placeholder="+507 6000-0000"
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Rol</label>
              <select
                name="role"
                className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="employee">Empleado</option>
                <option value="subadmin">Subadmin</option>
              </select>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Enviando invitación..." : "Enviar invitación"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
