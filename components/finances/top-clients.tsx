"use client"

import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import { ExternalLink } from "lucide-react"

interface TopClient {
  id: string
  name: string
  company: string | null
  total: number
}

interface TopClientsProps {
  clients: TopClient[]
}

export function TopClients({ clients }: TopClientsProps) {
  if (!clients.length) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        Sin datos de ingresos por cliente
      </p>
    )
  }

  const max = clients[0].total

  return (
    <div className="space-y-3">
      {clients.map((client, idx) => {
        const pct = max > 0 ? (client.total / max) * 100 : 0
        return (
          <div key={client.id} className="flex items-center gap-3">
            {/* Rank */}
            <span className="text-xs font-bold text-muted-foreground w-5 text-center flex-shrink-0">
              {idx + 1}
            </span>

            {/* Name + bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <Link
                  href={`/customers/${client.id}`}
                  className="text-sm font-medium hover:text-primary flex items-center gap-1 truncate"
                >
                  <span className="truncate">{client.name}</span>
                  {client.company && (
                    <span className="text-muted-foreground font-normal truncate hidden sm:inline">
                      {" "}· {client.company}
                    </span>
                  )}
                  <ExternalLink className="w-3 h-3 opacity-40 flex-shrink-0" />
                </Link>
                <span className="text-sm font-semibold ml-2 flex-shrink-0">
                  {formatCurrency(client.total)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
