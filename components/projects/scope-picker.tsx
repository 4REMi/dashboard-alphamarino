"use client"

import { useState } from "react"
import { Check, Plus, X, Building2 } from "lucide-react"
import type { DeliverableCadence, ServiceDeliverable } from "@/lib/types"
import { cn } from "@/lib/utils"

// Paso "Alcance" del nuevo proyecto: ofertas del catálogo (solo nombre y
// textos de control — nunca precios), entregables propios, o "interno".

export type ScopeOffer = { id: string; category: string | null; name: string; deliverables: ServiceDeliverable[] | null }
export type CustomLine = { text: string; cadence: DeliverableCadence; quantity: number | null }
export type ScopeValue = { offerIds: string[]; customs: CustomLine[]; internal: boolean }

const CADENCE: Record<DeliverableCadence, string> = {
  once: "una vez", monthly: "por periodo", quarterly: "cada 3 periodos", biannual: "cada 6 periodos", continuous: "continuo",
}

export const scopeReady = (v: ScopeValue) => v.internal || v.offerIds.length > 0 || v.customs.some((c) => c.text.trim())

export function ScopePicker({ offers, value, onChange }: { offers: ScopeOffer[]; value: ScopeValue; onChange: (v: ScopeValue) => void }) {
  const [draft, setDraft] = useState<CustomLine>({ text: "", cadence: "monthly", quantity: 1 })
  const set = (patch: Partial<ScopeValue>) => onChange({ ...value, ...patch })
  const addDraft = () => {
    if (!draft.text.trim()) return
    set({ customs: [...value.customs, { ...draft, text: draft.text.trim() }] })
    setDraft({ text: "", cadence: draft.cadence, quantity: 1 })
  }
  const field = "rounded-lg border border-input bg-background px-2.5 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <div className="space-y-3 min-w-0">
      <div className={cn("space-y-3 transition-opacity", value.internal && "opacity-40 pointer-events-none")}>
        {offers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 [&>*]:min-w-0">
            {offers.map((o) => {
              const on = value.offerIds.includes(o.id)
              const lines = (o.deliverables ?? []).filter((d) => d.cadence !== "continuous")
              return (
                <button key={o.id} type="button"
                  onClick={() => set({ offerIds: on ? value.offerIds.filter((x) => x !== o.id) : [...value.offerIds, o.id] })}
                  className={cn("rounded-lg border px-3 py-2.5 text-left transition-colors flex flex-col justify-start", on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/30")}>
                  <span className="flex items-start gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium leading-tight truncate">{o.name}</span>
                      {o.category && <span className="block text-[11px] text-muted-foreground">{o.category}</span>}
                    </span>
                    <span className={cn("w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0", on ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40")}>
                      {on && <Check className="w-3 h-3" />}
                    </span>
                  </span>
                  {lines.length > 0 && (
                    <span className="block mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                      {lines.slice(0, 4).map((d) => (
                        <span key={d.id} className="block truncate">{d.quantity ?? 1}× {d.control_text?.trim() || d.text} · {CADENCE[d.cadence]}</span>
                      ))}
                      {lines.length > 4 && <span className="block">y {lines.length - 4} más</span>}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {value.customs.length > 0 && (
          <div className="space-y-1">
            {value.customs.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm rounded-lg bg-muted/60 px-3 h-9">
                <span className="tabular-nums text-muted-foreground">{c.quantity ?? 1}×</span>
                <span className="flex-1 truncate">{c.text}</span>
                <span className="text-xs text-muted-foreground shrink-0">{CADENCE[c.cadence]}</span>
                <button type="button" onClick={() => set({ customs: value.customs.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-foreground" aria-label="Quitar"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <input type="number" min={1} value={draft.quantity ?? 1} onChange={(e) => setDraft({ ...draft, quantity: Math.max(1, Number(e.target.value) || 1) })}
            className={cn(field, "w-16 tabular-nums")} aria-label="Cantidad" />
          <input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraft() } }}
            placeholder={offers.length ? "O agrega un entregable propio (ej. Reels)" : "Entregable (ej. Reels)"} className={cn(field, "basis-full sm:basis-auto sm:flex-1 min-w-0 order-first sm:order-none")} />
          <select value={draft.cadence} onChange={(e) => setDraft({ ...draft, cadence: e.target.value as DeliverableCadence })} className={cn(field, "flex-1 sm:flex-none sm:w-auto min-w-0")}>
            {(["monthly", "once", "quarterly", "biannual"] as DeliverableCadence[]).map((c) => <option key={c} value={c}>{CADENCE[c]}</option>)}
          </select>
          <button type="button" onClick={addDraft} disabled={!draft.text.trim()}
            className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-1 hover:bg-muted disabled:opacity-40"><Plus className="w-3.5 h-3.5" />Agregar</button>
        </div>
      </div>

      <button type="button" onClick={() => set({ internal: !value.internal })}
        className={cn("inline-flex items-center gap-2 text-xs rounded-full border px-3 h-8 transition-colors", value.internal ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/30")}>
        <Building2 className="w-3.5 h-3.5" />Proyecto interno (sin alcance de cliente)
      </button>
    </div>
  )
}
