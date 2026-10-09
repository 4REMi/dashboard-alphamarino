"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, Plus, X, Check, ShieldAlert, Bell, Quote, ImageOff } from "lucide-react"
import { getStrategyDraft, saveStrategy, type StrategyDraft } from "@/lib/actions/radar"
import type { StrategyLine } from "@/lib/radar/types"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { cn } from "@/lib/utils"

// "Definir estrategia del ciclo": 6 decisiones que toma una persona. La
// propuesta (presupuesto y meta de costo del ciclo anterior) solo
// pre-llena; la apuesta del ciclo siempre la escribe alguien del equipo.

const CHANNELS = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Otro"]
const CONVERSIONS = ["Leads", "Mensajes", "Compras", "Registros", "Reservas", "Clics", "Llamadas"]

// Fuera del componente: definido adentro se re-monta y los inputs pierden el foco.
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[28px_1fr] gap-3">
      <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{n}</span>
      <div className="min-w-0 space-y-2">
        <div><p className="text-sm font-semibold">{title}</p>{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}</div>
        {children}
      </div>
    </section>
  )
}

export function StrategyDialog({ projectId, open, onOpenChange, onSaved }: { projectId: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<StrategyDraft | null>(null)
  const [budget, setBudget] = useState("")
  const [guard, setGuard] = useState<"warn" | "auto_pause">("warn")
  const [lines, setLines] = useState<StrategyLine[]>([])
  const [testing, setTesting] = useState<string[]>([])
  const [bet, setBet] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  useEffect(() => {
    if (!open) return
    setDraft(null); setError(null)
    getStrategyDraft(projectId).then((d) => {
      setDraft(d); setBudget(d.budget ? String(d.budget) : ""); setGuard(d.budget_guard); setLines(d.lines); setTesting(d.testing_concept_ids); setBet(d.bet)
    }).catch((e) => setError(String(e)))
  }, [open, projectId])

  const cur = draft?.currency ?? "USD"
  const setLine = (i: number, patch: Partial<StrategyLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const lineBudgetSum = lines.reduce((s, l) => s + (l.budget ?? 0), 0)
  const field = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

  function save() {
    setError(null)
    start(async () => {
      try {
        await saveStrategy(projectId, { budget: Number(budget), budget_guard: guard, lines, testing_concept_ids: testing, bet })
        onOpenChange(false); onSaved()
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(860px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <div className="px-6 py-4 border-b bg-muted/30 sticky top-0 z-10 backdrop-blur">
          <DialogTitle className="text-lg">Estrategia del ciclo</DialogTitle>
          <p className="text-xs text-muted-foreground">{draft?.cycle ? `${draft.cycle.start} → ${draft.cycle.end} · ` : ""}6 decisiones, ~5 minutos. El Radar vigila contra esto y queda fijado en la bitácora.</p>
        </div>

        {!draft && !error && <p className="p-8 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Preparando propuesta…</p>}
        {draft && !draft.cycle && <p className="p-8 text-sm text-muted-foreground">Este proyecto no tiene ciclo activo. Abre un ciclo primero.</p>}

        {draft?.cycle && (
          <div className="px-6 py-5 space-y-6">
            <Step n={1} title="Presupuesto del ciclo" hint={draft.budgetHint ?? `En ${cur}, la moneda de la cuenta de Meta. Incluye todos los canales.`}>
              <div className="flex items-center gap-2 max-w-xs">
                <input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} className={cn(field, "text-lg font-semibold tabular-nums")} placeholder="400" />
                <span className="text-sm text-muted-foreground">{cur}</span>
              </div>
            </Step>

            <Step n={2} title="Si se llega al límite" hint="Los avisos al 80% y 90% llegan siempre por Telegram.">
              <div className="grid sm:grid-cols-2 gap-2">
                {([["warn", Bell, "Solo avisar", "El equipo decide qué hacer."], ["auto_pause", ShieldAlert, "Pausar automáticamente", "Al 100% se pausan las campañas en Meta y se avisa."]] as const).map(([v, Icon, t, d]) => (
                  <button key={v} type="button" onClick={() => setGuard(v)} className={cn("text-left rounded-lg border-2 px-3 py-2.5 flex gap-2.5", guard === v ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30")}>
                    <Icon className={cn("w-4 h-4 mt-0.5", v === "auto_pause" ? "text-red-500" : "text-amber-500")} />
                    <span><b className="text-sm block">{t}</b><span className="text-[11px] text-muted-foreground">{d}</span></span>
                  </button>
                ))}
              </div>
            </Step>

            <Step n={3} title="Líneas que se empujan, con su meta" hint="Una fila por línea de producto u oferta (cada una con su conversión). La meta de costo es lo que dispara las alertas.">
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-muted/40 text-[11px] text-muted-foreground">
                    <tr><th className="text-left px-2.5 py-1.5 font-medium">Línea</th><th className="text-left px-2 py-1.5 font-medium">Canal</th><th className="text-left px-2 py-1.5 font-medium">Conversión</th><th className="text-left px-2 py-1.5 font-medium">Meta costo/resultado</th><th className="text-left px-2 py-1.5 font-medium">Presupuesto</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l, i) => {
                      const color = draft.brandLines.find((b) => b.id === l.brand_line_id)?.color
                      return (
                        <tr key={l.key}>
                          <td className="px-2.5 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color ?? "var(--muted-foreground)" }} />
                              <select value={l.brand_line_id ?? ""} onChange={(e) => { const b = draft.brandLines.find((x) => x.id === e.target.value); setLine(i, { brand_line_id: b?.id ?? null, name: b?.name ?? "General" }) }} className={field}>
                                <option value="">General</option>
                                {draft.brandLines.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="px-2 py-1.5"><select value={l.channel} onChange={(e) => setLine(i, { channel: e.target.value })} className={field}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></td>
                          <td className="px-2 py-1.5"><select value={l.conversion} onChange={(e) => setLine(i, { conversion: e.target.value })} className={field}>{CONVERSIONS.map((c) => <option key={c}>{c}</option>)}</select></td>
                          <td className="px-2 py-1.5"><input type="number" min="0" step="0.01" value={l.target_cpr ?? ""} onChange={(e) => setLine(i, { target_cpr: e.target.value === "" ? null : Number(e.target.value) })} className={cn(field, "w-28 tabular-nums")} placeholder={cur} /></td>
                          <td className="px-2 py-1.5"><input type="number" min="0" value={l.budget ?? ""} onChange={(e) => setLine(i, { budget: e.target.value === "" ? null : Number(e.target.value) })} className={cn(field, "w-24 tabular-nums")} placeholder="opcional" /></td>
                          <td className="px-1"><button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button type="button" onClick={() => setLines((ls) => [...ls, { key: crypto.randomUUID(), name: "General", brand_line_id: null, channel: "Meta Ads", conversion: "Leads", budget: null, target_cpr: null }])} className="text-primary inline-flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" />Agregar línea</button>
                {lineBudgetSum > 0 && Number(budget) > 0 && (
                  <span className={cn("tabular-nums", Math.abs(lineBudgetSum - Number(budget)) > 1 ? "text-amber-600" : "text-muted-foreground")}>Suma por línea: {lineBudgetSum} de {budget} {cur}</span>
                )}
                {Number(budget) > 0 && Number(budget) < 1000 && lines.length > 1 && (
                  <span className="text-amber-600">Con menos de 1,000 {cur} conviene empujar 1 línea (o rotar por ciclo).</span>
                )}
              </div>
            </Step>

            <Step n={4} title="Conceptos a probar este ciclo" hint="1 o 2 conceptos nuevos. El Radar avisa si no se lanzan.">
              {draft.concepts.length === 0 ? <p className="text-xs text-muted-foreground">Este proyecto aún no tiene conceptos en el Creative Tracker.</p> : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                  {draft.concepts.map((c) => {
                    const on = testing.includes(c.id)
                    const color = draft.brandLines.find((b) => b.id === c.brand_line_id)?.color
                    return (
                      <button key={c.id} type="button" onClick={() => setTesting((t) => (on ? t.filter((x) => x !== c.id) : [...t, c.id]))}
                        className={cn("relative text-left rounded-lg border-2 overflow-hidden", on ? "border-primary" : "border-border hover:border-foreground/30")}>
                        <div className="aspect-[4/3] bg-muted relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {c.thumb ? <img src={c.thumb} alt="" className="w-full h-full object-cover" /> : <ImageOff className="w-4 h-4 text-muted-foreground absolute inset-0 m-auto" />}
                          {on && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                        </div>
                        <p className="px-2 py-1.5 text-xs font-medium line-clamp-2 flex gap-1.5 items-start">
                          {color && <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: color }} />}{c.name}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </Step>

            <Step n={5} title="La apuesta del ciclo" hint="Una frase, escrita por ti: qué queremos lograr y por qué. La IA no la llena.">
              {draft.previousBet && (
                <p className="text-[11px] text-muted-foreground flex gap-1.5"><Quote className="w-3 h-3 shrink-0 mt-0.5" />Ciclo anterior: “{draft.previousBet}”</p>
              )}
              <AutoTextarea value={bet} onChange={(e) => setBet(e.target.value)} rows={2} className={cn(field, "text-[15px]")} placeholder="Ej. Empujar Corporate Events antes de la temporada de fin de año, con el ángulo de cerrar tratos en la cancha." />
            </Step>
          </div>
        )}

        {error && <p className="px-6 pb-2 text-sm text-red-600">{error}</p>}
        {draft?.cycle && (
          <div className="px-6 py-3 border-t flex items-center gap-3 sticky bottom-0 bg-background">
            <span className="text-[11px] text-muted-foreground flex-1">Al confirmar se fija en la bitácora del proyecto con tu nombre.</span>
            <button type="button" onClick={() => onOpenChange(false)} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
            <button type="button" onClick={save} disabled={isPending} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Confirmar estrategia
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
