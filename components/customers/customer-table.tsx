"use client"

import { useState } from "react"
import Link from "next/link"
import { CustomerStatusBadge } from "./customer-status-badge"
import { CustomerForm } from "./customer-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteCustomer } from "@/lib/actions/customers"
import { Search, Pencil, Trash2, ExternalLink } from "lucide-react"
import type { Customer } from "@/lib/types"

interface CustomerTableProps {
  customers: Customer[]
  isAdmin: boolean
}

export function CustomerTable({ customers, isAdmin }: CustomerTableProps) {
  const [search, setSearch] = useState("")

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empresa</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Teléfono</th>
              {isAdmin && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No se encontraron clientes
                </td>
              </tr>
            )}
            {filtered.map((customer) => (
              <tr key={customer.id} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-medium hover:text-primary flex items-center gap-1"
                  >
                    {customer.name}
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <CustomerStatusBadge status={customer.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{customer.company ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{customer.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{customer.phone ?? "—"}</td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <CustomerForm
                        customer={customer}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        }
                      />
                      <form
                        action={async () => {
                          if (confirm(`¿Eliminar a ${customer.name}?`)) {
                            await deleteCustomer(customer.id)
                          }
                        }}
                      >
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} cliente{filtered.length !== 1 ? "s" : ""}</p>
    </div>
  )
}
