"use client"

import { useEffect, useRef, useState } from "react"
import { Search, ChevronDown, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BrandBrain } from "@/lib/types"

interface Props {
  brandBrains: BrandBrain[]
  value: string // "none" or brand brain id
  onChange: (id: string) => void
}

function BrandAvatar({ brand, className }: { brand: BrandBrain; className?: string }) {
  return (
    <span className={cn("rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0", className)}>
      {brand.logo_square_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo_square_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] font-semibold text-muted-foreground">{brand.initials ?? brand.name[0]}</span>
      )}
    </span>
  )
}

function Swatch({ colors }: { colors: BrandBrain["brand_colors"] }) {
  if (!colors || colors.length === 0) return null
  return (
    <span className="flex items-center -space-x-1 flex-shrink-0">
      {colors.slice(0, 3).map((c, i) => (
        <span key={i} className="w-2.5 h-2.5 rounded-full border border-white" style={{ backgroundColor: c.hex }} />
      ))}
    </span>
  )
}

// A row of pills read fine at a handful of brands but stops scaling fast —
// this became unusable past ~10. Collapsed into the same searchable-combobox
// pattern as CustomerCombobox, keeping the logo + color-swatch glanceability
// that made the pill version worth building in the first place.
export function BrandBrainPicker({ brandBrains, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = brandBrains.find((b) => b.id === value) ?? null

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
    ? brandBrains.filter((b) => b.name.toLowerCase().includes(q) || (b.industry ?? "").toLowerCase().includes(q))
    : brandBrains

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
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-white px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {selected ? (
          <>
            <BrandAvatar brand={selected} className="w-6 h-6" />
            <span className="flex-1 text-left truncate">{selected.name}</span>
            <Swatch colors={selected.brand_colors} />
          </>
        ) : (
          <span className="flex-1 text-left text-muted-foreground">Sin marca</span>
        )}
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
              placeholder="Buscar marca o industria…"
              className="w-full rounded-t-md bg-transparent pl-8 pr-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => select("none")}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">Sin marca</span>
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</p>
            ) : (
              filtered.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => select(b.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                >
                  <Check className={cn("w-3.5 h-3.5 flex-shrink-0", b.id === value ? "opacity-100" : "opacity-0")} />
                  <BrandAvatar brand={b} className="w-6 h-6" />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{b.name}</span>
                    {b.industry && <span className="text-xs text-muted-foreground truncate block">{b.industry}</span>}
                  </span>
                  <Swatch colors={b.brand_colors} />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
