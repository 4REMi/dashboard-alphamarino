"use client"

import { useState, useTransition } from "react"
import { createDomain, updateDomain, deleteDomain } from "@/lib/actions/finances"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, Plus, Pencil, Trash2, X, Check } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Domain, Customer } from "@/lib/types"

interface DomainTableProps {
  initialDomains: Domain[]
  customers: Customer[]
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

interface DomainFormProps {
  domain?: Domain
  customers: Customer[]
  onSave: (formData: FormData) => Promise<void>
  onCancel: () => void
  isPending: boolean
}

function DomainForm({ domain, customers, onSave, onCancel, isPending }: DomainFormProps) {
  return (
    <form action={onSave} className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-muted/30 rounded-lg border">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Dominio *</label>
        <input
          name="domain"
          defaultValue={domain?.domain}
          required
          placeholder="ejemplo.com"
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Cliente</label>
        <select
          name="customer_id"
          defaultValue={domain?.customer_id ?? "none"}
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="none">Sin cliente</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Registrador</label>
        <input
          name="registrar"
          defaultValue={domain?.registrar ?? ""}
          placeholder="GoDaddy, Namecheap..."
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Fecha de renovación</label>
        <input
          name="renewal_date"
          type="date"
          defaultValue={domain?.renewal_date ?? ""}
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Costo de renovación</label>
        <input
          name="renewal_cost"
          type="number"
          step="0.01"
          min="0"
          defaultValue={domain?.renewal_cost ?? ""}
          placeholder="0.00"
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Notas</label>
        <input
          name="notes"
          defaultValue={domain?.notes ?? ""}
          placeholder="Notas adicionales"
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          <X className="w-3.5 h-3.5 mr-1" />
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          <Check className="w-3.5 h-3.5 mr-1" />
          {isPending ? "Guardando..." : domain ? "Actualizar" : "Agregar"}
        </Button>
      </div>
    </form>
  )
}

export function DomainTable({ initialDomains, customers }: DomainTableProps) {
  const [domains, setDomains] = useState<Domain[]>(initialDomains)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleCreate(formData: FormData) {
    startTransition(async () => {
      await createDomain(formData)
      setShowAddForm(false)
    })
  }

  async function handleUpdate(id: string, formData: FormData) {
    startTransition(async () => {
      await updateDomain(id, formData)
      setEditingId(null)
    })
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este dominio?")) return
    startTransition(async () => {
      await deleteDomain(id)
      setDomains((prev) => prev.filter((d) => d.id !== id))
    })
  }

  const expiring = domains.filter((d) => {
    const days = daysUntil(d.renewal_date)
    return days !== null && days <= 30 && days >= 0
  })

  return (
    <div className="space-y-4">
      {/* Expiring alert */}
      {expiring.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {expiring.length} dominio{expiring.length !== 1 ? "s" : ""} vence{expiring.length === 1 ? "" : "n"} en los próximos 30 días
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {expiring.map((d) => {
                  const days = daysUntil(d.renewal_date)
                  return (
                    <span key={d.id} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {d.domain} — {days === 0 ? "hoy" : `${days}d`}
                    </span>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add form */}
      {showAddForm ? (
        <DomainForm
          customers={customers}
          onSave={handleCreate}
          onCancel={() => setShowAddForm(false)}
          isPending={isPending}
        />
      ) : (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Agregar dominio
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[540px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Dominio</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Cliente</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Registrador</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Renovación</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Costo</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Notas</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {domains.length === 0 && !showAddForm && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No hay dominios registrados
                </td>
              </tr>
            )}
            {domains.map((domain) => {
              const days = daysUntil(domain.renewal_date)
              const isExpiringSoon = days !== null && days <= 30 && days >= 0
              const isExpired = days !== null && days < 0

              if (editingId === domain.id) {
                return (
                  <tr key={domain.id}>
                    <td colSpan={7} className="p-0">
                      <DomainForm
                        domain={domain}
                        customers={customers}
                        onSave={(fd) => handleUpdate(domain.id, fd)}
                        onCancel={() => setEditingId(null)}
                        isPending={isPending}
                      />
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={domain.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {domain.domain}
                      {isExpiringSoon && (
                        <Badge variant="warning" className="text-xs">
                          {days === 0 ? "Hoy" : `${days}d`}
                        </Badge>
                      )}
                      {isExpired && (
                        <Badge variant="destructive" className="text-xs">
                          Vencido
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {(domain.customer as { name: string } | null | undefined)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{domain.registrar ?? "—"}</td>
                  <td className={`px-4 py-3 ${isExpiringSoon ? "text-amber-600 font-medium" : isExpired ? "text-red-600" : "text-muted-foreground"}`}>
                    {domain.renewal_date ? formatDate(domain.renewal_date) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {domain.renewal_cost ? formatCurrency(domain.renewal_cost) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate hidden lg:table-cell">
                    {domain.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingId(domain.id)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(domain.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
