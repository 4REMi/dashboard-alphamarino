"use client"

import { useEffect, useState, useTransition } from "react"
import { ExternalLink, Check, X, RotateCcw } from "lucide-react"
import { getBonusReports, reviewBonusActivity, finishBonusReview, reopenBonusReport, type AdminBonusReport } from "@/lib/actions/payroll"
import { cn } from "@/lib/utils"

// Revisión de reportes de bonos del mes (en Nómina). Aprobar crea el bono
// pendiente de pago; rechazar deja un comentario. "Terminar revisión"
// avisa al empleado por Telegram.

const TONE = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

export function BonusReportsReview({ month, agreementsById, onChanged }: {
  month: string
  agreementsById: Map<string, { title: string; amount: number; currency: string }>
  onChanged: () => void
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getBonusReports>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const load = () => getBonusReports(month).then(setData)
  useEffect(() => { load() }, [month]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = (fn: () => Promise<void>) => start(async () => { try { setError(null); await fn(); await load(); onChanged() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } })

  if (!data || (data.reports.length === 0 && data.missing.length === 0)) return null
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold text-sm">Reportes de bonos</h3>
        {data.missing.length > 0 && <span className="text-xs text-muted-foreground">Sin enviar: {data.missing.map((m) => m.full_name).join(", ")}</span>}
      </div>
      {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}
      {data.reports.map((r: AdminBonusReport) => {
        const pending = r.items.filter((i) => i.status === "pending").length
        return (
          <div key={r.id} className="border-b border-border last:border-b-0">
            <div className="px-4 py-2 flex items-center gap-2 bg-muted/30">
              <span className="text-sm font-medium">{r.profile?.full_name}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", r.status === "reviewed" ? TONE.approved : TONE.pending)}>{r.status === "reviewed" ? "Revisado" : `${pending} por revisar`}</span>
              <span className="ml-auto flex gap-2">
                {r.status === "submitted" && (
                  <button disabled={isPending} onClick={() => { if (confirm("¿Regresarlo a borrador para que lo corrija?")) run(() => reopenBonusReport(r.id)) }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" />Regresar</button>
                )}
                {r.status === "submitted" && pending === 0 && (
                  <button disabled={isPending} onClick={() => run(() => finishBonusReview(r.id))} className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground">Terminar revisión y avisar</button>
                )}
              </span>
            </div>
            {r.items.map((i) => <ItemRow key={i.id} i={i} ag={i.agreement_id ? agreementsById.get(i.agreement_id) : undefined} locked={r.status === "reviewed"} busy={isPending} run={run} />)}
          </div>
        )
      })}
    </section>
  )
}

function ItemRow({ i, ag, locked, busy, run }: {
  i: AdminBonusReport["items"][number]
  ag?: { title: string; amount: number; currency: string }
  locked: boolean
  busy: boolean
  run: (fn: () => Promise<void>) => void
}) {
  const [amount, setAmount] = useState(String(i.approved_amount ?? ag?.amount ?? ""))
  const [comment, setComment] = useState(i.admin_comment ?? "")
  return (
    <div className="px-4 py-2.5 flex gap-3 text-sm border-t border-border/50">
      <div className="flex-1 min-w-0">
        <p className="text-xs"><b>{ag?.title ?? "Sin bono pactado"}</b>{i.project?.name && <span className="text-muted-foreground"> · {i.project.name}</span>}</p>
        <p className="whitespace-pre-wrap">{i.description}</p>
        {i.evidence_url && <a href={i.evidence_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline"><ExternalLink className="w-3 h-3" />Evidencia</a>}
        {!locked && <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentario para el empleado (opcional)" className="mt-1.5 w-full rounded-md border border-input bg-background px-2 py-1 text-xs" />}
        {locked && i.admin_comment && <p className="text-xs text-muted-foreground mt-1">Comentario: {i.admin_comment}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", TONE[i.status])}>{i.status === "pending" ? "Pendiente" : i.status === "approved" ? `Aprobada · $${i.approved_amount}` : "Rechazada"}</span>
        {!locked && (
          <div className="flex items-center gap-1">
            <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-20 rounded-md border border-input bg-background px-1.5 py-1 text-xs" title={`Monto ${ag?.currency ?? "USD"}`} />
            <button disabled={busy} onClick={() => run(() => reviewBonusActivity(i.id, "approved", { amount: Number(amount), currency: (ag?.currency as "USD" | "MXN") ?? "USD", comment }))} title="Aprobar (crea el bono en Nómina)" className="p-1.5 rounded-md bg-emerald-600 text-white disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
            <button disabled={busy} onClick={() => run(() => reviewBonusActivity(i.id, "rejected", { comment }))} title="Rechazar" className="p-1.5 rounded-md bg-red-600 text-white disabled:opacity-50"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  )
}
