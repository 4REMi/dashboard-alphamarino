export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProjectTypes, getPhaseSets, getTaskSets } from "@/lib/actions/config"
import { getEmployees } from "@/lib/actions/employees"
import { ProjectTypeManager } from "@/components/settings/project-type-manager"
import { PhaseSetManager } from "@/components/settings/phase-set-manager"
import { TaskSetManager } from "@/components/settings/task-set-manager"
import type { ProjectType, PhaseSet, TaskSet, Profile } from "@/lib/types"

export default async function OperationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()

  if (profile?.role !== "admin") redirect("/")

  const [projectTypes, phaseSets, taskSets, employees] = await Promise.all([
    getProjectTypes().catch(() => []),
    getPhaseSets().catch(() => []),
    getTaskSets().catch(() => []),
    getEmployees().catch(() => []),
  ])

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Operations Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tipos de proyecto, plantillas de fases y task sets reutilizables.
        </p>
      </div>

      <section className="space-y-3">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <ProjectTypeManager
            initialTypes={projectTypes as ProjectType[]}
            phaseSets={phaseSets as PhaseSet[]}
          />
          <PhaseSetManager
            initialSets={phaseSets as PhaseSet[]}
            projectTypes={projectTypes as ProjectType[]}
            taskSets={taskSets as TaskSet[]}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Task Sets</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plantillas de tareas que se asignan automáticamente al aplicar un phase set a un proyecto.
          </p>
        </div>
        <TaskSetManager
          initialSets={taskSets as TaskSet[]}
          employees={employees as Profile[]}
        />
      </section>
    </div>
  )
}
