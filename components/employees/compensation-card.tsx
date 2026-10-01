"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { Plus, X, Loader2, Lock } from "lucide-react"
import {
  getCompensation, saveCompensation, saveBonusAgreement, deleteBonusAgreement,
  type CompensationProfile, type BonusAgreement, type Currency, type PayrollItem,
} from "@/lib/actions/payroll"
import { cn } from "@/lib/utils"

// Compensación de una persona (solo admin): esquema, salario base con
// historial, día de pago, acuerdos de bono y últimos pagos.

const money = (v: number, c: string) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${c}`
const SCHEME = { fixed: "Salario fijo + bonos", commission: "Solo comisión", mixed: "Fijo + comisión" } as const
const KIND = { salary: "Salario", bonus: "Bono", commission: "Comisión" } as const

export function CompensationCard({ profileId }: { profileId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCompensation>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const load = () => getCompensation(profileId).then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  useEffect(() => { load() }, [profileId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cargando…</p>
  const c = data.comp

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Lock className="w-3 h-3" />Solo tú (admin) ves esta sección.</p>
      {!c || editing ? (
        <CompForm profileId={profileId} initial={c} onDone={() => { setEditing(false); load() }} onCancel={c ? () => setEditing(false) : undefined} />
      ) : (
        <div className="flex items-start gap-4 flex-wrap">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
            <Stat label="Esquema" value={SCHEME[c.scheme]} />
            <Stat label="Salario base mensual" value={c.base_salary !== null ? money(Number(c.base_salary), c.currency) : "—"} />
            <Stat label="Día de pago" value={`Día ${c.pay_day}`} />
            <Stat label="Estado" value={c.active ? "Activo" : "Inactivo"} />
          </div>
          <button onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">Editar</button>
        </div>
      )}
      {c?.notes && !editing && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{c.notes}</p>}

      {data.history.length > 1 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Historial de salario ({data.history.length})</summary>
          <ul className="mt-1.5 space-y-0.5">
            {data.history.map((h, i) => <li key={i}>{h.effective_from}: {h.amount !== null ? money(Number(h.amount), h.currency) : "solo comisión"}</li>)}
          </ul>
        </details>
      )}

      <Agreements profileId={profileId} agreements={data.agreements} onChange={load} />

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Últimos pagos</p>
          <Link href="/employees/nomina" className="text-xs text-primary hover:underline">Ir a Nómina →</Link>
        </div>
        {data.items.length === 0 ? <p className="text-xs text-muted-foreground">Sin pagos todavía.</p> : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.items.slice(0, 8).map((i: PayrollItem) => (
              <div key={i.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                <span className="w-16 text-muted-foreground">{KIND[i.kind]}</span>
                <span className="flex-1 truncate">{i.reason}{i.project?.name ? ` · ${i.project.name}` : ""}</span>
                <span className="tabular-nums">{money(Number(i.amount), i.currency)}</span>
                <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-semibold", i.status === "paid" ? "bg-emerald-100 text-emerald-700" : i.status === "skipped" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-800")}>
                  {i.status === "paid" ? `Pagado ${i.paid_at}` : i.status === "skipped" ? "Omitido" : `Vence ${i.due_date}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/40 px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div>
}

const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"

