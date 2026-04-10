"use client"

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts"
import { formatCurrency } from "@/lib/utils"

interface ChartEntry {
  month: string
  label: string
  ingresos: number
  gastos: number
  margen: number
}

interface YearChartProps {
  data: ChartEntry[]
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className={`font-medium ${p.name === "Margen" ? (p.value >= 0 ? "text-green-600" : "text-red-600") : "text-foreground"}`}>
            {formatCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function YearChart({ data }: YearChartProps) {
  if (!data.length) {
    return (
      <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
        No hay datos suficientes
      </div>
    )
  }

  const hasNegativeMargin = data.some((d) => d.margen < 0)

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f87171" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
        />

        {hasNegativeMargin && <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />}

        <Area
          type="monotone"
          dataKey="ingresos"
          name="Ingresos"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#gradIngresos)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="gastos"
          name="Gastos"
          stroke="#f87171"
          strokeWidth={2}
          fill="url(#gradGastos)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Line
          type="monotone"
          dataKey="margen"
          name="Margen"
          stroke="#a855f7"
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: "#a855f7" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
