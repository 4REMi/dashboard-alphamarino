"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, Sparkles, Check, Loader2, ChevronRight } from "lucide-react"
import { getControlCoverage, suggestControlForOffer, applyControlReview, type ControlSuggestion } from "@/lib/actions/offer-control"
import type { DeliverableCadence } from "@/lib/types"
import { cn } from "@/lib/utils"

// Revisión de control: a la izquierda las ofertas con su cobertura
// (control X/Y); a la derecha la tabla de una oferta con el texto de venta
// y lo sugerido por la IA (editable). Nada se guarda sin "Aplicar".

const CADENCE: Record<DeliverableCadence, string> = {
  once: "Una vez", monthly: "Por periodo", quarterly: "Cada 3 periodos", biannual: "Cada 6 periodos", continuous: "Continuo",
}
type Coverage = Awaited<ReturnType<typeof getControlCoverage>>[number]
type Row = ControlSuggestion & { accepted: boolean; edit: ControlSuggestion["suggested"] }

export function ControlReview() {
  const [coverage, setCoverage] = useState<Coverage[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [, start] = useTransition()

  const loadCoverage = () => getControlCoverage().then(setCoverage).catch((e) => setError(String(e)))
  useEffect(() => { loadCoverage() }, [])

  const offer = coverage?.find((o) => o.id === selected) ?? null
  const totals = useMemo(() => ({
    lines: coverage?.reduce((n, o) => n + o.total, 0) ?? 0,
    done: coverage?.reduce((n, o) => n + o.withControl, 0) ?? 0,
  }), [coverage])

  function suggest(id: string) {
    setSelected(id); setRows(null); setError(null); setBusy("La IA está proponiendo los textos de control…")
    start(async () => {
      try {
        const r = await suggestControlForOffer(id, { onlyMissing })
        setRows(r.suggestions.map((s) => ({ ...s, accepted: s.source !== "existing", edit: { ...s.suggested } })))
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
    })
  }

  function apply() {
    if (!selected || !rows) return
    const updates = rows.filter((r) => r.accepted).map((r) => ({ lineId: r.lineId, ...r.edit }))
    if (!updates.length) return
    setBusy("Guardando…")
    start(async () => {
      try {
        await applyControlReview(selected, updates)
        await loadCoverage()
        // Siguiente oferta sin control completo, para seguir de corrido.
        const next = (coverage ?? []).find((o) => o.id !== selected && o.withControl < o.total)
        setRows(null)
        if (next) suggest(next.id); else setSelected(null)
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
    })
  }

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const input = "w-full rounded-md border border-input bg-background px-2 py-1 text-sm"

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1">
          <Link href="/services" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Servicios</Link>
          <h1 className="text-2xl font-bold">Revisión de control</h1>
          <p className="text-sm text-muted-foreground">Texto corto y verificable por entregable (lo que se ve y se palomea en los proyectos). El texto de venta no se toca.</p>
        </div>
        {coverage && (
          <div className="min-w-[220px]">
            <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Entregables con control</span><b className="text-foreground">{totals.done}/{totals.lines}</b></div>
            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${totals.lines ? (totals.done / totals.lines) * 100 : 0}%` }} /></div>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
        <nav className="rounded-xl border border-border bg-card divide-y divide-border max-h-[75vh] overflow-y-auto">
          {!coverage ? <p className="p-3 text-xs text-muted-foreground">Cargando…</p> : coverage.map((o) => {
            const full = o.total > 0 && o.withControl === o.total
            return (
              <button key={o.id} onClick={() => suggest(o.id)} disabled={!!busy}
                className={cn("w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/40 disabled:opacity-60", selected === o.id && "bg-muted")}>
                <span className={cn("w-2 h-2 rounded-full shrink-0", full ? "bg-emerald-500" : o.withControl ? "bg-amber-400" : "bg-red-400")} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{o.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{o.category}{o.status === "archived" ? " · archivada" : ""}</span>
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{o.withControl}/{o.total}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )
          })}
        </nav>

        <section className="rounded-xl border border-border bg-card min-h-[300px]">
          <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            <p className="font-semibold flex-1">{offer?.name ?? "Elige una oferta"}</p>
            <label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />Solo líneas sin control
            </label>
            {offer && <button onClick={() => suggest(offer.id)} disabled={!!busy} className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"><Sparkles className="w-3.5 h-3.5" />Volver a sugerir</button>}
          </div>

          {busy && <p className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{busy}</p>}
          {!busy && !rows && <p className="p-6 text-sm text-muted-foreground">Elige una oferta de la lista: la IA propone el texto de control, la cadencia y la cantidad de cada entregable. Revisas, ajustas y aplicas. Al aplicar pasa sola a la siguiente oferta pendiente.</p>}

          {!busy && rows && (
            <>
              <div className="divide-y divide-border">
                {rows.map((r, i) => {
                  const changed = r.edit.control_text !== (r.current.control_text ?? "") || r.edit.cadence !== r.current.cadence || r.edit.quantity !== r.current.quantity
                  return (
                    <div key={r.lineId} className={cn("px-4 py-3 grid md:grid-cols-[24px_1fr_1.1fr] gap-3", !r.accepted && "opacity-50")}>
                      <input type="checkbox" checked={r.accepted} onChange={(e) => set(i, { accepted: e.target.checked })} className="mt-1" title="Aplicar esta línea" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Texto de venta</p>
                        <p className="text-xs text-muted-foreground">{r.text}</p>
                        {r.note && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{r.note}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Control</p>
                          {r.source === "reused" && <span className="text-[10px] px-1.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">reutilizado</span>}
                          {r.source === "ai" && changed && <span className="text-[10px] px-1.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">sugerido</span>}
                          {r.current.control_text && <span className="text-[10px] text-muted-foreground truncate">antes: {r.current.control_text}</span>}
                        </div>
                        <input value={r.edit.control_text} onChange={(e) => set(i, { edit: { ...r.edit, control_text: e.target.value } })} className={cn(input, "font-medium")} />
                        <div className="flex gap-1.5">
                          <select value={r.edit.cadence} onChange={(e) => set(i, { edit: { ...r.edit, cadence: e.target.value as DeliverableCadence, quantity: e.target.value === "continuous" ? null : r.edit.quantity } })} className={input}>
                            {(Object.keys(CADENCE) as DeliverableCadence[]).map((c) => <option key={c} value={c}>{CADENCE[c]}{c !== r.current.cadence ? "" : " (actual)"}</option>)}
                          </select>
                          <input type="number" min="0" placeholder="Cant." value={r.edit.quantity ?? ""} disabled={r.edit.cadence === "continuous"}
                            onChange={(e) => set(i, { edit: { ...r.edit, quantity: e.target.value === "" ? null : Number(e.target.value) } })} className={cn(input, "w-20 disabled:opacity-40")} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-3 border-t border-border flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{rows.filter((r) => r.accepted).length} de {rows.length} líneas se aplicarán</span>
                <button onClick={() => setRows((rs) => rs!.map((r) => ({ ...r, accepted: true })))} className="text-xs text-primary hover:underline">Marcar todas</button>
                <button onClick={apply} disabled={!rows.some((r) => r.accepted)} className="ml-auto h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                  <Check className="w-4 h-4" />Aplicar y seguir
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
