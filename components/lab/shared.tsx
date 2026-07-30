// Shared UI primitives — used by Operations Lab (admin) and modal components

import { Plus, Trash2 } from "lucide-react"

export function InlineInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded border border-input bg-background px-2 py-1.5 text-sm " +
        "focus:outline-none focus:ring-1 focus:ring-ring " +
        (props.className ?? "")
      }
    />
  )
}

export function InlineSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }
) {
  const { children, ...rest } = props
  return (
    <select
      {...rest}
      className={
        "w-full rounded border border-input bg-background px-2 py-1.5 text-sm " +
        "focus:outline-none focus:ring-1 focus:ring-ring " +
        (rest.className ?? "")
      }
    >
      {children}
    </select>
  )
}

export function PanelHeader({
  title, subtitle, onAdd, onDelete, extraActions,
}: {
  title: string
  subtitle?: string
  onAdd?: () => void
  onDelete?: () => void
  extraActions?: React.ReactNode
}) {
  return (
    <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-start justify-between gap-2 flex-shrink-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
        {extraActions}
        {onDelete && (
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {onAdd && (
          <button
            onClick={onAdd}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// Status labels/colors shared by any UI surfacing lab_phases / lab_proposed_*
// statuses (draft/submitted/approved/rejected) — Árbol Canónico, Mis Propuestas.
export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", submitted: "En revisión", approved: "Aprobada", rejected: "Rechazada",
}
export const PROPOSAL_STATUS_COLOR: Record<string, string> = {
  draft:     "border-muted text-muted-foreground bg-muted",
  submitted: "border-amber-300 text-amber-700 bg-amber-500/15",
  approved:  "border-emerald-300 text-emerald-700 bg-emerald-500/15",
  rejected:  "border-destructive/30 text-destructive bg-destructive/10",
}

export function EmptyPanel({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
      <Icon className="w-8 h-8 text-muted-foreground/25" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
