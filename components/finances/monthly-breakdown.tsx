"use client"

import { useState } from "react"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"

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

export function MonthlyBreakdown({ data }: MonthlyBreakdownProps) {
  // Show most recent months first
  const reversed = [...data].reverse()
  const [selectedMonth, setSelectedMonth] = useState<string | null>(reversed[0]?.month ?? null)

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
        <p className="text-sm font-semibold capitalize mb-3">{selected.label}</p>
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
    </div>
  )
}
