"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Loader2, Check, Search, X, ShieldAlert, Play } from "lucide-react"
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
      <DialogContent className="max-w-[min(720px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
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
                    className="w-24 bg-transparent text-2xl font-semibold tabular-nums focus:outline-none py-0.5" />
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
                      title={o.name} className={cn("h-8 px-3 max-w-[220px] rounded-full border text-sm inline-flex items-center gap-1.5 transition-colors", on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40")}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color ?? "currentColor", opacity: o.color ? 1 : 0.4 }} /><span className="truncate">{o.name}</span>
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
            <ConceptPicker concepts={concepts} total={draft.concepts} testing={testing} setTesting={setTesting} q={q} setQ={setQ}
              colorOf={colorOf} lineName={(id) => options.find((o) => (o.id || null) === id)?.name ?? null} currency={cur} />

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
            <span className="text-[11px] text-muted-foreground flex-1">{ready ? "Se fija en la bitácora con tu nombre." : !(Number(budget) > 0) ? "Falta el presupuesto." : !lines.length ? "Elige qué se empuja." : "Falta la apuesta del ciclo."}</span>
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

type Concept = StrategyDraft["concepts"][number]
const STATE: Record<Concept["state"], { title: string; hint: string }> = {
  ready: { title: "Listos para probar", hint: "Tienen creativos y aún no corren en Meta." },
  running: { title: "Corriendo este ciclo", hint: "Ya tienen gasto en el ciclo activo." },
  tested: { title: "Ya probados", hint: "Corrieron en ciclos anteriores." },
  empty: { title: "Sin creativos", hint: "" },
}

// Elegir qué probar: lo listo arriba (con sus creativos a la vista), lo que
// corre o ya corrió con sus números, y sin creativos solo como conteo.
function ConceptPicker({ concepts, total, testing, setTesting, q, setQ, colorOf, lineName, currency }: {
  concepts: Concept[]; total: Concept[]; testing: string[]; setTesting: (f: (t: string[]) => string[]) => void
  q: string; setQ: (v: string) => void; colorOf: (id: string | null) => string | null; lineName: (id: string | null) => string | null; currency: string
}) {
  const [showTested, setShowTested] = useState(false)
  const groups = (["ready", "running", "tested"] as const).map((st) => ({ st, items: concepts.filter((c) => c.state === st) }))
  const empty = concepts.filter((c) => c.state === "empty").length
  const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: n < 100 ? 2 : 0 }).format(n)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">Conceptos a probar · {testing.length}/{MAX_TESTS}</p>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="h-7 w-36 pl-7 pr-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      </div>
      {total.length === 0 && <p className="text-xs text-muted-foreground">Aún no hay conceptos en el Creative Tracker.</p>}
      <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
        {groups.map(({ st, items }) => {
          if (!items.length) return null
          const collapsed = st === "tested" && !showTested && !q
          return (
            <div key={st} className="space-y-1.5">
              <button type="button" disabled={st !== "tested"} onClick={() => setShowTested((v) => !v)} className="text-xs font-medium flex items-center gap-1.5 disabled:cursor-default">
                <span className={cn("w-1.5 h-1.5 rounded-full", st === "ready" ? "bg-emerald-500" : st === "running" ? "bg-sky-500" : "bg-muted-foreground/50")} />
                {STATE[st].title} <span className="text-muted-foreground">{items.length}</span>
                {st === "tested" && <span className="text-muted-foreground">· {collapsed ? "ver" : "ocultar"}</span>}
              </button>
              {!collapsed && items.map((c) => {
                const on = testing.includes(c.id)
                const full = !on && testing.length >= MAX_TESTS
                const color = colorOf(c.brand_line_id)
                const cpr = c.results > 0 ? c.spend / c.results : null
                return (
                  <button key={c.id} type="button" disabled={full} onClick={() => setTesting((t) => (on ? t.filter((x) => x !== c.id) : [...t, c.id]))}
                    className={cn("w-full flex items-center gap-3 rounded-lg border p-2 text-left transition-colors", on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/30", full && "opacity-40")}>
                    <div className="flex -space-x-3 shrink-0">
                      {c.thumbs.slice(0, 3).map((t, i) => <Thumb key={i} url={t.url} video={t.video} color={color} name={c.name} />)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug line-clamp-1">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {lineName(c.brand_line_id) && <span className="inline-flex items-center gap-1 mr-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: color ?? "#94a3b8" }} />{lineName(c.brand_line_id)}</span>}
                        {c.angle}
                      </p>
                    </div>
                    <div className="text-right shrink-0 text-[11px] leading-tight">
                      {c.state === "ready" ? (
                        <><p className="font-medium">{c.assets} creativo{c.assets === 1 ? "" : "s"}</p><p className={c.approved ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{c.approved ? `${c.approved} aprobado${c.approved === 1 ? "" : "s"}` : "sin aprobar"}</p></>
                      ) : (
                        <><p className="font-medium tabular-nums">{money(c.spend)}</p><p className="text-muted-foreground tabular-nums">{cpr ? `${money(cpr)} c/u · ${c.results}` : "sin resultados"}</p></>
                      )}
                    </div>
                    <span className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", on ? "bg-primary border-primary text-primary-foreground" : "border-input")}>{on && <Check className="w-3 h-3" />}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
        {empty > 0 && <p className="text-[11px] text-muted-foreground">{empty} concepto{empty === 1 ? "" : "s"} sin creativos todavía (no se pueden probar).</p>}
      </div>
    </div>
  )
}

// Creativo en formato vertical; video marcado; sin imagen → inicial con color de la línea.
function Thumb({ url, video, color, name }: { url: string | null; video: boolean; color: string | null; name: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="relative w-9 h-12 rounded-md overflow-hidden border-2 border-background bg-muted shrink-0 shadow-sm">
      {url && !broken
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" onError={() => setBroken(true)} className="w-full h-full object-cover" />
        : <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white" style={{ background: color ?? "#94a3b8" }}>{name.trim().charAt(0).toUpperCase()}</span>}
      {video && <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-black/60 flex items-center justify-center"><Play className="w-2 h-2 text-white fill-white" /></span>}
    </span>
  )
}
