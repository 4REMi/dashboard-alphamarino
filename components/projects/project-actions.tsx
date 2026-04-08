"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { archiveProject, unarchiveProject, deleteProject } from "@/lib/actions/projects"
import { ProjectForm } from "@/components/projects/project-form"
import { Button } from "@/components/ui/button"
import type { Project, Customer, ProjectType } from "@/lib/types"

interface Props {
  projectId: string
  isArchived: boolean
  isAdmin: boolean
  isAdminOrSubadmin: boolean
  project?: Project
  customers?: Customer[]
  projectTypes?: ProjectType[]
}

export function ProjectActions({
  projectId,
  isArchived,
  isAdmin,
  isAdminOrSubadmin,
  project,
  customers = [],
  projectTypes = [],
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleArchive() {
    startTransition(async () => {
      await archiveProject(projectId)
      router.push("/projects")
    })
  }

  function handleRestore() {
    startTransition(async () => {
      await unarchiveProject(projectId)
      router.push("/projects")
    })
  }

  function handleDelete() {
    if (!confirm("¿Eliminar permanentemente? Esto borrará todas las tareas, fases e ingresos del proyecto.")) return
    startTransition(async () => {
      await deleteProject(projectId)
      router.push("/projects")
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
        />
      )}
      {isArchived ? (
        <Button variant="outline" size="sm" onClick={handleRestore} disabled={isPending}>
          Restaurar
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={handleArchive} disabled={isPending}>
          Archivar
        </Button>
      )}
      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
        >
          Eliminar
        </Button>
      )}
    </div>
  )
}
