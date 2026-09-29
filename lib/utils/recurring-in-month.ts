// ¿Un gasto recurrente cuenta en un mes dado? Solo desde su fecha de inicio
// y hasta su fecha de baja (ended_at, migración 105). Antes: todo gasto
// activo HOY se restaba en los 12 meses (incluso antes de existir), y
// desactivarlo lo borraba también del pasado.
// Un gasto inactivo sin ended_at (dado de baja antes de que existiera la
// columna) no cuenta en ningún mes, igual que antes.

export interface RecurringLike {
  frequency: string
  is_active: boolean
  start_date?: string | null
  ended_at?: string | null
  expense_date?: string | null
  created_at?: string | null
}

export function monthBounds(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(last).padStart(2, "0")}` }
}

export function recurringAppliesToMonth(e: RecurringLike, monthKey: string): boolean {
  if (!e.is_active && !e.ended_at) return false
  const { start, end } = monthBounds(monthKey)
  if (e.frequency === "One-time") return !!e.expense_date && e.expense_date >= start && e.expense_date <= end
  const begins = e.start_date ?? e.created_at?.slice(0, 10) ?? "0000-01-01"
  if (begins > end) return false
  if (e.ended_at && e.ended_at < start) return false
  return true
}
