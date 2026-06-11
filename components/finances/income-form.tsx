"use client"

import { useEffect, useState } from "react"
import { createIncome, updateIncome, getExchangeRate } from "@/lib/actions/finances"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Plus } from "lucide-react"
import type { Project, Currency, Income } from "@/lib/types"

interface IncomeFormProps {
  projects: Project[]
  income?: Income
  trigger?: React.ReactNode
}

export function IncomeForm({ projects, income, trigger }: IncomeFormProps) {
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState(income?.project_id ?? "none")
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState(
    income ? String(income.original_amount ?? income.amount) : ""
  )
  const [taxRate, setTaxRate] = useState(income?.tax_rate != null ? String(income.tax_rate) : "")
  const [currency, setCurrency] = useState<Currency>(income?.currency ?? "MXN")
  const [date, setDate] = useState(income?.date ?? new Date().toISOString().split("T")[0])
  const [exchangeRate, setExchangeRate] = useState(
    income?.exchange_rate != null ? String(income.exchange_rate) : ""
  )
  const [loadingRate, setLoadingRate] = useState(false)
  const [rateTouched, setRateTouched] = useState(!!income?.exchange_rate)

  // Tipo de cambio automático (USD -> MXN) según la fecha del ingreso
  useEffect(() => {
    if (currency !== "MXN" || rateTouched) return
    let cancelled = false
    setLoadingRate(true)
    getExchangeRate(date)
      .then((rate) => {
        if (!cancelled && rate) setExchangeRate(String(rate))
      })
      .finally(() => {
        if (!cancelled) setLoadingRate(false)
      })
    return () => { cancelled = true }
  }, [currency, date, rateTouched])

  const amountUsd = currency === "MXN"
    ? (Number(amount) && Number(exchangeRate) ? Number(amount) / Number(exchangeRate) : 0)
    : Number(amount) || 0

  const taxAmount = amountUsd && taxRate
    ? (amountUsd * Number(taxRate)) / 100
    : 0
  const total = amountUsd + taxAmount

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.set("project_id", projectId === "none" ? "" : projectId)
    formData.set("currency", currency)
    formData.set("original_amount", amount)
    formData.set("exchange_rate", currency === "MXN" ? exchangeRate : "1")
    formData.set("tax_amount", taxRate ? String(taxAmount) : "")

    try {
      if (income) {
        await updateIncome(income.id, formData)
      } else {
        await createIncome(formData)
      }
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="w-4 h-4" />
            Registrar Ingreso
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{income ? "Editar Ingreso" : "Nuevo Ingreso"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Monto neto *</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN (Pesos)</SelectItem>
                  <SelectItem value="USD">USD (Dólares)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha *</Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            {currency === "MXN" && (
              <div className="space-y-2">
                <Label htmlFor="exchange_rate">Tipo de cambio (USD→MXN)</Label>
                <Input
                  id="exchange_rate_display"
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder={loadingRate ? "Cargando..." : ""}
                  value={exchangeRate}
                  onChange={(e) => { setExchangeRate(e.target.value); setRateTouched(true) }}
                />
              </div>
            )}
          </div>
          {currency === "MXN" && (
            <div className="space-y-2">
              <Label>Equivalente en USD</Label>
              <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                {amountUsd > 0 ? `$${amountUsd.toFixed(2)}` : "—"}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tax_rate">Impuesto (%)</Label>
              <Input
                id="tax_rate"
                name="tax_rate"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej. 21 (IVA)"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Total facturado (USD)</Label>
              <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                {total > 0 ? `$${total.toFixed(2)}` : "—"}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Proyecto</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin proyecto específico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin proyecto</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" name="description" placeholder="Ej. Pago cuota proyecto X" defaultValue={income?.description ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoice_number">Número de Factura</Label>
            <Input id="invoice_number" name="invoice_number" placeholder="INV-001" defaultValue={income?.invoice_number ?? ""} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : income ? "Actualizar" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
