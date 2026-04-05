import { Badge } from "@/components/ui/badge"
import type { CustomerStatus } from "@/lib/types"

const statusConfig: Record<CustomerStatus, { label: string; variant: "success" | "info" | "secondary" | "destructive" }> = {
  Prospect: { label: "Prospecto", variant: "info" },
  Active: { label: "Activo", variant: "success" },
  Inactive: { label: "Inactivo", variant: "secondary" },
  Churned: { label: "Perdido", variant: "destructive" },
}

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
