import { notFound } from "next/navigation"
import Link from "next/link"
import { getEmployee } from "@/lib/actions/employees"
import { getPositions } from "@/lib/actions/config"
import { createClient } from "@/lib/supabase/server"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Mail, Phone, Briefcase } from "lucide-react"
import { EmployeeEditActions } from "@/components/employees/employee-edit-actions"
import { EmployeePermissions } from "@/components/employees/employee-permissions"
import type { Profile, Position } from "@/lib/types"

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let data: Awaited<ReturnType<typeof getEmployee>> | null = null
  try {
    data = await getEmployee(id)
  } catch {
    notFound()
  }

  const { profile } = data

  const supabase = await createClient()
  const [{ data: { user } }, positions] = await Promise.all([
    supabase.auth.getUser(),
    getPositions() as Promise<Position[]>,
  ])
  const { data: currentProfile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()
  const isAdmin = currentProfile?.role === "admin"

  const initials = profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)

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
              positions={positions}
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

    </div>
  )
}
