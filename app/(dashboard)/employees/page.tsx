import { createClient } from "@/lib/supabase/server"
import { getEmployees } from "@/lib/actions/employees"
import { EmployeeForm } from "@/components/employees/employee-form"
import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Mail, Phone, Briefcase } from "lucide-react"
import type { Profile } from "@/lib/types"

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  subadmin: "Subadmin",
  employee: "Empleado",
}

export default async function EmployeesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentProfile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()
  const isAdmin = currentProfile?.role === "admin"

  const employees = (await getEmployees()) as Profile[]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Empleados</h1>
          <p className="text-muted-foreground text-sm mt-1">{employees.length} miembros del equipo</p>
        </div>
        {isAdmin && <EmployeeForm />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {employees.map((employee) => {
          const initials = employee.full_name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)

          return (
            <Link key={employee.id} href={`/employees/${employee.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      {employee.avatar_url && (
                        <img src={employee.avatar_url} alt={employee.full_name} className="aspect-square h-full w-full object-cover" />
                      )}
                      <AvatarFallback className="text-base font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{employee.full_name}</p>
                        <Badge
                          variant={employee.role === "admin" ? "default" : employee.role === "subadmin" ? "info" : "secondary"}
                          className="flex-shrink-0 text-xs"
                        >
                          {ROLE_LABELS[employee.role] ?? employee.role}
                        </Badge>
                      </div>
                      {employee.position && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Briefcase className="w-3 h-3" />
                          {employee.position}
                        </p>
                      )}
                      {employee.email && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 truncate">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          {employee.email}
                        </p>
                      )}
                      {employee.phone && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Phone className="w-3 h-3" />
                          {employee.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {employees.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p>No hay empleados registrados</p>
          {isAdmin && (
            <p className="text-sm mt-2">
              Usa el botón "Nuevo empleado" para invitar a tu equipo.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
