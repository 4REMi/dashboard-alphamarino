"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { formatCurrency } from "@/lib/utils"
import type { RecurringExpense, ExpenseFrequency } from "@/lib/types"
import { normalizeToMonthly } from "@/lib/types"

const CATEGORY_COLORS: Record<string, string> = {
  Payroll:  "#3b82f6",
  Software: "#a855f7",
  Rent:     "#f59e0b",
  Services: "#f97316",
  Other:    "#6b7280",
}

const CATEGORY_LABELS: Record<string, string> = {
  Payroll:  "Nómina",
  Software: "Software",
  Rent:     "Renta",
  Services: "Servicios",
  Other:    "Otros",
}

interface ExpenseDonutProps {
  expenses: RecurringExpense[]
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { color: string } }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-semibold mb-1" style={{ color: p.payload.color }}>{p.name}</p>
      <p className="text-foreground font-medium">{formatCurrency(p.value)}/mes</p>
    </div>
  )
}

export function ExpenseDonut({ expenses }: ExpenseDonutProps) {
  const activeExpenses = expenses.filter((e) => e.is_active)
  const currentMonthKey = new Date().toISOString().slice(0, 7)

  const byCategory = Object.entries(
    activeExpenses.reduce<Record<string, number>>((acc, e) => {
      const monthly = e.frequency === "One-time"
        ? (e.expense_date?.slice(0, 7) === currentMonthKey ? Number(e.amount) : 0)
        : normalizeToMonthly(Number(e.amount), e.frequency as ExpenseFrequency)
      acc[e.category] = (acc[e.category] ?? 0) + monthly
      return acc
    }, {})
  )
    .map(([category, value]) => ({
      name: CATEGORY_LABELS[category] ?? category,
      value: Math.round(value),
      color: CATEGORY_COLORS[category] ?? "#6b7280",
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  if (byCategory.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        Sin gastos activos
      </div>
    )
  }

  const total = byCategory.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-full sm:w-52 flex-shrink-0">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={byCategory}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
            >
              {byCategory.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend + breakdown */}
      <div className="flex-1 w-full space-y-2">
        {byCategory.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-sm text-muted-foreground flex-1">{d.name}</span>
            <span className="text-sm font-medium">{formatCurrency(d.value)}</span>
            <span className="text-xs text-muted-foreground w-10 text-right">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
        <div className="border-t pt-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Total/mes</span>
          <span className="text-sm font-bold">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  )
}
