import Link from "next/link"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuditAccessUser } from "@/lib/ad-audit/access"
import { loadMetricDefs } from "@/lib/ad-audit/queries"
import { MetricsEditor } from "@/components/ad-audit/metrics-editor"

export const dynamic = "force-dynamic"

// Métricas de auditoría: fórmulas de la agencia. Todos con acceso a Ad Lab
// las ven; solo admin/subadmin las cambian (saveMetricOverride lo exige).
export default async function AuditMetricsPage() {
  const user = await getAuditAccessUser()
  if (!user) redirect("/")
  const { data: profile } = await createAdminClient().from("profiles").select("role").eq("id", user.id).single()
  const canEdit = profile?.role === "admin" || profile?.role === "subadmin"
  const defs = await loadMetricDefs()
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <Link href="/ad-lab/auditorias" className="text-xs text-muted-foreground hover:underline">← Auditorías</Link>
        <h1 className="text-2xl font-bold tracking-tight">Métricas de auditoría</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Se definen una vez para toda la agencia y se aplican en todas las cuentas, incluidas las auditorías anteriores (se guardan los conteos de Meta, no los porcentajes).
          Conversiones con atribución de 7 días después del clic. Se compara contra la mediana del conjunto; debajo de la muestra mínima no se juzga.
          {!canEdit && " Solo admin y subadmin pueden cambiarlas."}
        </p>
      </div>
      <MetricsEditor defs={defs} canEdit={canEdit} />
    </div>
  )
}