function CompForm({ profileId, initial, onDone, onCancel }: { profileId: string; initial: CompensationProfile | null; onDone: () => void; onCancel?: () => void }) {
  const [f, setF] = useState({
    scheme: initial?.scheme ?? "fixed", base_salary: initial?.base_salary?.toString() ?? "", currency: (initial?.currency ?? "USD") as Currency,
    pay_day: String(initial?.pay_day ?? 1), starts_on: initial?.starts_on ?? new Date().toISOString().slice(0, 10), active: initial?.active ?? true, notes: initial?.notes ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const save = () => start(async () => {
    try {
      await saveCompensation(profileId, { scheme: f.scheme as CompensationProfile["scheme"], base_salary: f.base_salary ? Number(f.base_salary) : null, currency: f.currency, pay_day: Number(f.pay_day) || 1, starts_on: f.starts_on, active: f.active, notes: f.notes.trim() || null })
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  })
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      {!initial && <p className="text-xs text-muted-foreground">Esta persona aún no tiene compensación configurada.</p>}
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs"><span className="text-muted-foreground">Esquema</span>
          <select value={f.scheme} onChange={(e) => setF({ ...f, scheme: e.target.value as typeof f.scheme })} className={cn(input, "mt-0.5")}>
            {Object.entries(SCHEME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        {f.scheme !== "commission" && (
          <label className="text-xs"><span className="text-muted-foreground">Salario base mensual</span>
            <div className="mt-0.5 flex gap-1">
              <input type="number" min="0" step="any" value={f.base_salary} onChange={(e) => setF({ ...f, base_salary: e.target.value })} className={input} />
              <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })} className="rounded-md border border-input bg-background px-1.5 text-sm"><option>USD</option><option>MXN</option></select>
            </div></label>
        )}
        {f.scheme !== "commission" && (
          <label className="text-xs"><span className="text-muted-foreground">Día de pago</span>
            <input type="number" min="1" max="31" value={f.pay_day} onChange={(e) => setF({ ...f, pay_day: e.target.value })} className={cn(input, "mt-0.5")} /></label>
        )}
        {f.scheme !== "commission" && (
          <label className="text-xs"><span className="text-muted-foreground">Genera salario desde</span>
            <input type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} className={cn(input, "mt-0.5")} /></label>
        )}
        <label className="text-xs flex items-end gap-2 pb-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Activo</label>
      </div>
      <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} placeholder="Notas (opcional): acuerdos, condiciones…" className={input} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <button onClick={onCancel} className="text-xs text-muted-foreground px-3">Cancelar</button>}
        <button onClick={save} disabled={isPending} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">{isPending ? "Guardando…" : "Guardar"}</button>
      </div>
    </div>
  )
}

function Agreements({ profileId, agreements, onChange }: { profileId: string; agreements: BonusAgreement[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false)
  const [a, setA] = useState({ title: "", amount: "", currency: "USD" as Currency })
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bonos pactados</p>
        <button onClick={() => setAdding(true)} className="text-xs text-primary inline-flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" />Acuerdo</button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-1.5">Lo que se acordó con esta persona (ej. &quot;Onboarding bien ejecutado → $150&quot;). Se otorgan a mano desde Nómina.</p>
      {agreements.length === 0 && !adding && <p className="text-xs text-muted-foreground">Sin acuerdos.</p>}
      <div className="flex flex-wrap gap-1.5">
        {agreements.map((g) => (
          <span key={g.id} className="group inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-border">
            {g.title} · <b>{money(Number(g.amount), g.currency)}</b>
            <button onClick={() => start(async () => { await deleteBonusAgreement(g.id, profileId); onChange() })} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      {adding && (
        <div className="mt-2 flex gap-1.5 flex-wrap items-center">
          <input value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} placeholder="Motivo" className={cn(input, "flex-1 min-w-[180px]")} />
          <input type="number" min="0" step="any" value={a.amount} onChange={(e) => setA({ ...a, amount: e.target.value })} placeholder="Monto" className={cn(input, "w-28")} />
          <select value={a.currency} onChange={(e) => setA({ ...a, currency: e.target.value as Currency })} className="rounded-md border border-input bg-background px-1.5 py-1.5 text-sm"><option>USD</option><option>MXN</option></select>
          <button disabled={isPending} onClick={() => start(async () => {
            try { await saveBonusAgreement(profileId, { title: a.title, amount: Number(a.amount), currency: a.currency }); setAdding(false); setA({ title: "", amount: "", currency: "USD" }); onChange() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
          })} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs">Guardar</button>
          <button onClick={() => setAdding(false)} className="text-xs text-muted-foreground">Cancelar</button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
