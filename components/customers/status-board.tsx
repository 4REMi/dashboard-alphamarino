"use client"

import { useState } from "react"
import { updateCustomerStatus } from "@/lib/actions/customers"
import { CustomerStatusBadge } from "./customer-status-badge"
import { Mail, Phone, Building2 } from "lucide-react"
import type { Customer, CustomerStatus } from "@/lib/types"

const COLUMNS: { status: CustomerStatus; label: string; color: string }[] = [
  { status: "Prospect", label: "Prospectos", color: "border-blue-200 bg-blue-50" },
  { status: "Active", label: "Activos", color: "border-green-200 bg-green-50" },
  { status: "Inactive", label: "Inactivos", color: "border-gray-200 bg-gray-50" },
  { status: "Churned", label: "Perdidos", color: "border-red-200 bg-red-50" },
]

interface StatusBoardProps {
  customers: Customer[]
  isAdmin: boolean
}

export function StatusBoard({ customers, isAdmin }: StatusBoardProps) {
  const [items, setItems] = useState(customers)

  async function handleDrop(customerId: string, newStatus: CustomerStatus) {
    setItems((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, status: newStatus } : c))
    )
    await updateCustomerStatus(customerId, newStatus)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const columnItems = items.filter((c) => c.status === col.status)
        return (
          <div
            key={col.status}
            className={`rounded-xl border-2 ${col.color} min-h-[300px]`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData("customerId")
              if (id) handleDrop(id, col.status)
            }}
          >
            <div className="px-4 py-3 border-b border-current/10">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{col.label}</h3>
                <span className="text-xs font-medium text-muted-foreground bg-white rounded-full px-2 py-0.5">
                  {columnItems.length}
                </span>
              </div>
            </div>
            <div className="p-3 space-y-2">
              {columnItems.map((customer) => (
                <div
                  key={customer.id}
                  draggable={isAdmin}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("customerId", customer.id)
                  }}
                  className="bg-white rounded-lg border shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                >
                  <p className="font-medium text-sm">{customer.name}</p>
                  {customer.company && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Building2 className="w-3 h-3" />
                      {customer.company}
                    </p>
                  )}
                  {customer.email && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Mail className="w-3 h-3" />
                      {customer.email}
                    </p>
                  )}
                  {customer.phone && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Phone className="w-3 h-3" />
                      {customer.phone}
                    </p>
                  )}
                </div>
              ))}
              {columnItems.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Sin clientes
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
