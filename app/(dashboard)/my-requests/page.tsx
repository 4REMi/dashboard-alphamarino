export const dynamic = "force-dynamic"

import { getMyRequests } from "@/lib/actions/creative-requests"
import { MyCreativeRequests } from "@/components/lab/my-creative-requests"
import { ClipboardList } from "lucide-react"

export default async function MyRequestsPage() {
  const requests = await getMyRequests().catch(() => [])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mis Solicitudes</h1>
          <p className="text-sm text-muted-foreground">
            Assets de video e imagen asignados a ti, en todos los proyectos
          </p>
        </div>
      </div>

      <MyCreativeRequests requests={requests} />
    </div>
  )
}
