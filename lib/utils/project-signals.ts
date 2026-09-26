// Señales de la tarjeta de proyecto (vista general). Solo se muestran si
// aplican; el detalle va en hover. Mismo código de color del dashboard.

export interface ProjectSignals {
  // Entregables del periodo actual del alcance del servicio.
  scope: {
    label: string
    done: number
    expected: number
    missing: string[]
    // El periodo anterior cerró incompleto.
    prevIncomplete: { label: string; done: number; expected: number } | null
  } | null
  // Ciclo de paid media (solo si hay algo que avisar o está activo).
  cycle: {
    start: string
    end: string
    daysLeft: number // negativo = vencido
    reviewPending: boolean
    metaSpend: number | null
    staleManual: string[]
  } | null
  changesRequested: string[] // concepto de cada pieza con cambios pedidos
  unpublished: number // borradores que el cliente no ha visto
  overdueTasks: string[]
  inactiveDays: number
}

export type SignalFilter = "scope_late" | "cycle_closing" | "changes" | "overdue" | "inactive"

export const SIGNAL_FILTER_LABEL: Record<SignalFilter, string> = {
  scope_late: "Entregables atrasados",
  cycle_closing: "Ciclo por cerrar",
  changes: "Cambios pedidos",
  overdue: "Tareas vencidas",
  inactive: "Inactivos",
}

export function scopeTone(s: NonNullable<ProjectSignals["scope"]>): "green" | "amber" | "red" {
  if (s.prevIncomplete) return "red"
  return s.expected > 0 && s.done >= s.expected ? "green" : "amber"
}

export function cycleNeedsAttention(c: ProjectSignals["cycle"]): boolean {
  return !!c && (c.reviewPending || c.daysLeft <= 3 || c.staleManual.length > 0)
}

export function matchesSignal(s: ProjectSignals | undefined, f: SignalFilter): boolean {
  if (!s) return false
  switch (f) {
    case "scope_late": return !!s.scope && scopeTone(s.scope) === "red"
    case "cycle_closing": return cycleNeedsAttention(s.cycle)
    case "changes": return s.changesRequested.length > 0
    case "overdue": return s.overdueTasks.length > 0
    case "inactive": return s.inactiveDays > 7
  }
}
