"use client"

import { useState } from "react"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { normalizeToMonthly } from "@/lib/types"
import type { Income, ProjectExpense, RecurringExpense, ExpenseFrequency } from "@/lib/types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ChartEntry {
  month: string
  label: string
  ingresos: number
  gastos: number
  margen: number
  gastosBreakdown: Record<string, number>
}

interface MonthlyBreakdownProps {
  data: ChartEntry[]
  income: Income[]
  projectExpenses: ProjectExpense[]
  recurring: RecurringExpense[]
}

const CATEGORY_LABELS: Record<string, string> = {
  Payroll:   "Nómina",
  Software:  "Software",
  Rent:      "Renta",
  Services:  "Servicios",
  Other:     "Otros",
  Proyectos: "Gastos de proyecto",
}

const CATEGORY_COLORS: Record<string, string> = {
  Payroll:   "bg-blue-500",
  Software:  "bg-purple-500",
  Rent:      "bg-yellow-500",
  Services:  "bg-orange-500",
  Other:     "bg-gray-400",
  Proyectos: "bg-pink-500",
}

const FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  Monthly:    "Mensual",
  Weekly:     "Semanal",
  Annual:     "Anual",
  Semestral:  "Semestral",
  "One-time": "Único",
}

export function MonthlyBreakdown({ data, income, projectExpenses, recurring }: MonthlyBreakdownProps) {
  // Show most recent months first
  const reversed = [...data].reverse()
  const [selectedMonth, setSelectedMonth] = useState<string | null>(reversed[0]?.month ?? null)
  const [modalOpen, setModalOpen] = useState(false)

  if (!data.length) {
    return <p className="text-center text-sm text-muted-foreground py-8">Sin datos</p>
  }

  const totalIngresos = data.reduce((s, d) => s + d.ingresos, 0)
  const totalGastos   = data.reduce((s, d) => s + d.gastos, 0)
  const totalMargen   = totalIngresos - totalGastos

  const maxValue = Math.max(...data.map((d) => Math.max(d.ingresos, d.gastos)), 1)

  const selected = reversed.find((d) => d.month === selectedMonth) ?? reversed[0]
  const breakdown = Object.entries(selected.gastosBreakdown)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])

  // Items para el modal de detalle completo
  const incomeItems = income.filter((i) => i.date.slice(0, 7) === selected.month)
  const projectExpenseItems = projectExpenses.filter((e) => e.date.slice(0, 7) === selected.month)
  const recurringFixedItems = recurring.filter((e) => e.is_active && e.frequency !== "One-time")
  const recurringOneTimeItems = recurring.filter(
    (e) => e.frequency === "One-time" && e.expense_date?.slice(0, 7) === selected.month
  )

  return (
    <div className="space-y-4">
      {/* Compact 12-month overview */}
      <div className="space-y-1">
        {reversed.map((entry, idx) => {
          const isSelected = entry.month === selected.month
          const isCurrentMonth = idx === 0
          const isPositive = entry.margen >= 0

          return (
            <button
              key={entry.month}
              onClick={() => setSelectedMonth(entry.month)}
              className={cn(
                "w-full flex items-center gap-3 px-2.5 py-1.5 rounded-md text-left transition-colors",
                isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/40"
              )}
            >
              <span className="text-xs font-medium capitalize w-12 flex-shrink-0">
                {entry.label}
                {isCurrentMonth && <span className="block text-[10px] text-primary font-normal">actual</span>}
              </span>
              <div className="flex-1 space-y-0.5">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${(entry.ingresos / maxValue) * 100}%` }} />
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${(entry.gastos / maxValue) * 100}%` }} />
                </div>
              </div>
              <span className={cn("text-xs font-semibold w-20 text-right flex-shrink-0", isPositive ? "text-blue-600" : "text-red-600")}>
                {entry.ingresos === 0 && entry.gastos === 0 ? "—" : formatCurrency(entry.margen)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Total row */}
      <div className="flex items-center gap-3 px-2.5 py-2 border-t text-sm">
        <span className="font-semibold flex-1">Total 12 meses</span>
        <span className="text-green-600 font-semibold">{formatCurrency(totalIngresos)}</span>
        <span className="text-red-500 font-semibold">{formatCurrency(totalGastos)}</span>
        <span className={cn("font-bold w-20 text-right", totalMargen >= 0 ? "text-blue-600" : "text-red-600")}>
          {formatCurrency(totalMargen)}
        </span>
      </div>

      {/* Selected month detail */}
      <div className="border rounded-lg p-4 bg-muted/20">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold capitalize">{selected.label}</p>
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>Ver detalle completo</Button>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs mb-4">
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Ingresos</p>
            <p className="font-semibold text-green-600 text-sm">{formatCurrency(selected.ingresos)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Gastos</p>
            <p className="font-semibold text-red-500 text-sm">{formatCurrency(selected.gastos)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">Margen neto</p>
            <p className={cn("font-semibold text-sm", selected.margen >= 0 ? "text-blue-600" : "text-red-600")}>
              {formatCurrency(selected.margen)}
            </p>
          </div>
        </div>

        {breakdown.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground mb-1">Gastos por categoría</p>
            {breakdown.map(([category, value]) => (
              <div key={category} className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0", CATEGORY_COLORS[category] ?? "bg-gray-400")} />
                <span className="text-xs text-muted-foreground flex-1">{CATEGORY_LABELS[category] ?? category}</span>
                <span className="text-xs font-medium">{formatCurrency(value)}</span>
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {selected.gastos > 0 ? `${((value / selected.gastos) * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin gastos registrados este mes</p>
        )}
      </div>

      {/* Modal: detalle completo del mes */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">{selected.label} — Detalle completo</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Ingresos */}
            <div>
              <h4 className="text-sm font-semibold text-green-600 mb-2">
                Ingresos ({formatCurrency(selected.ingresos)})
              </h4>
              {incomeItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin ingresos registrados este mes</p>
              ) : (
                <div className="space-y-1">
                  {incomeItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-xs gap-2 py-1 border-b last:border-0">
                      <span className="text-muted-foreground w-20 flex-shrink-0">{formatDate(item.date)}</span>
                      <span className="flex-1 truncate">
                        {item.description ?? "—"}
                        {item.project?.name && <span className="text-muted-foreground"> · {item.project.name}</span>}
                      </span>
                      <span className="font-medium text-green-600 flex-shrink-0">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Gastos */}
            <div>
              <h4 className="text-sm font-semibold text-red-500 mb-2">
                Gastos ({formatCurrency(selected.gastos)})
              </h4>

              {recurringFixedItems.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-1">Gastos recurrentes (normalizados a mensual)</p>
                  <div className="space-y-1">
                    {recurringFixedItems.map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-xs gap-2 py-1 border-b last:border-0">
                        <span className="flex-1 truncate">
                          {e.name}
                          <span className="text-muted-foreground"> · {CATEGORY_LABELS[e.category] ?? e.category} · {FREQUENCY_LABELS[e.frequency]}</span>
                        </span>
                        <span className="font-medium text-red-500 flex-shrink-0">
                          {formatCurrency(normalizeToMonthly(Number(e.amount), e.frequency))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {recurringOneTimeItems.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-1">Gastos únicos (one-time)</p>
                  <div className="space-y-1">
                    {recurringOneTimeItems.map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-xs gap-2 py-1 border-b last:border-0">
                        <span className="text-muted-foreground w-20 flex-shrink-0">{e.expense_date ? formatDate(e.expense_date) : "—"}</span>
                        <span className="flex-1 truncate">
                          {e.name}
                          <span className="text-muted-foreground"> · {CATEGORY_LABELS[e.category] ?? e.category}</span>
                        </span>
                        <span className="font-medium text-red-500 flex-shrink-0">{formatCurrency(Number(e.amount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {projectExpenseItems.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Gastos de proyecto</p>
                  <div className="space-y-1">
                    {projectExpenseItems.map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-xs gap-2 py-1 border-b last:border-0">
                        <span className="text-muted-foreground w-20 flex-shrink-0">{formatDate(e.date)}</span>
                        <span className="flex-1 truncate">
                          {e.description ?? "—"}
                          {e.project?.name && <span className="text-muted-foreground"> · {e.project.name}</span>}
                        </span>
                        <span className="font-medium text-red-500 flex-shrink-0">{formatCurrency(Number(e.amount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {recurringFixedItems.length === 0 && recurringOneTimeItems.length === 0 && projectExpenseItems.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin gastos registrados este mes</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
