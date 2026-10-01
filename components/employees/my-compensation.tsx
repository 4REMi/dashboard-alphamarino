"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, Send, Lock, ExternalLink, Check, X } from "lucide-react"
import { DEADLINE_DAY } from "@/lib/utils/bonus-report"
import { saveMyBonusActivity, deleteMyBonusActivity, submitMyBonusReport, type BonusReport, type BonusReportItem } from "@/lib/actions/my-compensation"
import type { CompensationProfile, BonusAgreement, PayrollItem } from "@/lib/actions/payroll"
import { cn } from "@/lib/utils"

// Vista del empleado: su contrato (solo lectura), sus bonos pactados, sus
// pagos y el reporte mensual de bonos (borrador → enviado → revisado).

const money = (v: number, c: string) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${c}`
const monthLabel = (m: string) => { const s = new Date(m + "T00:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" }); return s[0].toUpperCase() + s.slice(1) }
const deadline = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, DEADLINE_DAY)).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" }) }
const KIND = { salary: "Salario", bonus: "Bono", commission: "Comisión" } as const
const ITEM_TONE = {
  pending: { label: "En revisión", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  approved: { label: "Aprobada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "Rechazada", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
}

export function MyCompensation({ comp, agreements, payments, reports, pastReports, projects }: {
  comp: CompensationProfile
  agreements: BonusAgreement[]
  payments: PayrollItem[]
  reports: BonusReport[]
  pastReports: BonusReport[]
  projects: { id: string; name: string }[]
}) {
  return (
    <div className="space-y-6 max-w-4xl">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Lock className="w-3 h-3" />Solo tú y la administración ven esta información.</p>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Mi contrato actual</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Salario base mensual" value={comp.base_salary !== null ? money(Number(comp.base_salary), comp.currency) : "—"} />
          <Stat label="Día de pago" value={`Día ${comp.pay_day} de cada mes`} />
          <Stat label="Esquema" value={comp.scheme === "fixed" ? "Salario fijo + bonos" : comp.scheme === "mixed" ? "Fijo + comisión" : "Comisión"} />
        </div>
        {comp.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-3">{comp.notes}</p>}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Mis bonos pactados</p>
          {agreements.length === 0 ? <p className="text-sm text-muted-foreground">Sin bonos pactados por ahora.</p> : (
            <div className="flex flex-wrap gap-2">
              {agreements.map((a) => <span key={a.id} className="text-sm px-3 py-1 rounded-full border border-border">{a.title} · <b>{money(Number(a.amount), a.currency)}</b></span>)}
            </div>
          )}
        </div>
      </section>

      {reports.map((r) => <ReportEditor key={r.period_month} report={r} agreements={agreements} projects={projects} />)}

      {pastReports.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold mb-2">Reportes anteriores</h2>
          <div className="space-y-3">
            {pastReports.map((r) => (
              <details key={r.period_month} className="text-sm">
                <summary className="cursor-pointer">{monthLabel(r.period_month)} · {r.status === "reviewed" ? "Revisado" : "Enviado"} · {r.items.length} actividades</summary>
                <div className="mt-2 space-y-1.5">{r.items.map((i) => <ItemView key={i.id} i={i} agreements={agreements} />)}</div>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold mb-2">Mis pagos</h2>
        {payments.length === 0 ? <p className="text-sm text-muted-foreground">Sin pagos todavía.</p> : (
          <div className="divide-y divide-border">
            {payments.map((p) => (
              <div key={p.id} className="py-2 flex items-center gap-3 text-sm">
                <span className="w-20 text-xs text-muted-foreground">{KIND[p.kind]}</span>
                <span className="flex-1 truncate">{p.reason}</span>
                <span className="tabular-nums">{money(Number(p.amount), p.currency)}</span>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", p.status === "paid" ? ITEM_TONE.approved.cls : ITEM_TONE.pending.cls)}>
                  {p.status === "paid" ? `Pagado ${p.paid_at}` : `Programado ${p.due_date}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/40 px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div>
}

