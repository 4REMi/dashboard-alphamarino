"use client"

import { useState, useTransition } from "react"
import { createDomain, updateDomain, deleteDomain, renewDomain } from "@/lib/actions/finances"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, Plus, Pencil, Trash2, X, Check, RefreshCw } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"
import type { Domain, Customer, DomainMaintenanceType } from "@/lib/types"

const MAINTENANCE_TYPE_LABEL: Record<DomainMaintenanceType, string> = {
  client: "Cliente",
  own_project: "Proyecto propio",
  n_a: "N/A",
}

function formatMXN(amount: number) {
  return amount.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatUSD(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function DualCurrency({ amount, exchangeRate }: { amount: number; exchangeRate: number | null }) {
  return (
    <div>
      <div>{formatMXN(amount)}</div>
      {exchangeRate && (
        <div className="text-xs font-normal text-muted-foreground">
          ≈ {formatUSD(amount / exchangeRate)} USD
        </div>
      )}
    </div>
  )
}

interface DomainTableProps {
  initialDomains: Domain[]
  customers: Customer[]
  exchangeRate: number | null
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

type ExpirationTier = "green" | "yellow" | "red"

function expirationTier(days: number | null): ExpirationTier | null {
  if (days === null) return null
  if (days <= 60) return "red"
  if (days <= 182) return "yellow"
  return "green"
}

const EXPIRATION_TIER_CLASS: Record<ExpirationTier, string> = {
  green: "bg-success-subtle text-success-subtle-foreground",
  yellow: "bg-warning-subtle text-warning-subtle-foreground",
  red: "bg-red-100 text-red-700",
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
        <label className="text-xs font-medium text-muted-foreground">Comprado en</label>
        <input
          name="registrar"
          defaultValue={domain?.registrar ?? ""}
          placeholder="HostGator, GoDaddy..."
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Hosteado en</label>
        <input
          name="hosted_at"
          defaultValue={domain?.hosted_at ?? ""}
          placeholder="HostGator, NixiHost..."
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Fecha de vencimiento</label>
        <input
          name="renewal_date"
          type="date"
          defaultValue={domain?.renewal_date ?? ""}
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Costo del dominio (MXN)</label>
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
        <label className="text-xs font-medium text-muted-foreground">Tipo de mantenimiento</label>
        <select
          name="maintenance_type"
          defaultValue={domain?.maintenance_type ?? "client"}
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="client">Cliente</option>
          <option value="own_project">Proyecto propio</option>
          <option value="n_a">N/A</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Costo de mantenimiento (MXN)</label>
        <input
          name="maintenance_cost"
          type="number"
          step="0.01"
          min="0"
          defaultValue={domain?.maintenance_cost ?? ""}
          placeholder="0.00 (solo si el tipo es Cliente)"
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Fecha de último mantenimiento</label>
        <input
          name="last_maintenance_date"
          type="date"
          defaultValue={domain?.last_maintenance_date ?? ""}
          className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Último mantenimiento</label>
        <input
          name="last_maintenance_notes"
          defaultValue={domain?.last_maintenance_notes ?? ""}
          placeholder="Qué se hizo la última vez"
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

function addOneYear(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split("T")[0]
}

function DomainRenewModal({ domain, exchangeRate, onClose, onRenewed }: {
  domain: Domain
  exchangeRate: number | null
  onClose: () => void
  onRenewed: (patch: Partial<Domain>) => void
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [chargeDomain, setChargeDomain] = useState(!!domain.renewal_cost)
  const [chargeMaintenance, setChargeMaintenance] = useState(domain.maintenance_type === "client" && !!domain.maintenance_cost)
  const [extendYear, setExtendYear] = useState(!!domain.renewal_date)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const billsMaintenance = domain.maintenance_type === "client" && !!domain.maintenance_cost
  const totalCharge = (chargeDomain ? domain.renewal_cost ?? 0 : 0) + (chargeMaintenance ? domain.maintenance_cost ?? 0 : 0)

  function handleConfirm() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("date", date)
      fd.set("notes", notes)
      fd.set("charge_domain", chargeDomain ? "true" : "false")
      fd.set("charge_maintenance", chargeMaintenance ? "true" : "false")
      fd.set("extend_year", extendYear ? "true" : "false")
      await renewDomain(domain.id, fd)
      onRenewed({
        last_maintenance_date: date,
        last_maintenance_notes: notes || null,
        renewal_date: extendYear && domain.renewal_date ? addOneYear(domain.renewal_date) : domain.renewal_date,
      })
      toast(
        totalCharge > 0 ? "Cobro registrado y enviado a Ingresos" : "Mantención registrada",
        "success"
      )
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-sm">Renovar dominio</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{domain.domain}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">¿Qué se cobró en esta renovación?</p>

            <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-input bg-background text-sm cursor-pointer select-none">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chargeDomain}
                  disabled={!domain.renewal_cost}
                  onChange={(e) => setChargeDomain(e.target.checked)}
                  className="accent-info"
                />
                Cuota de dominio
              </span>
              <span className="text-muted-foreground">
                {domain.renewal_cost ? <DualCurrency amount={domain.renewal_cost} exchangeRate={exchangeRate} /> : "—"}
              </span>
            </label>

            <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-input bg-background text-sm cursor-pointer select-none">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chargeMaintenance}
                  disabled={!billsMaintenance}
                  onChange={(e) => setChargeMaintenance(e.target.checked)}
                  className="accent-info"
                />
                Cuota de mantenimiento
              </span>
              <span className="text-muted-foreground">
                {billsMaintenance
                  ? <DualCurrency amount={domain.maintenance_cost as number} exchangeRate={exchangeRate} />
                  : MAINTENANCE_TYPE_LABEL[domain.maintenance_type]}
              </span>
            </label>
          </div>

          {totalCharge > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50/60 border border-amber-200 rounded-md px-2.5 py-1.5">
              Al confirmar, se creará{chargeDomain && chargeMaintenance ? "n" : ""} un ingreso por {formatMXN(totalCharge)} en Finanzas.
            </p>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-input bg-background text-sm cursor-pointer select-none">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={extendYear}
                disabled={!domain.renewal_date}
                onChange={(e) => setExtendYear(e.target.checked)}
                className="accent-info"
              />
              Renovar vencimiento +1 año
            </span>
            {domain.renewal_date && (
              <span className="text-xs text-muted-foreground">
                {extendYear ? formatDate(addOneYear(domain.renewal_date)) : formatDate(domain.renewal_date)}
              </span>
            )}
          </label>
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm} disabled={isPending}>
            <Check className="w-3.5 h-3.5 mr-1" />
            {isPending ? "Guardando..." : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DomainTable({ initialDomains, customers, exchangeRate }: DomainTableProps) {
  const [domains, setDomains] = useState<Domain[]>(initialDomains)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renewingDomain, setRenewingDomain] = useState<Domain | null>(null)
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

      {exchangeRate && (
        <p className="text-xs text-muted-foreground">
          Tipo de cambio del día: 1 USD ≈ {formatMXN(exchangeRate)}
        </p>
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
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Dominio</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Cliente</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Comprado en</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Hosteado en</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vencimiento</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Costo dominio (MXN)</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Mantenimiento (MXN)</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Última mantención</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Notas</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {domains.length === 0 && !showAddForm && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                  No hay dominios registrados
                </td>
              </tr>
            )}
            {domains.map((domain) => {
              const days = daysUntil(domain.renewal_date)
              const isExpiringSoon = days !== null && days <= 30 && days >= 0
              const isExpired = days !== null && days < 0
              const tier = expirationTier(days)

              if (editingId === domain.id) {
                return (
                  <tr key={domain.id}>
                    <td colSpan={10} className="p-0">
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
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{domain.hosted_at ?? "—"}</td>
                  <td className={`px-4 py-3 ${tier ? `${EXPIRATION_TIER_CLASS[tier]} font-medium` : "text-muted-foreground"}`}>
                    {domain.renewal_date ? formatDate(domain.renewal_date) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {domain.renewal_cost ? <DualCurrency amount={domain.renewal_cost} exchangeRate={exchangeRate} /> : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {domain.maintenance_type === "client" ? (
                      domain.maintenance_cost ? <DualCurrency amount={domain.maintenance_cost} exchangeRate={exchangeRate} /> : "—"
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        {MAINTENANCE_TYPE_LABEL[domain.maintenance_type]}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                    <div>{domain.last_maintenance_date ? formatDate(domain.last_maintenance_date) : "—"}</div>
                    {domain.last_maintenance_notes && (
                      <div className="max-w-[180px] truncate text-muted-foreground/80">{domain.last_maintenance_notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate hidden lg:table-cell">
                    {domain.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {(tier === "red" || tier === "yellow") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setRenewingDomain(domain)}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Renovar
                        </Button>
                      )}
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

      {renewingDomain && (
        <DomainRenewModal
          domain={renewingDomain}
          exchangeRate={exchangeRate}
          onClose={() => setRenewingDomain(null)}
          onRenewed={(patch) => {
            setDomains((prev) => prev.map((d) => d.id === renewingDomain.id ? { ...d, ...patch } : d))
          }}
        />
      )}
    </div>
  )
}
