"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Loader2, Check, Search, X, ShieldAlert } from "lucide-react"
import { getStrategyDraft, saveStrategy, type StrategyDraft } from "@/lib/actions/radar"
import type { StrategyLine } from "@/lib/radar/types"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { cn } from "@/lib/utils"

// Estrategia del ciclo en una sola pantalla corta: presupuesto, qué se
// empuja (chips de líneas → meta por línea), hasta 2 conceptos a probar y
// la apuesta. Nada se pre-selecciona por la persona salvo lo ya guardado.

const CONVERSIONS = ["Leads", "Mensajes", "Compras", "Reservas", "Registros"]
const MAX_TESTS = 2

export function StrategyDialog({ projectId, open, onOpenChange, onSaved }: { projectId: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<StrategyDraft | null>(null)
  const [budget, setBudget] = useState("")
  const [autoPause, setAutoPause] = useState(false)
  const [lines, setLines] = useState<StrategyLine[]>([])
  const [testing, setTesting] = useState<string[]>([])
  const [bet, setBet] = useState("")
  const [q, setQ] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  useEffect(() => {
    if (!open) return
    setDraft(null); setError(null); setQ("")
    getStrategyDraft(projectId).then((d) => {
      setDraft(d); setBudget(d.budget ? String(d.budget) : ""); setAutoPause(d.budget_guard === "auto_pause"); setLines(d.lines); setTesting(d.testing_concept_ids); setBet(d.bet)
    }).catch((e) => setError(String(e)))
  }, [open, projectId])

  const cur = draft?.currency ?? "USD"
  // "General" siempre disponible además de las líneas del Brand Brain.
  const options = useMemo(() => [...(draft?.brandLines ?? []), { id: "", name: "General", color: null }], [draft])
  const isOn = (id: string) => lines.some((l) => (l.brand_line_id ?? "") === id)
  function toggleLine(o: { id: string; name: string }) {
    setLines((ls) => isOn(o.id) ? ls.filter((l) => (l.brand_line_id ?? "") !== o.id)
      : [...ls, { key: o.id || "general", name: o.name, brand_line_id: o.id || null, channel: "Meta Ads", conversion: "Leads", budget: null, target_cpr: null }])
  }
  const setLine = (key: string, patch: Partial<StrategyLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const activeLineIds = new Set(lines.map((l) => l.brand_line_id ?? ""))
  const concepts = (draft?.concepts ?? [])
    .filter((c) => !lines.length || activeLineIds.has(c.brand_line_id ?? "") || testing.includes(c.id))
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
  const colorOf = (id: string | null) => draft?.brandLines.find((b) => b.id === id)?.color ?? null

  function save() {
    setError(null)
    start(async () => {
      try {
        await saveStrategy(projectId, { budget: Number(budget), budget_guard: autoPause ? "auto_pause" : "warn", lines, testing_concept_ids: testing, bet })
        onOpenChange(false); onSaved()
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    })
  }

  const label = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
  const ready = Number(budget) > 0 && lines.length > 0 && bet.trim().length >= 12

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(620px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <div className="px-6 pt-5 pb-3">
          <DialogTitle className="text-lg">Estrategia del ciclo</DialogTitle>
          {draft?.cycle && <p className="text-xs text-muted-foreground">{draft.cycle.start} → {draft.cycle.end}</p>}
        </div>

        {!draft && !error && <p className="px-6 pb-8 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Preparando…</p>}
        {draft && !draft.cycle && <p className="px-6 pb-8 text-sm text-muted-foreground">Este proyecto no tiene ciclo activo.</p>}

        {draft?.cycle && (
          <div className="px-6 pb-4 space-y-5">
            {/* Presupuesto */}
            <div className="flex items-end gap-4 flex-wrap">
              <label className="space-y-1">
                <span className={label}>Presupuesto</span>
                <div className="flex items-baseline gap-1.5 border-b-2 border-border focus-within:border-primary">
                  <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0"
                    className="w-32 bg-transparent text-2xl font-semibold tabular-nums focus:outline-none py-0.5" />
                  <span className="text-sm text-muted-foreground">{cur}</span>
                </div>
              </label>
              <button type="button" onClick={() => setAutoPause((v) => !v)} className="flex items-center gap-2 text-sm pb-1">
                <span className={cn("w-9 h-5 rounded-full p-0.5 transition-colors", autoPause ? "bg-red-500" : "bg-muted-foreground/30")}>
                  <span className={cn("block w-4 h-4 rounded-full bg-white transition-transform", autoPause && "translate-x-4")} />
                </span>
                <span className={cn(autoPause ? "text-foreground" : "text-muted-foreground")}>Pausar en Meta al llegar al 100%</span>
                {autoPause && <ShieldAlert className="w-3.5 h-3.5 text-red-500" />}
              </button>
            </div>
            {draft.budgetHint && !budget && <p className="text-[11px] text-muted-foreground -mt-3">{draft.budgetHint}</p>}

            {/* Qué se empuja */}
            <div className="space-y-2">
              <p className={label}>¿Qué se empuja este ciclo?</p>
              <div className="flex flex-wrap gap-1.5">
                {options.map((o) => {
                  const on = isOn(o.id)
                  return (
                    <button key={o.id || "general"} type="button" onClick={() => toggleLine(o)}
                      className={cn("h-8 px-3 rounded-full border text-sm inline-flex items-center gap-1.5 transition-colors", on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40")}>
                      <span className="w-2 h-2 rounded-full" style={{ background: o.color ?? "currentColor", opacity: o.color ? 1 : 0.4 }} />{o.name}
                    </button>
                  )
                })}
              </div>
              {lines.length > 0 && (
                <div className="rounded-lg border border-border divide-y divide-border">
                  {lines.map((l) => (
                    <div key={l.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(l.brand_line_id) ?? "var(--muted-foreground)" }} />
                      <span className="flex-1 min-w-0 truncate font-medium">{l.name}</span>
                      <select value={l.conversion} onChange={(e) => setLine(l.key, { conversion: e.target.value })} className="bg-transparent text-sm text-muted-foreground focus:outline-none cursor-pointer">
                        {CONVERSIONS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <span className="text-muted-foreground">a</span>
                      <input inputMode="decimal" value={l.target_cpr ?? ""} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setLine(l.key, { target_cpr: v === "" ? null : Number(v) }) }}
                        placeholder={draft.suggestedCpr ? String(draft.suggestedCpr) : "meta"} className="w-16 text-right tabular-nums bg-muted/50 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring" />
                      <span className="text-xs text-muted-foreground w-14">{cur} c/u</span>
                    </div>
                  ))}
                </div>
              )}
              {Number(budget) > 0 && Number(budget) < 1000 && lines.length > 1 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Con menos de 1,000 {cur} rinde más empujar 1 línea (o rotar por ciclo).</p>
              )}
            </div>

            {/* A prueba */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className={cn(label, "flex-1")}>A prueba · {testing.length}/{MAX_TESTS}</p>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar concepto" className="h-7 w-40 pl-7 pr-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <div className="rounded-lg border border-border max-h-[188px] overflow-y-auto divide-y divide-border">
                {concepts.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">{draft.concepts.length ? "Sin conceptos para esas líneas." : "Aún no hay conceptos en el Creative Tracker."}</p>}
                {concepts.map((c) => {
                  const on = testing.includes(c.id)
                  const full = !on && testing.length >= MAX_TESTS
                  return (
                    <button key={c.id} type="button" disabled={full} onClick={() => setTesting((t) => (on ? t.filter((x) => x !== c.id) : [...t, c.id]))}
                      className={cn("w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-sm", on ? "bg-primary/5" : "hover:bg-muted/50", full && "opacity-40")}>
                      <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", on ? "bg-primary border-primary text-primary-foreground" : "border-input")}>{on && <Check className="w-3 h-3" />}</span>
                      <ConceptThumb src={c.thumb} name={c.name} color={colorOf(c.brand_line_id)} />
                      <span className="flex-1 min-w-0 truncate">{c.name}</span>
                      {colorOf(c.brand_line_id) && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(c.brand_line_id)! }} />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Apuesta */}
            <div className="space-y-1.5">
              <p className={label}>La apuesta del ciclo</p>
              <AutoTextarea value={bet} onChange={(e) => setBet(e.target.value)} rows={2}
                placeholder={draft.previousBet ? `Anterior: “${draft.previousBet}”` : "Qué queremos lograr y por qué, en una frase."}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
          </div>
        )}

        {error && <p className="px-6 pb-2 text-sm text-red-600 flex items-center gap-1.5"><X className="w-3.5 h-3.5" />{error}</p>}
        {draft?.cycle && (
          <div className="px-6 py-3 border-t flex items-center gap-3 bg-muted/30">
            <span className="text-[11px] text-muted-foreground flex-1">Se fija en la bitácora con tu nombre.</span>
            <button type="button" onClick={() => onOpenChange(false)} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
            <button type="button" onClick={save} disabled={isPending || !ready} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-40">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Confirmar
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Miniatura chica; sin imagen (o si falla) muestra la inicial con el color de su línea.
function ConceptThumb({ src, name, color }: { src: string | null; name: string; color: string | null }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setBroken(true)} className="w-7 h-7 rounded object-cover shrink-0" />
  }
  return (
    <span className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-[11px] font-bold text-white" style={{ background: color ?? "#94a3b8" }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
