"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, Check, Undo2, X, Loader2, AlertTriangle } from "lucide-react"
import {
  getPayroll, addPayrollItem, markPaid, unmarkPaid, skipOrDeleteItem, retireLegacyPayroll,
  type PayrollOverview, type PayrollItem, type Currency,
} from "@/lib/actions/payroll"
import { cn } from "@/lib/utils"

// Nómina del mes: qué hay que pagar, por persona y moneda. Salarios se
// generan solos; bonos y comisiones se agregan a mano. "Pagado" crea el
// gasto en Finanzas. Mismo código de color: rojo vencido, ámbar pendiente,
// verde pagado.

const money = (v: number, c: string) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${c}`
const KIND = { salary: "Salario", bonus: "Bono", commission: "Comisión" } as const
const todayIso = () => new Date().toISOString().slice(0, 10)
const shift = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 10) }
const monthLabel = (m: string) => { const s = new Date(m + "T00:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" }); return s[0].toUpperCase() + s.slice(1) }

export function PayrollView({ projects }: { projects: { id: string; name: string }[] }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7) + "-01")
  const [data, setData] = useState<PayrollOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, start] = useTransition()

  const load = (m = month) => getPayroll(m).then((d) => { setData(d); setError(null) }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  useEffect(() => { load(month) }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = (fn: () => Promise<unknown>) => start(async () => { try { await fn(); await load() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } })

  const today = todayIso()
  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; items: PayrollItem[] }>()
    for (const it of data?.items ?? []) {
      const e = map.get(it.profile_id) ?? { name: it.profile?.full_name ?? "—", items: [] }
      e.items.push(it); map.set(it.profile_id, e)
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [data])
  const totals = useMemo(() => {
    const t: Record<string, { pending: number; paid: number }> = {}
    for (const it of data?.items ?? []) {
      if (it.status === "skipped") continue
      const c = (t[it.currency] ??= { pending: 0, paid: 0 })
      if (it.status === "paid") c.paid += Number(it.amount); else c.pending += Number(it.amount)
    }
    return t
  }, [data])
  const pendingIds = (data?.items ?? []).filter((i) => i.status === "pending").map((i) => i.id)
  const tone = (i: PayrollItem) => i.status === "paid" ? "paid" : i.status === "skipped" ? "skipped" : i.due_date < today ? "late" : "pending"

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && data.legacyPayroll.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-sm space-y-2">
          <p className="font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Gastos de nómina recurrentes viejos en Finanzas</p>
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
            {data.legacyPayroll.map((l) => `${l.name} ($${l.amount})`).join(" · ")}. Para no contar doble, dalos de baja: cuentan hasta el mes pasado (el historial se conserva) y desde este mes cuentan los pagos de Nómina.
          </p>
          <button onClick={() => act(() => retireLegacyPayroll(data.legacyPayroll.map((l) => l.id)))} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-md bg-amber-600 text-white disabled:opacity-50">Dar de baja desde este mes</button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(shift(month, -1))} className="p-1.5 rounded-md hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-base font-semibold w-40 text-center">{monthLabel(month)}</span>
          <button onClick={() => setMonth(shift(month, 1))} className="p-1.5 rounded-md hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(totals).map(([c, t]) => (
            <span key={c} className="text-xs rounded-lg bg-muted/50 px-2.5 py-1">
              {c}: <b className="text-amber-700 dark:text-amber-400">{money(t.pending, c)}</b> por pagar · <b className="text-emerald-700 dark:text-emerald-400">{money(t.paid, c)}</b> pagado
            </span>
          ))}
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex gap-2">
          <button onClick={() => setAdding(true)} className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted"><Plus className="w-3.5 h-3.5" />Bono / comisión</button>
          {pendingIds.length > 0 && (
            <button onClick={() => { if (confirm(`¿Marcar ${pendingIds.length} pagos como pagados hoy? Se crearán sus gastos en Finanzas.`)) act(() => markPaid(pendingIds)) }} disabled={busy}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"><Check className="w-3.5 h-3.5" />Pagar todo ({pendingIds.length})</button>
          )}
        </div>
      </div>

      {data && data.overdue.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 overflow-hidden">
          <p className="px-4 py-2 text-xs font-semibold bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">Pendientes de meses anteriores ({data.overdue.length})</p>
          {data.overdue.map((i) => <Row key={i.id} i={i} tone="late" showPerson busy={busy} act={act} />)}
        </div>
      )}

      {!data ? <p className="text-sm text-muted-foreground">Cargando…</p> : byPerson.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-8 text-center">
          Nada en este mes. Configura la compensación de cada persona en su perfil (Equipo → persona) o agrega un bono/comisión.
        </p>
      ) : (
        <div className="space-y-3">
          {byPerson.map(([pid, p]) => (
            <div key={pid} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                <Link href={`/employees/${pid}`} className="font-medium text-sm hover:underline">{p.name}</Link>
                <span className="ml-auto text-xs text-muted-foreground">
                  {Object.entries(p.items.filter((i) => i.status !== "skipped").reduce<Record<string, number>>((acc, i) => { acc[i.currency] = (acc[i.currency] ?? 0) + Number(i.amount); return acc }, {})).map(([c, v]) => money(v, c)).join(" + ")}
                </span>
              </div>
              {p.items.map((i) => <Row key={i.id} i={i} tone={tone(i)} busy={busy} act={act} />)}
            </div>
          ))}
        </div>
      )}

      {adding && data && <AddDialog data={data} projects={projects} month={month} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </div>
  )
}

function Row({ i, tone, showPerson, busy, act }: { i: PayrollItem; tone: string; showPerson?: boolean; busy: boolean; act: (fn: () => Promise<unknown>) => void }) {
  const pill = { paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", late: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", skipped: "bg-muted text-muted-foreground" }[tone]
  const label = tone === "paid" ? `Pagado ${i.paid_at}${i.currency === "MXN" && i.amount_usd ? ` · $${i.amount_usd} USD` : ""}` : tone === "late" ? `Vencido ${i.due_date}` : tone === "skipped" ? "Omitido" : `Vence ${i.due_date}`
  return (
    <div className="group px-4 py-2 flex items-center gap-3 text-sm border-t border-border first:border-t-0">
      <span className="w-20 text-xs text-muted-foreground">{KIND[i.kind]}</span>
      <span className="flex-1 min-w-0 truncate text-xs">
        {showPerson && <b>{i.profile?.full_name} · </b>}{i.reason}{i.project?.name ? <span className="text-muted-foreground"> · {i.project.name}</span> : null}
      </span>
      <span className={cn("tabular-nums font-medium", tone === "skipped" && "line-through text-muted-foreground")}>{money(Number(i.amount), i.currency)}</span>
      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", pill)}>{label}</span>
      <span className="flex gap-1 w-24 justify-end">
        {i.status === "pending" && <button disabled={busy} onClick={() => act(() => markPaid([i.id]))} className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-50">Pagar</button>}
        {i.status === "paid" && <button disabled={busy} onClick={() => { if (confirm("¿Deshacer el pago? Se borra su gasto en Finanzas.")) act(() => unmarkPaid(i.id)) }} title="Deshacer pago" className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"><Undo2 className="w-3.5 h-3.5" /></button>}
        {i.status !== "paid" && <button disabled={busy} onClick={() => act(() => skipOrDeleteItem(i.id))} title={i.kind === "salary" ? (i.status === "skipped" ? "Volver a pendiente" : "Omitir este mes") : "Quitar"} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100">{i.status === "skipped" ? <Undo2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}</button>}
      </span>
    </div>
  )
}

function AddDialog({ data, projects, month, onClose, onSaved }: { data: PayrollOverview; projects: { id: string; name: string }[]; month: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ profileId: "", kind: "bonus" as "bonus" | "commission", amount: "", currency: "USD" as Currency, reason: "", projectId: "", agreementId: "", dueDate: todayIso() })
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const person = data.people.find((p) => p.id === f.profileId)
  const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Agregar bono o comisión — {monthLabel(month)}</h3>
        <div className="grid grid-cols-2 gap-2">
          <select value={f.profileId} onChange={(e) => setF({ ...f, profileId: e.target.value, agreementId: "" })} className={cn(input, "col-span-2")}>
            <option value="">Persona…</option>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "bonus" | "commission" })} className={input}><option value="bonus">Bono</option><option value="commission">Comisión</option></select>
          <input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} className={input} title="Fecha en que se debe pagar" />
        </div>
        {f.kind === "bonus" && person && person.agreements.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Bonos pactados</p>
            <div className="flex flex-wrap gap-1.5">
              {person.agreements.map((a) => (
                <button key={a.id} onClick={() => setF({ ...f, agreementId: a.id, amount: String(a.amount), currency: a.currency, reason: a.title })}
                  className={cn("text-xs px-2 py-1 rounded-full border", f.agreementId === a.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                  {a.title} · {money(Number(a.amount), a.currency)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input type="number" min="0" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value, agreementId: "" })} placeholder="Monto" className={input} />
          <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })} className="rounded-md border border-input bg-background px-2 text-sm"><option>USD</option><option>MXN</option></select>
        </div>
        <input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Motivo (ej. Comisión cierre Union Padel)" className={input} />
        <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} className={input}>
          <option value="">Proyecto (opcional)</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-muted-foreground px-3">Cancelar</button>
          <button disabled={isPending || !f.profileId} onClick={() => start(async () => {
            try {
              await addPayrollItem({ profileId: f.profileId, kind: f.kind, amount: Number(f.amount), currency: f.currency, reason: f.reason, projectId: f.projectId || null, agreementId: f.agreementId || null, month, dueDate: f.dueDate })
              onSaved()
            } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
          })} className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Agregar</button>
        </div>
      </div>
    </div>
  )
}
