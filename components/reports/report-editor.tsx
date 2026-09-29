"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, Printer, RefreshCw, Sparkles, Check, Plus, X, Loader2, Trash2 } from "lucide-react"
import { saveReportSections, regenerateReport, setReportDelivered, deleteReport } from "@/lib/actions/reports"
import type { PaidMediaReport, ReportSections } from "@/lib/reports/types"
import { ReportDocument } from "@/components/reports/report-document"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { cn } from "@/lib/utils"

// Editor del reporte: a la izquierda las notas del equipo y cada sección
// de la narrativa (editable); a la derecha, la vista previa tal como sale
// en PDF. Los números vienen del dashboard (snapshot al generar); se pueden
// refrescar.

type ListKey = "que_funciono" | "que_no_funciono" | "siguientes_pasos"

export function ReportEditor({ initial }: { initial: PaidMediaReport }) {
  const router = useRouter()
  const [report, setReport] = useState(initial)
  const [sections, setSections] = useState<ReportSections>(initial.sections)
  const [notes, setNotes] = useState(initial.notes ?? "")
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const set = (patch: Partial<ReportSections>) => { setSections((s) => ({ ...s, ...patch })); setDirty(true) }
  const setItem = (k: ListKey, i: number, v: string) => set({ [k]: sections[k].map((x, j) => (j === i ? v : x)) } as Partial<ReportSections>)
  const addItem = (k: ListKey) => set({ [k]: [...sections[k], ""] } as Partial<ReportSections>)
  const removeItem = (k: ListKey, i: number) => set({ [k]: sections[k].filter((_, j) => j !== i) } as Partial<ReportSections>)

  function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(null)
    startTransition(async () => {
      try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
    })
  }

  const save = () => run("Guardando…", async () => { await saveReportSections(report.id, sections, notes); setDirty(false) })
  const regenerate = (refreshData: boolean) => {
    if (dirty && !confirm("Se reescribirá la narrativa y perderás tus ediciones sin guardar. ¿Continuar?")) return
    run(refreshData ? "Actualizando datos y reescribiendo…" : "Reescribiendo narrativa…", async () => {
      const r = await regenerateReport(report.id, notes, refreshData)
      setReport(r); setSections(r.sections); setDirty(false)
    })
  }
  const toggleDelivered = () => run("Guardando…", async () => {
    if (dirty) await saveReportSections(report.id, sections, notes)
    const next = report.status !== "delivered"
    await setReportDelivered(report.id, next)
    setReport((r) => ({ ...r, status: next ? "delivered" : "draft" })); setDirty(false)
  })
  const remove = () => {
    if (!confirm("¿Eliminar este reporte?")) return
    run("Eliminando…", async () => { await deleteReport(report.id); router.push(`/projects/${report.project_id}`) })
  }

  const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"

  const List = ({ k, label, numbered }: { k: ListKey; label: string; numbered?: boolean }) => (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</p>
      <div className="space-y-1.5">
        {sections[k].map((t, i) => (
          <div key={i} className="flex gap-1.5 items-start">
            <span className="text-xs text-muted-foreground mt-2 w-4 shrink-0">{numbered ? `${i + 1}.` : "–"}</span>
            <AutoTextarea value={t} onChange={(e) => setItem(k, i, e.target.value)} rows={1} className={input} />
            <button onClick={() => removeItem(k, i)} className="mt-1.5 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => addItem(k)} className="mt-1 text-xs text-primary inline-flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" />Agregar</button>
    </section>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-0px)]">
      <header className="px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap bg-card">
        <Link href={`/projects/${report.project_id}`} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{report.title ?? "Reporte"}</p>
          <p className="text-xs text-muted-foreground">{report.data.cliente} · {report.data.periodo.label}</p>
        </div>
        <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", report.status === "delivered" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300")}>
          {report.status === "delivered" ? "Entregado" : "Borrador"}
        </span>
        {busy && <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />{busy}</span>}
        <button onClick={save} disabled={!dirty || !!busy} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">{dirty ? "Guardar" : "Guardado"}</button>
        <a href={`/api/reports/${report.id}/docx`} className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted"><Download className="w-3.5 h-3.5" />DOCX</a>
        <a href={`/print/report/${report.id}`} target="_blank" rel="noopener noreferrer" onClick={() => { if (dirty) save() }} className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted"><Printer className="w-3.5 h-3.5" />PDF</a>
        <button onClick={toggleDelivered} disabled={!!busy} className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted"><Check className="w-3.5 h-3.5" />{report.status === "delivered" ? "Volver a borrador" : "Marcar entregado"}</button>
        <button onClick={remove} className="p-1.5 text-muted-foreground hover:text-destructive" title="Eliminar reporte"><Trash2 className="w-4 h-4" /></button>
      </header>
      {error && <p className="px-6 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30">{error}</p>}

      <div className="flex-1 min-h-0 grid lg:grid-cols-[420px_1fr]">
        <aside className="border-r border-border overflow-y-auto p-5 space-y-5 bg-muted/20">
          <section className="rounded-lg border border-border bg-background p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notas del equipo</p>
            <p className="text-[11px] text-muted-foreground">Lo que el dashboard no sabe: qué dijo el cliente, calidad de leads, sentimiento del inbox, decisiones. La IA las integra en la narrativa.</p>
            <AutoTextarea value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true) }} rows={4} className={input} placeholder="Ej. En llamada, el cliente confirmó que ya hay membresías pagadas por los anuncios…" />
            <div className="flex gap-2">
              <button onClick={() => regenerate(false)} disabled={!!busy} className="flex-1 h-8 rounded-md border border-border text-xs inline-flex items-center justify-center gap-1.5 hover:bg-muted disabled:opacity-50"><Sparkles className="w-3.5 h-3.5" />Reescribir narrativa</button>
              <button onClick={() => regenerate(true)} disabled={!!busy} title="Vuelve a leer los números del dashboard y reescribe" className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"><RefreshCw className="w-3.5 h-3.5" />Actualizar datos</button>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Resumen ejecutivo</p>
            <AutoTextarea value={sections.resumen} onChange={(e) => set({ resumen: e.target.value })} rows={4} className={input} />
          </section>
          {List({ k: "que_funciono", label: "Lo que funcionó" })}
          {List({ k: "que_no_funciono", label: "Oportunidades de mejora" })}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Contexto del período</p>
            <AutoTextarea value={sections.contexto} onChange={(e) => set({ contexto: e.target.value })} rows={4} className={input} />
          </section>
          {List({ k: "siguientes_pasos", label: "Siguientes pasos", numbered: true })}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Nota de cierre (opcional)</p>
            <AutoTextarea value={sections.nota_cierre} onChange={(e) => set({ nota_cierre: e.target.value })} rows={2} className={input} />
          </section>
          <p className="text-[11px] text-muted-foreground">Las tablas, campañas, creativos y entregables salen del dashboard. Para corregir un número, corrígelo en su origen y usa &quot;Actualizar datos&quot;.</p>
        </aside>

        <div className="overflow-y-auto bg-neutral-200 dark:bg-neutral-800 py-6">
          <div className="shadow-lg max-w-[816px] mx-auto">
            <ReportDocument data={report.data} sections={sections} />
          </div>
        </div>
      </div>
    </div>
  )
}
