"use client"

import { useState } from "react"
import { createRecurringExpense, updateRecurringExpense } from "@/lib/actions/finances"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Plus } from "lucide-react"
import type { RecurringExpense } from "@/lib/types"

interface ExpenseFormProps {
  expense?: RecurringExpense
  trigger?: React.ReactNode
}

export function ExpenseForm({ expense, trigger }: ExpenseFormProps) {
  const [open, setOpen] = useState(false)
  const [frequency, setFrequency] = useState<string>(expense?.frequency ?? "Monthly")
  const [category, setCategory] = useState<string>(expense?.category ?? "Other")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.set("frequency", frequency)
    formData.set("category", category)

    try {
      if (expense) {
        await updateRecurringExpense(expense.id, formData)
      } else {
        await createRecurringExpense(formData)
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
            Nuevo Gasto Recurrente
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? "Editar Gasto Recurrente" : "Nuevo Gasto Recurrente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" name="name" defaultValue={expense?.name} placeholder="Ej. Salario Juan" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Monto (USD) *</Label>
              <Input id="amount" name="amount" type="number" min="0" step="0.01" defaultValue={expense?.amount} required />
            </div>
            <div className="space-y-2">
              <Label>Frecuencia</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Monthly">Mensual</SelectItem>
                  <SelectItem value="Weekly">Semanal</SelectItem>
                  <SelectItem value="Annual">Anual</SelectItem>
                  <SelectItem value="One-time">Único</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Payroll">Nómina (Payroll)</SelectItem>
                <SelectItem value="Software">Software / Herramientas</SelectItem>
                <SelectItem value="Rent">Renta / Alquiler</SelectItem>
                <SelectItem value="Utilities">Servicios</SelectItem>
                <SelectItem value="Other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_date">Fecha Inicio</Label>
            <Input id="start_date" name="start_date" type="date" defaultValue={expense?.start_date ?? new Date().toISOString().split("T")[0]} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : expense ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
