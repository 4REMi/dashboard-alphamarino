export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProjectTypes, getPhaseSets, getTaskSets, getPositions } from "@/lib/actions/config"
import { getEmployees } from "@/lib/actions/employees"
import { getSops } from "@/lib/actions/sops"
import { OperationsLab } from "@/components/operations/operations-lab"
import type { ProjectType, PhaseSet, TaskSet, Profile, Sop, Position } from "@/lib/types"
import { getTranslations } from "next-intl/server"

export default async function OperationsPage() {
  const t = await getTranslations("operations")
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single()

  if (profile?.role !== "admin") redirect("/")

  const [projectTypes, phaseSets, taskSets, employees, positions, sops] = await Promise.all([
    getProjectTypes().catch(() => []),
    getPhaseSets().catch(() => []),
    getTaskSets().catch(() => []),
    getEmployees().catch(() => []),
    getPositions().catch(() => []),
    getSops().catch(() => []),
  ])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <OperationsLab
        projectTypes={projectTypes as ProjectType[]}
        phaseSets={phaseSets as PhaseSet[]}
        taskSets={taskSets as TaskSet[]}
        employees={employees as Profile[]}
        positions={positions as Position[]}
        sops={sops as Sop[]}
      />
    </div>
  )
}
