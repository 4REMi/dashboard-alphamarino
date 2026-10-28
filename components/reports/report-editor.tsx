"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, Printer, RefreshCw, Sparkles, Check, Plus, X, Loader2, Trash2, Eye, EyeOff, RotateCcw } from "lucide-react"
import { saveReportSections, regenerateReport, setReportDelivered, deleteReport } from "@/lib/actions/reports"
import { campaignKey, deliverableKey, type PaidMediaReport, type ReportSections, type ReportTableConfig } from "@/lib/reports/types"
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
  // Campo enlazado entre editor y vista previa (ver ReportDocument).
  const [active, setActive] = useState<string | null>(null)
  const asideRef = useRef<HTMLElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  // Clic en la vista previa → lleva a su caja de texto y la enfoca.
  function jumpToField(field: string) {
    setActive(field)
    const el = asideRef.current?.querySelector<HTMLElement>(`textarea[data-field="${field}"]`)
      // Tablas: se enfoca la primera caja de nombre de esa sección.
      ?? asideRef.current?.querySelector<HTMLElement>(`section[data-field="${field}"] input`)
      ?? asideRef.current?.querySelector<HTMLElement>(`section[data-field="${field}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.focus({ preventScroll: true })
    el.classList.add("ring-2", "ring-primary")
    setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1200)
  }
  // Al enfocar una caja de texto → resalta y muestra su parte en la vista previa.
  function focusField(field: string) {
    setActive(field)
    previewRef.current?.querySelector(`[data-field="${field}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }
  const bind = (field: string) => ({ "data-field": field, onFocus: () => focusField(field) })

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
            <AutoTextarea {...bind(`${k}:${i}`)} value={t} onChange={(e) => setItem(k, i, e.target.value)} rows={1} className={input} />
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
        <aside ref={asideRef} className="border-r border-border overflow-y-auto p-5 space-y-5 bg-muted/20">
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
            <AutoTextarea {...bind("resumen")} value={sections.resumen} onChange={(e) => set({ resumen: e.target.value })} rows={4} className={input} />
          </section>
          {List({ k: "que_funciono", label: "Lo que funcionó" })}
          {List({ k: "que_no_funciono", label: "Oportunidades de mejora" })}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Contexto del período</p>
            <AutoTextarea {...bind("contexto")} value={sections.contexto} onChange={(e) => set({ contexto: e.target.value })} rows={4} className={input} />
          </section>
          {List({ k: "siguientes_pasos", label: "Siguientes pasos", numbered: true })}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Nota de cierre (opcional)</p>
            <AutoTextarea {...bind("nota_cierre")} value={sections.nota_cierre} onChange={(e) => set({ nota_cierre: e.target.value })} rows={2} className={input} />
          </section>
          {report.data.campanas.length > 1 && (
            <TableEditor label="Tabla por campaña" field="tabla_campanas" onFocus={() => focusField("tabla_campanas")}
              rows={report.data.campanas.map((c) => ({ key: campaignKey(c), original: c.nombre, extra: c.canal !== "Meta Ads" ? c.canal : null }))}
              cfg={sections.tablas?.campanas ?? {}} onChange={(campanas) => set({ tablas: { ...sections.tablas, campanas } })} />
          )}
          {report.data.entregables.length > 0 && (
            <TableEditor label="Entregables del período" field="tabla_entregables" onFocus={() => focusField("tabla_entregables")}
              rows={report.data.entregables.map((e) => ({ key: deliverableKey(e), original: e.texto, extra: `${e.hecho}/${e.esperado}` }))}
              cfg={sections.tablas?.entregables ?? {}} onChange={(entregables) => set({ tablas: { ...sections.tablas, entregables } })} />
          )}
          <p className="text-[11px] text-muted-foreground">Los números de las tablas salen del dashboard: aquí solo cambias cómo se llaman o qué se muestra. Para corregir un número, corrígelo en su origen y usa &quot;Actualizar datos&quot;.</p>
        </aside>

        <div ref={previewRef} className="overflow-y-auto bg-neutral-200 dark:bg-neutral-800 py-6">
          <p className="text-center text-[11px] text-muted-foreground mb-2">Haz clic en cualquier texto del reporte para editarlo</p>
          <div className="shadow-lg max-w-[816px] mx-auto">
            <ReportDocument data={report.data} sections={sections} onPick={jumpToField} active={active} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Tabla que viene del dashboard: nombre más claro por fila, ocultar filas u
// ocultar la tabla completa. Los números no se tocan.
function TableEditor({ label, field, rows, cfg, onChange, onFocus }: {
  label: string; field: string
  rows: { key: string; original: string; extra: string | null }[]
  cfg: ReportTableConfig; onChange: (c: ReportTableConfig) => void; onFocus: () => void
}) {
  const hidden = new Set(cfg.ocultas ?? [])
  const setName = (k: string, v: string) => onChange({ ...cfg, nombres: { ...cfg.nombres, [k]: v } })
  const toggleRow = (k: string) => onChange({ ...cfg, ocultas: hidden.has(k) ? [...hidden].filter((x) => x !== k) : [...hidden, k] })
  return (
    <section data-field={field}>
      <div className="flex items-center mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">{label}</p>
        <button type="button" onClick={() => { onChange({ ...cfg, ocultar: !cfg.ocultar }); onFocus() }}
          className="text-[11px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          {cfg.ocultar ? <><EyeOff className="w-3.5 h-3.5" />Oculta en el reporte</> : <><Eye className="w-3.5 h-3.5" />Visible</>}
        </button>
      </div>
      {!cfg.ocultar && (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const off = hidden.has(r.key)
            const renamed = !!cfg.nombres?.[r.key]?.trim()
            return (
              <div key={r.key} className={cn("flex items-start gap-1.5", off && "opacity-50")}>
                <div className="flex-1 min-w-0">
                  <input value={cfg.nombres?.[r.key] ?? ""} onChange={(e) => setName(r.key, e.target.value)} onFocus={onFocus} disabled={off}
                    placeholder={r.original}
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-foreground/70" />
                  {(renamed || r.extra) && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground truncate">{renamed ? `Original: ${r.original}` : ""}{renamed && r.extra ? " · " : ""}{r.extra ?? ""}</p>
                  )}
                </div>
                {renamed && !off && (
                  <button type="button" onClick={() => setName(r.key, "")} title="Volver al nombre original" className="mt-1.5 text-muted-foreground hover:text-foreground"><RotateCcw className="w-3.5 h-3.5" /></button>
                )}
                <button type="button" onClick={() => toggleRow(r.key)} title={off ? "Mostrar fila" : "Ocultar fila"} className="mt-1.5 text-muted-foreground hover:text-foreground">
                  {off ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            )
          })}
          <p className="text-[10px] text-muted-foreground">Escribe un nombre más claro (vacío = el original). El ojo oculta la fila.</p>
        </div>
      )}
    </section>
  )
}