function ItemView({ i, agreements }: { i: BonusReportItem; agreements: BonusAgreement[] }) {
  const ag = agreements.find((a) => a.id === i.agreement_id)
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">{ag?.title ?? "Sin bono pactado"}</span>
        {i.project?.name && <span className="text-muted-foreground">· {i.project.name}</span>}
        <span className={cn("ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full", ITEM_TONE[i.status].cls)}>{ITEM_TONE[i.status].label}{i.status === "approved" && i.approved_amount ? ` · $${i.approved_amount}` : ""}</span>
      </div>
      <p className="text-sm mt-1 whitespace-pre-wrap">{i.description}</p>
      {i.evidence_url && <a href={i.evidence_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline"><ExternalLink className="w-3 h-3" />Evidencia</a>}
      {i.admin_comment && <p className="text-xs mt-1 text-muted-foreground border-l-2 border-border pl-2">Comentario: {i.admin_comment}</p>}
    </div>
  )
}

const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"

function ReportEditor({ report, agreements, projects }: { report: BonusReport; agreements: BonusAgreement[]; projects: { id: string; name: string }[] }) {
  const router = useRouter()
  const editable = report.status === "draft"
  const [form, setForm] = useState<{ id?: string; agreementId: string; description: string; evidenceUrl: string; projectId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const run = (fn: () => Promise<void>) => start(async () => { try { setError(null); await fn(); router.refresh() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } })

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-semibold">Reporte de bonos — {monthLabel(report.period_month)}</h2>
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", editable ? "bg-muted text-muted-foreground" : report.status === "reviewed" ? ITEM_TONE.approved.cls : ITEM_TONE.pending.cls)}>
          {editable ? "Borrador" : report.status === "reviewed" ? "Revisado" : "Enviado — en revisión"}
        </span>
        {editable && <span className="text-xs text-muted-foreground">Fecha límite: {deadline(report.period_month)}</span>}
      </div>
      {editable && <p className="text-xs text-muted-foreground">Registra las actividades de este mes que corresponden a tus bonos (qué hiciste, en qué proyecto y un enlace de evidencia si hay). Cuando termines, envíalo para revisión.</p>}

      <div className="space-y-2">
        {report.items.length === 0 && !form && <p className="text-sm text-muted-foreground">Sin actividades todavía.</p>}
        {report.items.map((i) => (
          <div key={i.id} className="group relative">
            <ItemView i={i} agreements={agreements} />
            {editable && (
              <div className="absolute top-2 right-24 hidden group-hover:flex gap-1">
                <button onClick={() => setForm({ id: i.id, agreementId: i.agreement_id ?? "", description: i.description, evidenceUrl: i.evidence_url ?? "", projectId: i.project_id ?? "" })} className="p-1 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => run(() => deleteMyBonusActivity(report.period_month, i.id))} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editable && form && (
        <div className="rounded-lg border border-primary/40 p-3 space-y-2">
          <select value={form.agreementId} onChange={(e) => setForm({ ...form, agreementId: e.target.value })} className={input}>
            <option value="">¿A qué bono corresponde?</option>
            {agreements.map((a) => <option key={a.id} value={a.id}>{a.title} · {money(Number(a.amount), a.currency)}</option>)}
            <option value="">Otro (sin bono pactado)</option>
          </select>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Qué hiciste — ej. Onboarding de Union Padel completo: accesos, pixel, brief y kickoff en 5 días" className={input} />
          <div className="grid sm:grid-cols-2 gap-2">
            <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className={input}>
              <option value="">Proyecto (opcional)</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input value={form.evidenceUrl} onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })} placeholder="Enlace de evidencia (opcional)" className={input} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="text-xs text-muted-foreground px-2 inline-flex items-center gap-1"><X className="w-3 h-3" />Cancelar</button>
            <button disabled={isPending} onClick={() => run(async () => {
              await saveMyBonusActivity({ month: report.period_month, id: form.id, agreementId: form.agreementId || null, description: form.description, evidenceUrl: form.evidenceUrl, projectId: form.projectId || null })
              setForm(null)
            })} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"><Check className="w-3 h-3" />Guardar</button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {editable && (
        <div className="flex gap-2">
          {!form && <button onClick={() => setForm({ agreementId: "", description: "", evidenceUrl: "", projectId: "" })} className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted"><Plus className="w-3.5 h-3.5" />Agregar actividad</button>}
          {report.items.length > 0 && (
            <button disabled={isPending} onClick={() => { if (confirm(`¿Enviar el reporte de ${monthLabel(report.period_month)}? Ya no podrás editarlo.`)) run(() => submitMyBonusReport(report.period_month)) }}
              className="ml-auto h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"><Send className="w-3.5 h-3.5" />Enviar para revisión</button>
          )}
        </div>
      )}
    </section>
  )
}
