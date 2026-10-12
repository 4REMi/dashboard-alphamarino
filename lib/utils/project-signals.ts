// Señales de la tarjeta de proyecto (vista general). Solo se muestran si
// aplican; el detalle va en hover. Mismo código de color del dashboard.

export interface ProjectSignals {
  // Entregables del periodo actual del alcance del servicio.
  scope: {
    kind: "periodo" | "hitos"   // recurrente (periodo actual) o de una vez
    label: string
    done: number
    expected: number
    // Cuánto del periodo ya pasó (0–1); null en hitos de una vez.
    timePct: number | null
    day: number | null
    days: number | null
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
  // Tiene ofertas o entregables propios asignados (aunque el periodo aún no se haya abierto).
  hasScope: boolean
  isInternal: boolean
}

export type SignalFilter = "scope_late" | "no_scope" | "cycle_closing" | "changes" | "overdue" | "inactive"

export const SIGNAL_FILTER_LABEL: Record<SignalFilter, string> = {
  scope_late: "Entregables atrasados",
  no_scope: "Sin alcance definido",
  cycle_closing: "Ciclo por cerrar",
  changes: "Cambios pedidos",
  overdue: "Tareas vencidas",
  inactive: "Inactivos",
}

// Ritmo: lo entregado contra cuánto del periodo ya pasó. Verde al día,
// ámbar algo atrasado, rojo muy atrasado (o periodo anterior incompleto).
export function scopeTone(s: NonNullable<ProjectSignals["scope"]>): "green" | "amber" | "red" {
  if (s.prevIncomplete) return "red"
  if (s.expected <= 0 || s.done >= s.expected) return "green"
  if (s.timePct == null) return "amber"
  const pct = s.done / s.expected
  if (pct >= s.timePct - 0.1) return "green"
  if (pct >= s.timePct - 0.35 && s.timePct < 0.9) return "amber"
  return "red"
}

export function noScope(s: ProjectSignals | undefined): boolean {
  return !!s && !s.isInternal && !s.hasScope
}

export function cycleNeedsAttention(c: ProjectSignals["cycle"]): boolean {
  return !!c && (c.reviewPending || c.daysLeft <= 3 || c.staleManual.length > 0)
}

export function matchesSignal(s: ProjectSignals | undefined, f: SignalFilter): boolean {
  if (!s) return false
  switch (f) {
    case "scope_late": return !!s.scope && scopeTone(s.scope) === "red"
    case "no_scope": return noScope(s)
    case "cycle_closing": return cycleNeedsAttention(s.cycle)
    case "changes": return s.changesRequested.length > 0
    case "overdue": return s.overdueTasks.length > 0
    case "inactive": return s.inactiveDays > 7
  }
}
