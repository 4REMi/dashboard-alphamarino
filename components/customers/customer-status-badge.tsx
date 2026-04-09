import { Badge } from "@/components/ui/badge"
import type { CustomerStatus } from "@/lib/types"

const statusConfig: Record<CustomerStatus, { label: string; variant: "success" | "info" | "secondary" }> = {
  Prospect: { label: "Prospecto", variant: "info" },
  Active:   { label: "Activo",    variant: "success" },
  Inactive: { label: "Inactivo",  variant: "secondary" },
}

export function CustomerStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as CustomerStatus] ?? { label: status, variant: "secondary" as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
