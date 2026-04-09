"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { archiveProject, completeProject, reactivateProject, deleteProject } from "@/lib/actions/projects"
import { ProjectForm } from "@/components/projects/project-form"
import { Button } from "@/components/ui/button"
import type { Project, Customer, ProjectType, ProjectStatus } from "@/lib/types"

interface Props {
  projectId: string
  status: ProjectStatus
  isAdmin: boolean
  isAdminOrSubadmin: boolean
  project?: Project
  customers?: Customer[]
  projectTypes?: ProjectType[]
  canViewFinancials?: boolean
}

export function ProjectActions({
  projectId,
  status,
  isAdmin,
  isAdminOrSubadmin,
  project,
  customers = [],
  projectTypes = [],
  canViewFinancials = true,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<void>, redirect = false) {
    startTransition(async () => {
      await action()
      if (redirect) router.push("/projects")
      else router.refresh()
    })
  }

  if (!isAdminOrSubadmin) return null

  return (
    <div className="flex items-center gap-2">
      {project && (
        <ProjectForm
          project={project}
          customers={customers}
          projectTypes={projectTypes}
          trigger={<Button variant="outline" size="sm">Editar</Button>}
          canViewFinancials={canViewFinancials}
        />
      )}

      {status === "Active" && (
        <>
          <Button variant="outline" size="sm" onClick={() => run(() => completeProject(projectId))} disabled={isPending}>
            Marcar completado
          </Button>
          <Button variant="outline" size="sm" onClick={() => run(() => archiveProject(projectId), true)} disabled={isPending}>
            Archivar
          </Button>
        </>
      )}

      {status === "Completed" && (
        <>
          <Button variant="outline" size="sm" onClick={() => run(() => reactivateProject(projectId))} disabled={isPending}>
            Reactivar
          </Button>
          <Button variant="outline" size="sm" onClick={() => run(() => archiveProject(projectId), true)} disabled={isPending}>
            Archivar
          </Button>
        </>
      )}

      {status === "Archived" && (
        <Button variant="outline" size="sm" onClick={() => run(() => reactivateProject(projectId), true)} disabled={isPending}>
          Restaurar
        </Button>
      )}

      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => {
            if (!confirm("¿Eliminar permanentemente? Esto borrará todas las tareas, fases e ingresos del proyecto.")) return
            run(() => deleteProject(projectId), true)
          }}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
        >
          Eliminar
        </Button>
      )}
    </div>
  )
}
