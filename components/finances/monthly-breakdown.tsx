"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface ChartEntry {
  month: string
  label: string
  ingresos: number
  gastos: number
  margen: number
}

interface MonthlyBreakdownProps {
  data: ChartEntry[]
}

export function MonthlyBreakdown({ data }: MonthlyBreakdownProps) {
  const [openMonth, setOpenMonth] = useState<string | null>(null)

  // Show most recent months first
  const reversed = [...data].reverse()

  if (!data.length) {
    return <p className="text-center text-sm text-muted-foreground py-8">Sin datos</p>
  }

  const totalIngresos = data.reduce((s, d) => s + d.ingresos, 0)
  const totalGastos   = data.reduce((s, d) => s + d.gastos, 0)
  const totalMargen   = totalIngresos - totalGastos

  return (
    <div className="space-y-1">
      {reversed.map((entry, idx) => {
        const isOpen    = openMonth === entry.month
        const isPositive = entry.margen >= 0
        const isCurrentMonth = idx === 0

        return (
          <div
            key={entry.month}
            className={cn(
              "border rounded-lg overflow-hidden",
              isCurrentMonth && "border-primary/30 bg-primary/5"
            )}
          >
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              onClick={() => setOpenMonth(isOpen ? null : entry.month)}
            >
              {isOpen
                ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
              <span className="font-medium text-sm capitalize flex-1">
                {entry.label}
                {isCurrentMonth && (
                  <span className="ml-2 text-xs text-primary font-normal">mes actual</span>
                )}
              </span>
              <div className="flex items-center gap-6 text-sm">
                <span className="hidden sm:block text-green-600 font-medium w-24 text-right">
                  {entry.ingresos > 0 ? formatCurrency(entry.ingresos) : "—"}
                </span>
                <span className="hidden sm:block text-red-500 font-medium w-24 text-right">
                  {entry.gastos > 0 ? formatCurrency(entry.gastos) : "—"}
                </span>
                <span className={cn(
                  "font-semibold w-24 text-right",
                  isPositive ? "text-blue-600" : "text-red-600"
                )}>
                  {entry.ingresos === 0 && entry.gastos === 0 ? "—" : formatCurrency(entry.margen)}
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-3 pt-1 border-t bg-muted/20">
                <div className="grid grid-cols-3 gap-3 text-xs mt-2">
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Ingresos</p>
                    <p className="font-semibold text-green-600 text-sm">
                      {formatCurrency(entry.ingresos)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Gastos</p>
                    <p className="font-semibold text-red-500 text-sm">
                      {formatCurrency(entry.gastos)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Margen neto</p>
                    <p className={cn("font-semibold text-sm", isPositive ? "text-blue-600" : "text-red-600")}>
                      {formatCurrency(entry.margen)}
                    </p>
                  </div>
                </div>
                {entry.ingresos > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Margen sobre ingresos</span>
                      <span className={isPositive ? "text-blue-600 font-medium" : "text-red-600 font-medium"}>
                        {entry.ingresos > 0 ? `${((entry.margen / entry.ingresos) * 100).toFixed(1)}%` : "—"}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", isPositive ? "bg-blue-500" : "bg-red-500")}
                        style={{ width: `${Math.min(Math.abs(entry.margen / entry.ingresos) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Totals row */}
      <div className="flex items-center gap-3 px-4 py-3 border rounded-lg bg-muted/30 mt-2">
        <span className="font-semibold text-sm flex-1">Total 12 meses</span>
        <div className="flex items-center gap-6 text-sm">
          <span className="hidden sm:block text-green-600 font-semibold w-24 text-right">
            {formatCurrency(totalIngresos)}
          </span>
          <span className="hidden sm:block text-red-500 font-semibold w-24 text-right">
            {formatCurrency(totalGastos)}
          </span>
          <span className={cn("font-bold w-24 text-right", totalMargen >= 0 ? "text-blue-600" : "text-red-600")}>
            {formatCurrency(totalMargen)}
          </span>
        </div>
      </div>
    </div>
  )
}
