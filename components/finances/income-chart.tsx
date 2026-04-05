"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { Income, ProjectExpense } from "@/lib/types"
import { format, parseISO, startOfMonth } from "date-fns"
import { es } from "date-fns/locale"

interface IncomeChartProps {
  income: Income[]
  expenses: ProjectExpense[]
}

function aggregateByMonth(items: { date: string; amount: number }[]) {
  const map: Record<string, number> = {}
  items.forEach((item) => {
    const key = format(startOfMonth(parseISO(item.date)), "yyyy-MM")
    map[key] = (map[key] ?? 0) + Number(item.amount)
  })
  return map
}

export function IncomeChart({ income, expenses }: IncomeChartProps) {
  const incomeByMonth = aggregateByMonth(income.map((i) => ({ date: i.date, amount: i.amount })))
  const expensesByMonth = aggregateByMonth(expenses.map((e) => ({ date: e.date, amount: e.amount })))

  const allMonths = Array.from(
    new Set([...Object.keys(incomeByMonth), ...Object.keys(expensesByMonth)])
  ).sort()

  const data = allMonths.map((month) => ({
    month: format(parseISO(`${month}-01`), "MMM yy", { locale: es }),
    Ingresos: Math.round(incomeByMonth[month] ?? 0),
    Gastos: Math.round(expensesByMonth[month] ?? 0),
    Margen: Math.round((incomeByMonth[month] ?? 0) - (expensesByMonth[month] ?? 0)),
  }))

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        No hay datos de ingresos aún
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(value, name) => [`$${Number(value).toLocaleString()}`, name as string]}
          contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0" }}
        />
        <Legend />
        <Bar dataKey="Ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Gastos" fill="#f87171" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Margen" fill="#4ade80" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
