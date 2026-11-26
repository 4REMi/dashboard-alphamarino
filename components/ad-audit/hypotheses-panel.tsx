"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Lightbulb } from "lucide-react"
import { cn } from "@/lib/utils"
import { generateCampaignHypotheses, setHypothesisStatus } from "@/lib/actions/ad-audits"
import type { AuditHypothesis, CampaignAuditView } from "@/lib/ad-audit/queries"
import { VERDICT } from "@/components/ad-audit/ui"

const PART: Record<AuditHypothesis["part"], string> = { gancho: "Gancho", cuerpo: "Cuerpo", cierre: "Cierre", tienda: "Tienda", general: "General" }
const CONF: Record<AuditHypothesis["confidence"], string> = {
  alta: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  media: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  baja: "bg-muted text-muted-foreground",
}
const STATUS: Record<AuditHypothesis["status"], { label: string; className: string }> = {
  open: { label: "Abierta", className: "border-border" },
  confirmed: { label: "Confirmada", className: "border-emerald-500/50" },
  discarded: { label: "Descartada", className: "border-border opacity-70" },
}

export function HypothesesPanel({ view, hypotheses, error, basePath }: {
  view: CampaignAuditView; hypotheses: AuditHypothesis[]; error: string | null; basePath: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [genError, setGenError] = useState<string | null>(null)
  const [noteFor, setNoteFor] = useState<{ id: string; status: AuditHypothesis["status"] } | null>(null)
  const [note, setNote] = useState("")
  const ads = new Map(view.adsets.flatMap((s) => s.ads.map((a) => [a.id, a] as const)))
  const adsetName = new Map(view.adsets.map((s) => [s.id, s.name]))
  const ordered = [...hypotheses].sort((a, b) => ["open", "confirmed", "discarded"].indexOf(a.status) - ["open", "confirmed", "discarded"].indexOf(b.status))

  const generate = () => start(async () => {
    setGenError(null)
    try { await generateCampaignHypotheses(view.campaign.id); router.refresh() } catch (e) { setGenError(e instanceof Error ? e.message : "Falló") }
  })
  const saveStatus = () => start(async () => {
    if (!noteFor) return
    await setHypothesisStatus(noteFor.id, noteFor.status, note)
    setNoteFor(null); setNote(""); router.refresh()
  })

  return (
    <section className="flex flex-col gap-3" aria-labelledby="hyp-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="hyp-title" className="text-lg font-semibold">Hipótesis</h2>
          <p className="text-xs text-muted-foreground">Generadas solo con los números de esta campaña. Confírmalas o descártalas con datos nuevos.</p>
        </div>
        <button onClick={generate} disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold disabled:opacity-60">
          <Lightbulb className="h-4 w-4" />
          {pending && !noteFor ? "Generando… (~30 s)" : hypotheses.some((h) => h.status === "open") ? "Regenerar hipótesis" : "Generar hipótesis"}
        </button>
      </div>
      {(error || genError) && <p className="text-sm text-destructive">{error ?? genError}</p>}
      {!error && hypotheses.length === 0 && (
        <p className="text-sm text-muted-foreground">Aún no hay hipótesis. Funcionan mejor después de analizar los creativos por partes.</p>
      )}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
        {ordered.map((h) => {
          const stale = h.period_until !== view.campaign.period_until || h.period_since !== view.campaign.period_since
          return (
            <div key={h.id} className={cn("flex flex-col gap-2 rounded-xl border bg-card p-3.5", STATUS[h.status].className)}>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                <span className="rounded-full bg-muted px-2 py-0.5">{PART[h.part]}</span>
                <span className={cn("rounded-full px-2 py-0.5", CONF[h.confidence])}>Confianza {h.confidence}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{STATUS[h.status].label}</span>
                {h.adset_id && <span className="truncate font-normal text-muted-foreground">{adsetName.get(h.adset_id)}</span>}
              </div>
              <p className="font-semibold leading-snug">{h.claim}</p>
              <p className="text-sm text-muted-foreground">{h.evidence}</p>
              {h.test && <p className="text-sm"><span className="font-semibold">Para probarla:</span> {h.test}</p>}
              {h.ad_ids.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Evidencia hoy{stale ? " (datos más nuevos que los de la hipótesis: revísala)" : ""}:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {h.ad_ids.map((id) => {
                      const a = ads.get(id)
                      if (!a) return null
                      return (
                        <Link key={id} href={`${basePath}/a/${id}`} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold hover:underline", VERDICT[a.evaluation.verdict].className)}>
                          {a.name} · {VERDICT[a.evaluation.verdict].label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
              {h.status_note && <p className="rounded-lg bg-muted px-2 py-1.5 text-xs"><span className="font-semibold">Nota:</span> {h.status_note}</p>}
              <p className="text-[11px] text-muted-foreground">Datos del {h.period_since} al {h.period_until}</p>

              {noteFor?.id === h.id ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground" htmlFor={`note-${h.id}`}>
                    {noteFor.status === "confirmed" ? "¿Qué lo confirmó?" : noteFor.status === "discarded" ? "¿Por qué se descarta?" : "Nota (opcional)"}
                  </label>
                  <textarea id={`note-${h.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
                  <div className="flex gap-2">
                    <button onClick={saveStatus} disabled={pending} className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">Guardar</button>
                    <button onClick={() => { setNoteFor(null); setNote("") }} className="h-9 rounded-lg px-3 text-sm text-muted-foreground">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {h.status !== "confirmed" && <button onClick={() => { setNoteFor({ id: h.id, status: "confirmed" }); setNote(h.status_note ?? "") }} className="h-9 rounded-lg border border-border px-3 text-sm">Confirmar</button>}
                  {h.status !== "discarded" && <button onClick={() => { setNoteFor({ id: h.id, status: "discarded" }); setNote(h.status_note ?? "") }} className="h-9 rounded-lg border border-border px-3 text-sm">Descartar</button>}
                  {h.status !== "open" && <button onClick={() => { setNoteFor({ id: h.id, status: "open" }); setNote(h.status_note ?? "") }} className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground">Reabrir</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
