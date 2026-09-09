"use client"

import { useEffect, useRef, useState } from "react"
import { Search, ChevronDown, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Customer } from "@/lib/types"

interface Props {
  customers: Customer[]
  value: string // "none" or customer id
  onChange: (id: string) => void
}

// Plain <select>-style dropdowns don't scale once a client base has several
// people who share a first name (a common side effect of importing from
// another CRM that only tracked first names) — this adds a search box and
// shows `company`/`email` next to each option so duplicates are actually
// distinguishable. Note: Customer only has a single `name` field, no
// separate last name — if two customers are genuinely indistinguishable
// here, the fix is adding their company/email in Clientes, not this UI.
export function CustomerCombobox({ customers, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = customers.find((c) => c.id === value) ?? null

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      )
    : customers

  function select(id: string) {
    onChange(id)
    setOpen(false)
    setSearch("")
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
          {selected ? selected.name : "Sin cliente"}
        </span>
        <ChevronDown className="w-4 h-4 opacity-50 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="relative border-b border-border">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, empresa o correo…"
              className="w-full rounded-t-md bg-transparent pl-8 pr-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => select("none")}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">Sin cliente</span>
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => select(c.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                >
                  <Check className={cn("w-3.5 h-3.5 flex-shrink-0", c.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{c.name}</span>
                    {(c.company || c.email) && (
                      <span className="text-xs text-muted-foreground truncate block">
                        {[c.company, c.email].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
