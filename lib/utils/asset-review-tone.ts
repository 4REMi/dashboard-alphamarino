// Código de color del estado de revisión de un asset — el mismo de las
// tarjetas de pieza del Creative Tracker: verde = aprobado, rojo = cambios
// pedidos, ámbar = borrador (sin publicar), neutro = esperando al cliente.
export type AssetReviewKey = "approved" | "changes" | "draft" | "waiting"

export function assetReviewTone(a: { clientVisible: boolean; clientStatus: string | null }): {
  key: AssetReviewKey
  label: string
  card: string
  pill: string
} {
  if (!a.clientVisible) return {
    key: "draft", label: "Borrador",
    card: "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-900",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  }
  if (a.clientStatus === "approved") return {
    key: "approved", label: "Aprobado",
    card: "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  }
  if (a.clientStatus === "changes_requested") return {
    key: "changes", label: "Cambios pedidos",
    card: "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-900",
    pill: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  }
  return {
    key: "waiting", label: "En revisión del cliente",
    card: "bg-card border-border",
    pill: "bg-muted text-muted-foreground",
  }
}
