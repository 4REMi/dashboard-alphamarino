export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProjectTypes, getPhaseSets, getTaskSets } from "@/lib/actions/config"
import { getEmployees } from "@/lib/actions/employees"
import { OperationsLab } from "@/components/operations/operations-lab"
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
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Operations Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tipos de proyecto → Phase Sets → Task Sets. Selecciona en cada columna para navegar la jerarquía.
        </p>
      </div>

      <OperationsLab
        projectTypes={projectTypes as ProjectType[]}
        phaseSets={phaseSets as PhaseSet[]}
        taskSets={taskSets as TaskSet[]}
        employees={employees as Profile[]}
      />
    </div>
  )
}
