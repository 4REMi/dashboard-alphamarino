import { notFound } from "next/navigation"
import Link from "next/link"
import { getCustomer } from "@/lib/actions/customers"
import { CustomerStatusBadge } from "@/components/customers/customer-status-badge"
import { CustomerForm } from "@/components/customers/customer-form"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, Mail, Phone, Building2, FolderKanban } from "lucide-react"
import { formatDate } from "@/lib/utils"
import type { Customer, Project } from "@/lib/types"

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let customer: (Customer & { projects: Project[] }) | null = null
  try {
    customer = await getCustomer(id) as Customer & { projects: Project[] }
  } catch {
    notFound()
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()
  const isAdmin = profile?.role === "admin"

  const projects = (customer.projects ?? []) as Project[]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{customer.name}</h1>
            <CustomerStatusBadge status={customer.status} />
          </div>
          <p className="text-muted-foreground mt-1">
            Cliente desde {formatDate(customer.created_at)}
          </p>
        </div>
        {isAdmin && <CustomerForm customer={customer as Customer} trigger={<Button variant="outline">Editar</Button>} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {customer.company && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                {customer.company}
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <a href={`mailto:${customer.email}`} className="hover:text-primary">{customer.email}</a>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                {customer.phone}
              </div>
            )}
            {!customer.company && !customer.email && !customer.phone && (
              <p className="text-sm text-muted-foreground">Sin información de contacto</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Proyectos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-primary" />
              <span className="text-2xl font-bold">{projects.length}</span>
              <span className="text-sm text-muted-foreground">proyectos</span>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant="success">{projects.filter((p) => p.status === "Active").length} activos</Badge>
              <Badge variant="secondary">{projects.filter((p) => p.status === "Completed").length} completados</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {projects.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Proyectos</h2>
          <div className="space-y-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{project.name}</span>
                      <Badge variant={project.status === "Completed" ? "success" : project.status === "Active" ? "info" : "secondary"}>
                        {project.status === "Active" ? "Activo" : project.status === "Completed" ? "Completado" : "Archivado"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={project.progress} className="flex-1 h-2" />
                      <span className="text-xs text-muted-foreground w-10 text-right">{project.progress}%</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
