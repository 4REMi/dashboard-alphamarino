import { createClient } from "@/lib/supabase/server"
import { getProjects } from "@/lib/actions/projects"
import { getCustomers } from "@/lib/actions/customers"
import { ProjectCard } from "@/components/projects/project-card"
import { ProjectForm } from "@/components/projects/project-form"
import type { Customer, Project } from "@/lib/types"

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()
  const isAdmin = profile?.role === "admin"

  const [projects, customers] = await Promise.all([
    getProjects(),
    getCustomers(),
  ])

  const inProgress = (projects as Project[]).filter((p) => p.status === "In Progress")
  const planning = (projects as Project[]).filter((p) => p.status === "Planning")
  const review = (projects as Project[]).filter((p) => p.status === "Review")
  const completed = (projects as Project[]).filter((p) => p.status === "Completed")

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proyectos</h1>
          <p className="text-muted-foreground text-sm mt-1">{projects.length} proyectos en total</p>
        </div>
        {isAdmin && <ProjectForm customers={customers as Customer[]} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "En Progreso", count: inProgress.length, color: "text-blue-600 bg-blue-50" },
          { label: "Planificación", count: planning.length, color: "text-gray-600 bg-gray-50" },
          { label: "En Revisión", count: review.length, color: "text-yellow-600 bg-yellow-50" },
          { label: "Completados", count: completed.length, color: "text-green-600 bg-green-50" },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <p className="text-2xl font-bold">{stat.count}</p>
            <p className="text-sm font-medium mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {inProgress.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3 text-blue-700">En Progreso</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inProgress.map((project) => (
              <ProjectCard key={project.id} project={project as Project & { customer?: { name: string; company?: string | null } | null }} />
            ))}
          </div>
        </section>
      )}

      {planning.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Planificación</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {planning.map((project) => (
              <ProjectCard key={project.id} project={project as Project & { customer?: { name: string; company?: string | null } | null }} />
            ))}
          </div>
        </section>
      )}

      {review.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3 text-yellow-700">En Revisión</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {review.map((project) => (
              <ProjectCard key={project.id} project={project as Project & { customer?: { name: string; company?: string | null } | null }} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3 text-green-700">Completados</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completed.map((project) => (
              <ProjectCard key={project.id} project={project as Project & { customer?: { name: string; company?: string | null } | null }} />
            ))}
          </div>
        </section>
      )}

      {projects.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No hay proyectos aún</p>
          {isAdmin && <p className="text-sm mt-1">Crea el primer proyecto usando el botón de arriba</p>}
        </div>
      )}
    </div>
  )
}
