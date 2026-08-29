"use client"

import { useState } from "react"
import Link from "next/link"
import { CustomerStatusBadge } from "./customer-status-badge"
import { CustomerForm } from "./customer-form"
import { CustomerImportModal } from "./customer-import-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteCustomer } from "@/lib/actions/customers"
import { Search, Pencil, Trash2, ExternalLink, FolderOpen } from "lucide-react"
import type { Customer } from "@/lib/types"

interface CustomerTableProps {
  customers: Customer[]
  isAdmin: boolean
  canAddCustomers?: boolean
}

export function CustomerTable({ customers, isAdmin, canAddCustomers = isAdmin }: CustomerTableProps) {
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
        {canAddCustomers && (
          <div className="ml-auto">
            <CustomerImportModal />
          </div>
        )}
      </div>

      {/* ── Mobile: card list ──────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">No se encontraron clientes</p>
        )}
        {filtered.map((customer) => {
          const projects = customer.projects ?? []
          const activeProjects = projects.filter((p) => p.status === "Active")
          return (
            <div key={customer.id} className="border rounded-lg bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/customers/${customer.id}`} className="font-semibold text-sm hover:text-primary flex items-center gap-1 flex-1 min-w-0">
                  <span className="truncate">{customer.name}</span>
                  <ExternalLink className="w-3 h-3 opacity-50 flex-shrink-0" />
                </Link>
                <CustomerStatusBadge status={customer.status} />
              </div>
              {customer.company && (
                <p className="text-xs text-muted-foreground">{customer.company}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {customer.email && <span>{customer.email}</span>}
                {customer.phone && <span>{customer.phone}</span>}
              </div>
              <div className="flex items-center justify-between pt-1">
                {projects.length > 0 ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground" title={projects.map((p) => p.name).join(", ")}>
                    <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                    {activeProjects.length > 0 ? (
                      <span><span className="font-medium text-foreground">{activeProjects.length}</span> activo{activeProjects.length !== 1 ? "s" : ""}{projects.length > activeProjects.length ? ` (+${projects.length - activeProjects.length})` : ""}</span>
                    ) : (
                      <span>{projects.length} proyecto{projects.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                ) : <span />}
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <CustomerForm customer={customer} trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="w-3.5 h-3.5" /></Button>
                    } />
                    <form action={async () => { if (confirm(`¿Eliminar a ${customer.name}?`)) await deleteCustomer(customer.id) }}>
                      <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop: table ──────────────────────────────────────── */}
      <div className="hidden md:block border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empresa</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Proyectos</th>
              {isAdmin && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">
                  No se encontraron clientes
                </td>
              </tr>
            )}
            {filtered.map((customer) => {
              const projects = customer.projects ?? []
              const activeProjects = projects.filter((p) => p.status === "Active")
              return (
                <tr key={customer.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${customer.id}`} className="font-medium hover:text-primary flex items-center gap-1">
                      {customer.name}
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    </Link>
                  </td>
                  <td className="px-4 py-3"><CustomerStatusBadge status={customer.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{customer.company ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{customer.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{customer.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    {projects.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-1.5 cursor-default" title={projects.map((p) => p.name).join(", ")}>
                        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">
                          {activeProjects.length > 0 ? (
                            <><span className="font-medium text-foreground">{activeProjects.length}</span>{" activo"}{activeProjects.length !== 1 ? "s" : ""}{projects.length > activeProjects.length && <span className="ml-1 text-xs">(+{projects.length - activeProjects.length})</span>}</>
                          ) : (
                            <>{projects.length} proyecto{projects.length !== 1 ? "s" : ""}</>
                          )}
                        </span>
                      </div>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <CustomerForm customer={customer} trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="w-3.5 h-3.5" /></Button>
                        } />
                        <form action={async () => { if (confirm(`¿Eliminar a ${customer.name}?`)) await deleteCustomer(customer.id) }}>
                          <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} cliente{filtered.length !== 1 ? "s" : ""}</p>
    </div>
  )
}
