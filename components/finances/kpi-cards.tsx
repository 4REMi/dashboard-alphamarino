"use client"

import { useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, DollarSign, Repeat, Percent, ArrowUp, ArrowDown, Minus, Coins } from "lucide-react"
import { formatCurrency, cn } from "@/lib/utils"
import { getExchangeRate } from "@/lib/actions/finances"

interface KpiCardsProps {
  monthlyIncome: number
  prevIncome: number
  monthlyExpenses: number
  prevExpenses: number
  netMargin: number
  prevNetMargin: number
  mrr: number
  marginPct: number
  labels: { income: string; expenses: string; balance: string; mrr: string }
}

function TrendBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0) return null
  const pct = ((current - prev) / Math.abs(prev)) * 100
  const up = pct > 0
  const flat = Math.abs(pct) < 0.5

  if (flat) return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="w-3 h-3" /> Sin cambio
    </span>
  )

  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-green-600" : "text-red-500"}`}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}% vs mes ant.
    </span>
  )
}

export function KpiCards({
  monthlyIncome, prevIncome, monthlyExpenses, prevExpenses,
  netMargin, prevNetMargin, mrr, marginPct, labels,
}: KpiCardsProps) {
  const [showMxn, setShowMxn] = useState(false)
  const [rate, setRate] = useState<number | null>(null)
  const [loadingRate, setLoadingRate] = useState(false)
  const fetched = useRef(false)

  function startHold() {
    setShowMxn(true)
    if (!fetched.current) {
      fetched.current = true
      setLoadingRate(true)
      const today = new Date().toISOString().split("T")[0]
      getExchangeRate(today)
        .then((r) => setRate(r))
        .finally(() => setLoadingRate(false))
    }
  }

  function endHold() {
    setShowMxn(false)
  }

  function fmt(amountUsd: number) {
    if (!showMxn) return formatCurrency(amountUsd)
    if (loadingRate) return "…"
    if (!rate) return "—"
    return formatCurrency(amountUsd * rate, "MXN")
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{labels.income}</p>
              <div className="p-2 bg-green-50 rounded-lg"><TrendingUp className="w-4 h-4 text-green-600" /></div>
            </div>
            <p className="text-2xl font-bold text-green-700">{fmt(monthlyIncome)}</p>
            <div className="mt-1"><TrendBadge current={monthlyIncome} prev={prevIncome} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{labels.expenses}</p>
              <div className="p-2 bg-red-50 rounded-lg"><TrendingDown className="w-4 h-4 text-red-600" /></div>
            </div>
            <p className="text-2xl font-bold text-red-700">{fmt(monthlyExpenses)}</p>
            <div className="mt-1"><TrendBadge current={monthlyExpenses} prev={prevExpenses} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{labels.balance}</p>
              <div className={`p-2 rounded-lg ${netMargin >= 0 ? "bg-blue-50" : "bg-red-50"}`}>
                <DollarSign className={`w-4 h-4 ${netMargin >= 0 ? "text-blue-600" : "text-red-600"}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${netMargin >= 0 ? "text-blue-700" : "text-red-700"}`}>
              {fmt(netMargin)}
            </p>
            <div className="mt-1"><TrendBadge current={netMargin} prev={prevNetMargin} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{labels.mrr}</p>
              <div className="p-2 bg-purple-50 rounded-lg"><Repeat className="w-4 h-4 text-purple-600" /></div>
            </div>
            <p className="text-2xl font-bold text-purple-700">{fmt(mrr)}</p>
            <p className="text-xs text-muted-foreground mt-1">≈ {fmt(mrr * 12)}/año</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Margen</p>
              <div className={`p-2 rounded-lg ${marginPct >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
                <Percent className={`w-4 h-4 ${marginPct >= 0 ? "text-emerald-600" : "text-red-600"}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${marginPct >= 20 ? "text-emerald-600" : marginPct >= 0 ? "text-yellow-600" : "text-red-600"}`}>
              {marginPct.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">sobre ingresos del mes</p>
          </CardContent>
        </Card>
      </div>

      <button
        type="button"
        onMouseDown={startHold}
        onMouseUp={endHold}
        onMouseLeave={endHold}
        onTouchStart={startHold}
        onTouchEnd={endHold}
        className={cn(
          "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border select-none transition-colors",
          showMxn ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted"
        )}
      >
        <Coins className="w-3.5 h-3.5" />
        {showMxn
          ? (loadingRate ? "Cargando tipo de cambio..." : rate ? `Viendo en MXN (${rate} MXN/USD)` : "No se pudo obtener el tipo de cambio")
          : "Mantén presionado para ver en pesos mexicanos"}
      </button>
    </div>
  )
}
