import { getMyCompensation } from "@/lib/actions/my-compensation"
import { MyCompensation } from "@/components/employees/my-compensation"

// Mi compensación — cada empleado ve SOLO la suya (reglas de la base de
// datos, migraciones 107/108). Aplica a quien tiene salario fijo.
export default async function MyCompensationPage() {
  const data = await getMyCompensation().catch(() => null)
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Mi compensación</h1>
        <p className="text-sm text-muted-foreground">Tu contrato actual, tus bonos pactados, tu reporte mensual de bonos y tus pagos.</p>
      </div>
      {!data || !data.comp || data.comp.base_salary === null || !data.comp.active ? (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-8 text-center max-w-2xl">
          Esta sección es para el equipo de nómina mensual. Si crees que deberías verla, avísale a la administración.
        </p>
      ) : (
        <MyCompensation comp={data.comp} agreements={data.agreements} payments={data.payments} reports={data.reports} pastReports={data.pastReports} projects={data.projects} />
      )}
    </div>
  )
}
