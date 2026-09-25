"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, AlertTriangle, Undo2, Wand2 } from "lucide-react"
import { getCycleRepairState, applyCycleRepair, undoCycleRepair, type RepairState, type RepairPlan } from "@/lib/actions/cycle-repair"
import { formatCycleRange, cn } from "@/lib/utils"

// Reparar ciclos mal capturados: diagnóstico → editar (o proponer según el
// día de corte) → vista previa del impacto → aplicar con motivo. Todo queda
// en la Bitácora y la última reparación se puede deshacer.

type Action = "keep" | "merge" | "delete"
interface Row {
  key: string
  id: string | null
  start: string
  end: string
  active: boolean
  action: Action
  mergeInto: string | null
  summaryFrom: string | null
}

const pad = (n: number) => String(n).padStart(2, "0")
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const parse = (iso: string) => new Date(iso + "T00:00:00Z")
const addDays = (iso: string, n: number) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d) }
const days = (s: string, e: string) => Math.round((parse(e).getTime() - parse(s).getTime()) / 86_400_000) + 1
const overlapDays = (a: { start: string; end: string }, b: { start: string; end: string }) => {
  const s = a.start > b.start ? a.start : b.start
  const e = a.end < b.end ? a.end : b.end
  return s <= e ? days(s, e) : 0
}
const money = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` }

// Siguiente ocurrencia del día de corte estrictamente después de `iso`.
function nextCutAfter(iso: string, day: number): string {
  const d = parse(iso)
  for (let i = 0; i < 3; i++) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + i
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const candidate = toIso(new Date(Date.UTC(y, m, Math.min(day, last))))
    if (candidate > iso) return candidate
  }
  return addDays(iso, 30)
}

function diagnose(rows: { start: string; end: string; active: boolean }[]) {
  const sorted = [...rows].sort((a, b) => (a.start < b.start ? -1 : 1))
  const issues: { level: "red" | "amber"; text: string }[] = []
  for (const r of sorted) {
    if (r.end < r.start) issues.push({ level: "red", text: `${formatCycleRange(r.start, r.end)} termina antes de empezar.` })
    else {
      const n = days(r.start, r.end)
      if (n < 25 || n > 35) issues.push({ level: "amber", text: `${formatCycleRange(r.start, r.end)} dura ${n} días.` })
    }
  }
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const o = overlapDays(sorted[i], sorted[j])
      if (o > 0) issues.push({ level: "red", text: `${formatCycleRange(sorted[i].start, sorted[i].end)} y ${formatCycleRange(sorted[j].start, sorted[j].end)} comparten ${o} días.` })
    }
    const next = sorted[i + 1]
    if (next && addDays(sorted[i].end, 1) < next.start) {
      issues.push({ level: "amber", text: `Hueco de ${days(addDays(sorted[i].end, 1), addDays(next.start, -1))} días sin ciclo (${formatCycleRange(addDays(sorted[i].end, 1), addDays(next.start, -1))}).` })
    }
  }
  if (rows.filter((r) => r.active).length > 1) issues.push({ level: "red", text: "Hay más de un ciclo activo." })
  return issues
}

export function CycleRepairModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter()
  const [state, setState] = useState<RepairState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [cutDay, setCutDay] = useState<number>(1)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const load = () => {
    getCycleRepairState(projectId).then((s) => {
      setState(s)
      setCutDay(s.cycleStartDay ?? (s.cycles.length ? Number(s.cycles[s.cycles.length - 1].start_date.slice(8)) : 1))
      setRows(s.cycles.map((c) => ({ key: c.id, id: c.id, start: c.start_date, end: c.end_date, active: c.is_active, action: "keep", mergeInto: null, summaryFrom: c.id })))
    }).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(load, [projectId])

  const cycleById = useMemo(() => new Map((state?.cycles ?? []).map((c) => [c.id, c])), [state])
  const currentIssues = useMemo(
    () => diagnose((state?.cycles ?? []).map((c) => ({ start: c.start_date, end: c.end_date, active: c.is_active }))),
    [state],
  )
  const kept = rows.filter((r) => r.action === "keep")
  const planIssues = useMemo(() => diagnose(kept), [kept])
  const blocking = planIssues.filter((i) => i.level === "red")

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  // Propuesta: se conservan los ciclos "limpios" del principio (sin
  // traslape y de duración normal); desde el día siguiente al último se
  // generan periodos según el día de corte hasta cubrir hoy. Cada ciclo
  // existente cae en el periodo donde empieza; el primero se conserva con
  // las fechas nuevas y los demás se fusionan en él.
  function propose() {
    if (!state) return
    const sorted = [...state.cycles].sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
    let clean = 0
    while (clean < sorted.length) {
      const c = sorted[clean]
      const n = days(c.start_date, c.end_date)
      const overlaps = sorted.some((o) => o.id !== c.id && overlapDays({ start: c.start_date, end: c.end_date }, { start: o.start_date, end: o.end_date }) > 0)
      if (overlaps || n < 25 || n > 35 || c.is_active) break
      clean++
    }
    const cleanRows = sorted.slice(0, clean)
    const bad = sorted.slice(clean)
    if (!bad.length) { setError("No hay ciclos que reparar según el día de corte."); return }

    let start = clean ? addDays(cleanRows[clean - 1].end_date, 1) : bad[0].start_date
    const today = todayIso()
    const periods: { start: string; end: string }[] = []
    for (let guard = 0; guard < 36; guard++) {
      const end = addDays(nextCutAfter(start, cutDay), -1)
      periods.push({ start, end })
      if (end >= today) break
      start = addDays(end, 1)
    }

    const next: Row[] = cleanRows.map((c) => ({ key: c.id, id: c.id, start: c.start_date, end: c.end_date, active: false, action: "keep", mergeInto: null, summaryFrom: c.id }))
    const owner = new Map<number, string>()
    const extra: Row[] = []
    for (const c of bad) {
      let idx = periods.findIndex((p) => p.start <= c.start_date && c.start_date <= p.end)
      if (idx < 0) idx = c.start_date < periods[0].start ? 0 : periods.length - 1
      const o = owner.get(idx)
      if (!o) {
        owner.set(idx, c.id)
        next.push({ key: c.id, id: c.id, start: periods[idx].start, end: periods[idx].end, active: false, action: "keep", mergeInto: null, summaryFrom: c.id })
      } else {
        extra.push({ key: c.id, id: c.id, start: c.start_date, end: c.end_date, active: false, action: "merge", mergeInto: o, summaryFrom: null })
      }
    }
    periods.forEach((p, idx) => {
      if (!owner.has(idx)) next.push({ key: `new-${p.start}`, id: null, start: p.start, end: p.end, active: false, action: "keep", mergeInto: null, summaryFrom: null })
    })
    next.sort((a, b) => (a.start < b.start ? -1 : 1))
    const last = next[next.length - 1]
    if (last.end >= today) last.active = true
    setRows([...next, ...extra])
    setError(null)
  }

  function addRow() {
    const lastEnd = kept.reduce((m, r) => (r.end > m ? r.end : m), "")
    const start = lastEnd ? addDays(lastEnd, 1) : todayIso()
    setRows((rs) => [...rs, { key: `new-${Date.now()}`, id: null, start, end: addDays(nextCutAfter(start, cutDay), -1), active: false, action: "keep", mergeInto: null, summaryFrom: null }])
  }

  // Impacto: para cada ciclo final, días con gasto y gasto que le tocarán
  // (métricas diarias se asignan por fecha), y conceptos/assets tras
  // fusiones.
  const impact = useMemo(() => {
    if (!state) return []
    const spendDates = Object.keys(state.dailySpend)
    return kept.map((r) => {
      let d = 0, spend = 0
      for (const date of spendDates) if (r.start <= date && date <= r.end) { d++; spend += state.dailySpend[date] }
      const sources = [r.id, ...rows.filter((m) => m.action === "merge" && m.mergeInto === r.id).map((m) => m.id)].filter(Boolean) as string[]
      const concepts = sources.reduce((n, id) => n + (state.stats[id]?.concepts ?? 0), 0)
      const assets = sources.reduce((n, id) => n + (state.stats[id]?.assets ?? 0), 0)
      const before = r.id ? state.stats[r.id] : null
      return { row: r, days: d, spend, concepts, assets, before, sources }
    })
  }, [state, rows, kept])
  const uncoveredSpend = useMemo(() => {
    if (!state) return 0
    return Object.entries(state.dailySpend).filter(([date]) => !kept.some((r) => r.start <= date && date <= r.end)).reduce((s, [, v]) => s + v, 0)
  }, [state, kept])

  const changed = state && (rows.some((r) => r.action !== "keep" || !r.id) || rows.some((r) => {
    const c = r.id ? cycleById.get(r.id) : null
    return c && (c.start_date !== r.start || c.end_date !== r.end || c.is_active !== r.active || r.summaryFrom !== r.id)
  }))

  function buildPlan(): RepairPlan {
    const lines: string[] = []
    for (const r of rows) {
      const c = r.id ? cycleById.get(r.id) : null
      const label = c ? formatCycleRange(c.start_date, c.end_date) : ""
      if (r.action === "delete") lines.push(`Eliminado ${label}`)
      else if (r.action === "merge") {
        const into = rows.find((x) => x.id === r.mergeInto)
        lines.push(`Fusionado ${label} → ${into ? formatCycleRange(into.start, into.end) : ""}`)
      } else if (!c) lines.push(`Nuevo ${formatCycleRange(r.start, r.end)} (cerrado${r.active ? ", activo" : ""})`)
      else if (c.start_date !== r.start || c.end_date !== r.end) lines.push(`${label} → ${formatCycleRange(r.start, r.end)}`)
    }
    return {
      cycles: kept.map((r) => ({ id: r.id, start_date: r.start, end_date: r.end, is_active: r.active, summary_from: r.summaryFrom })),
      merges: rows.filter((r) => r.action === "merge" && r.id && r.mergeInto).map((r) => ({ from_id: r.id!, into_id: r.mergeInto! })),
      deletes: rows.filter((r) => r.action === "delete" && r.id).map((r) => r.id!),
      summary_text: lines.join("\n"),
    }
  }

  function apply() {
    setError(null)
    startTransition(async () => {
      try {
        const { syncErrors } = await applyCycleRepair(projectId, buildPlan(), reason)
        setDone(syncErrors.length
          ? `Reparación aplicada. La re-sincronización con Meta falló en: ${syncErrors.join("; ")} — se reintentará en el próximo sync.`
          : "Reparación aplicada y métricas re-sincronizadas con Meta.")
        setReason("")
        router.refresh()
        load()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  function undo() {
    if (!state?.lastRepair) return
    setError(null)
    startTransition(async () => {
      try {
        await undoCycleRepair(projectId, state.lastRepair!.id)
        setDone("Reparación deshecha: los ciclos volvieron a como estaban.")
        router.refresh()
        load()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const mergeTargets = rows.filter((r) => r.action === "keep" && r.id)
  const input = "rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Reparar ciclos</h3>
            <p className="text-xs text-muted-foreground">Corrige fechas mal capturadas sin perder datos. Todo queda en la Bitácora y se puede deshacer.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {!state && !loadError && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {state && (
            <>
              {done && <p className="text-sm rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-3 py-2">{done}</p>}

              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Diagnóstico actual</h4>
                {currentIssues.length === 0 ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">Sin traslapes, huecos ni duraciones raras.</p>
                ) : (
                  <ul className="space-y-1">
                    {currentIssues.map((i, n) => (
                      <li key={n} className={cn("text-xs flex items-start gap-1.5", i.level === "red" ? "text-red-600" : "text-amber-700 dark:text-amber-400")}>
                        <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />{i.text}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-auto">Ciclos después de la reparación</h4>
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    Día de corte
                    <input type="number" min={1} max={31} value={cutDay} onChange={(e) => setCutDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))} className={cn(input, "w-14")} />
                  </label>
                  <button onClick={propose} className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border hover:bg-muted">
                    <Wand2 className="w-3.5 h-3.5" /> Proponer según corte
                  </button>
                  <button onClick={addRow} className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border hover:bg-muted">
                    <Plus className="w-3.5 h-3.5" /> Agregar ciclo
                  </button>
                </div>

                <div className="rounded-lg border border-border divide-y divide-border">
                  {rows.map((r) => {
                    const c = r.id ? cycleById.get(r.id) : null
                    const s = r.id ? state.stats[r.id] : null
                    const empty = !s || (s.concepts === 0 && s.assets === 0)
                    const summarySources = [r.id, ...rows.filter((m) => m.action === "merge" && m.mergeInto === r.id).map((m) => m.id)]
                      .filter(Boolean).map((id) => cycleById.get(id!)!).filter((x) => x && (x.real_spend !== null || x.roas_real !== null || x.cpa_real !== null || x.real_results !== null))
                    return (
                      <div key={r.key} className={cn("px-3 py-2.5 flex items-center gap-2 flex-wrap text-xs", r.action !== "keep" && "bg-muted/40")}>
                        <span className="w-40 text-muted-foreground">
                          {c ? <>Era <span className="text-foreground">{formatCycleRange(c.start_date, c.end_date)}</span></> : <span className="text-blue-600 font-medium">Nuevo (cerrado)</span>}
                          {s && <span className="block text-[10px]">{s.concepts} conceptos · {s.assets} assets · {s.days} días</span>}
                        </span>
                        {r.id && (
                          <select value={r.action} onChange={(e) => update(r.key, { action: e.target.value as Action, mergeInto: e.target.value === "merge" ? (mergeTargets.find((t) => t.key !== r.key)?.id ?? null) : null })} className={input}>
                            <option value="keep">Conservar</option>
                            <option value="merge">Fusionar en…</option>
                            <option value="delete" disabled={!empty}>Eliminar{empty ? "" : " (tiene contenido)"}</option>
                          </select>
                        )}
                        {r.action === "keep" && (
                          <>
                            <input type="date" value={r.start} onChange={(e) => update(r.key, { start: e.target.value })} className={input} />
                            <span className="text-muted-foreground">→</span>
                            <input type="date" value={r.end} onChange={(e) => update(r.key, { end: e.target.value })} className={input} />
                            <span className="text-muted-foreground">{r.start && r.end ? `${days(r.start, r.end)} d` : ""}</span>
                            <label className="flex items-center gap-1">
                              <input type="radio" checked={r.active} onChange={() => setRows((rs) => rs.map((x) => ({ ...x, active: x.key === r.key })))} /> Activo
                            </label>
                            {summarySources.length > 1 && (
                              <label className="flex items-center gap-1 text-muted-foreground">
                                Resumen de
                                <select value={r.summaryFrom ?? ""} onChange={(e) => update(r.key, { summaryFrom: e.target.value || null })} className={input}>
                                  {summarySources.map((x) => (
                                    <option key={x.id} value={x.id}>{formatCycleRange(x.start_date, x.end_date)}{x.real_spend !== null ? ` · ${money(x.real_spend)}` : ""}</option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {!r.id && (
                              <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="ml-auto text-muted-foreground hover:text-red-600">Quitar</button>
                            )}
                          </>
                        )}
                        {r.action === "merge" && (
                          <select value={r.mergeInto ?? ""} onChange={(e) => update(r.key, { mergeInto: e.target.value })} className={input}>
                            {mergeTargets.filter((t) => t.key !== r.key).map((t) => (
                              <option key={t.key} value={t.id!}>{formatCycleRange(t.start, t.end)}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
                {planIssues.length > 0 && (
                  <ul className="space-y-1">
                    {planIssues.map((i, n) => (
                      <li key={n} className={cn("text-xs flex items-start gap-1.5", i.level === "red" ? "text-red-600" : "text-amber-700 dark:text-amber-400")}>
                        <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />{i.text}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {changed && (
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Impacto</h4>
                  <div className="rounded-lg border border-border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">Ciclo</th>
                          <th className="text-right px-3 py-1.5 font-medium">Días con gasto</th>
                          <th className="text-right px-3 py-1.5 font-medium">Gasto Meta</th>
                          <th className="text-right px-3 py-1.5 font-medium">Conceptos</th>
                          <th className="text-right px-3 py-1.5 font-medium">Assets</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {impact.map(({ row, days: d, spend, concepts, assets, before }) => (
                          <tr key={row.key}>
                            <td className="px-3 py-1.5">{formatCycleRange(row.start, row.end)}{row.active && <span className="ml-1 text-emerald-600">· activo</span>}{!row.id && <span className="ml-1 text-blue-600">· nuevo</span>}</td>
                            <td className="px-3 py-1.5 text-right">{before && before.days !== d ? <><s className="text-muted-foreground">{before.days}</s> {d}</> : d}</td>
                            <td className="px-3 py-1.5 text-right">{before && Math.abs(before.spend - spend) > 0.005 ? <><s className="text-muted-foreground">{money(before.spend)}</s> {money(spend)}</> : money(spend)}</td>
                            <td className="px-3 py-1.5 text-right">{concepts}</td>
                            <td className="px-3 py-1.5 text-right">{assets}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {uncoveredSpend > 0 && (
                    <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">{money(uncoveredSpend)} de gasto quedan en días sin ciclo (no se borran; vuelven a contar si luego se cubren).</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Nada se borra: conceptos, assets, notas del mapa y métricas se mueven al ciclo que corresponda. Los ciclos nuevos o con fechas distintas se re-sincronizan con Meta al aplicar.</p>
                </section>
              )}

              {state.lastRepair && !state.lastRepair.undone_at && (
                <section className="rounded-lg border border-border px-3 py-2.5 flex items-center gap-3 flex-wrap text-xs">
                  <span className="text-muted-foreground">
                    Última reparación: <span className="text-foreground">{state.lastRepair.reason}</span> · {new Date(state.lastRepair.created_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  {state.lastRepair.undoable ? (
                    <button onClick={undo} disabled={isPending} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50">
                      <Undo2 className="w-3.5 h-3.5" /> Deshacer
                    </button>
                  ) : (
                    <span className="ml-auto text-amber-700 dark:text-amber-400">No se puede deshacer: {state.lastRepair.blockedReason}</span>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {state && (
          <div className="px-5 py-3 border-t border-border space-y-2">
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex items-center gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (obligatorio) — ej. fechas mal capturadas al abrir ciclos" className={cn(input, "flex-1 py-1.5 text-sm")} />
              <button
                onClick={apply}
                disabled={isPending || !changed || blocking.length > 0 || !reason.trim()}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? "Aplicando…" : "Aplicar reparación"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
