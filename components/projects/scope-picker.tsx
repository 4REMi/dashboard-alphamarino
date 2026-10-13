"use client"

import { useState } from "react"
import { Check, Plus, X, Building2, Search } from "lucide-react"
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
  const [q, setQ] = useState("")
  const set = (patch: Partial<ScopeValue>) => onChange({ ...value, ...patch })
  const toggleOffer = (id: string) => set({ offerIds: value.offerIds.includes(id) ? value.offerIds.filter((x) => x !== id) : [...value.offerIds, id] })
  const countable = (o: ScopeOffer) => (o.deliverables ?? []).filter((d) => d.cadence !== "continuous")
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const groups = Object.entries(
    offers.filter((o) => !q.trim() || norm(`${o.name} ${o.category ?? ""}`).includes(norm(q.trim())))
      .reduce<Record<string, ScopeOffer[]>>((acc, o) => { (acc[o.category || "Otras"] ??= []).push(o); return acc }, {}),
  )
  const selected = value.offerIds.map((id) => offers.find((o) => o.id === id)).filter((o): o is ScopeOffer => !!o)
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
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-3 h-9 border-b border-border">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar oferta…"
                className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none" />
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              {groups.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>}
              {groups.map(([cat, list]) => (
                <div key={cat}>
                  <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
                  {list.map((o) => {
                    const on = value.offerIds.includes(o.id)
                    const n = countable(o).length
                    return (
                      <button key={o.id} type="button" onClick={() => toggleOffer(o.id)}
                        className={cn("w-full flex items-center gap-2.5 px-3 h-8 text-left text-sm hover:bg-muted/60", on && "bg-primary/5")}>
                        <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", on ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40")}>
                          {on && <Check className="w-3 h-3" />}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{o.name}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{n} entregable{n === 1 ? "" : "s"}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {selected.map((o) => (
          <div key={o.id} className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{o.name}</span>
              <button type="button" onClick={() => toggleOffer(o.id)} className="text-muted-foreground hover:text-foreground" aria-label="Quitar"><X className="w-3.5 h-3.5" /></button>
            </div>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {countable(o).map((d) => (
                <li key={d.id} className="flex gap-2"><span className="tabular-nums shrink-0">{d.quantity ?? 1}×</span><span className="flex-1 min-w-0 truncate">{d.control_text?.trim() || d.text}</span><span className="shrink-0">{CADENCE[d.cadence]}</span></li>
              ))}
            </ul>
          </div>
        ))}

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
