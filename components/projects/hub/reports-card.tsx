"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileText, Plus, Loader2, X, Sparkles } from "lucide-react"
import { getReports, createReport } from "@/lib/actions/reports"
import type { PaidMediaCycle } from "@/lib/types"
import { formatCycleRange, cn } from "@/lib/utils"

// Reportes bajo demanda del proyecto: lista + "Generar reporte" (rango +
// notas del equipo → borrador con datos del dashboard y narrativa de IA).

type Row = Awaited<ReturnType<typeof getReports>>[number]

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

export function ReportsCard({ projectId, cycles }: { projectId: string; cycles: PaidMediaCycle[] }) {
  const [reports, setReports] = useState<Row[] | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { getReports(projectId).then(setReports) }, [projectId])

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Reportes</h3>
          <p className="text-xs text-muted-foreground">Bajo demanda, para cualquier rango. Datos del dashboard + narrativa editable.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium">
          <Plus className="w-3.5 h-3.5" />Generar reporte
        </button>
      </div>
      {!reports ? (
        <p className="px-5 py-4 text-xs text-muted-foreground">Cargando…</p>
      ) : reports.length === 0 ? (
        <p className="px-5 py-4 text-xs text-muted-foreground">Todavía no hay reportes.</p>
      ) : (
        <div className="divide-y divide-border">
          {reports.map((r) => (
            <Link key={r.id} href={`/projects/${projectId}/reportes/${r.id}`} className="px-5 py-2.5 flex items-center gap-3 hover:bg-muted/40">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{r.title ?? formatCycleRange(r.start_date, r.end_date)}</span>
                <span className="block text-[11px] text-muted-foreground">Creado {new Date(r.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}{r.delivered_at ? ` · entregado ${new Date(r.delivered_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}` : ""}</span>
              </span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", r.status === "delivered" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300")}>
                {r.status === "delivered" ? "Entregado" : "Borrador"}
              </span>
            </Link>
          ))}
        </div>
      )}
      {open && <GenerateDialog projectId={projectId} cycles={cycles} onClose={() => setOpen(false)} />}
    </div>
  )
}

function GenerateDialog({ projectId, cycles, onClose }: { projectId: string; cycles: PaidMediaCycle[]; onClose: () => void }) {
  const router = useRouter()
  const sorted = [...cycles].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
  const active = sorted.find((c) => c.is_active) ?? null
  const previous = sorted.find((c) => !c.is_active && (!active || c.start_date < active.start_date)) ?? null
  const t = today()
  const presets = [
    active && { key: "active", label: "Ciclo actual (a la fecha)", start: active.start_date, end: active.end_date < t ? active.end_date : t, cycleId: active.id },
    previous && { key: "prev", label: `Ciclo anterior (${formatCycleRange(previous.start_date, previous.end_date)})`, start: previous.start_date, end: previous.end_date, cycleId: previous.id },
    { key: "14", label: "Últimos 14 días", start: addDays(t, -14), end: addDays(t, -1), cycleId: null },
  ].filter(Boolean) as { key: string; label: string; start: string; end: string; cycleId: string | null }[]

  const [preset, setPreset] = useState(presets[0]?.key ?? "custom")
  const [start, setStart] = useState(presets[0]?.start ?? addDays(t, -14))
  const [end, setEnd] = useState(presets[0]?.end ?? t)
  const [cycleId, setCycleId] = useState<string | null>(presets[0]?.cycleId ?? null)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function pick(key: string) {
    setPreset(key)
    const p = presets.find((x) => x.key === key)
    if (p) { setStart(p.start); setEnd(p.end); setCycleId(p.cycleId) } else setCycleId(null)
  }

  function generate() {
    setError(null)
    startTransition(async () => {
      try {
        const id = await createReport(projectId, { start, end, notes, cycleId })
        router.push(`/projects/${projectId}/reportes/${id}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="bg-card rounded-xl border border-border w-full max-w-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Generar reporte</h3>
          <button onClick={onClose} disabled={isPending} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Período</p>
          <div className="flex flex-wrap gap-1.5">
            {[...presets, { key: "custom", label: "Personalizado" }].map((p) => (
              <button key={p.key} onClick={() => pick(p.key)} className={cn("text-xs px-2.5 py-1 rounded-full border", preset === p.key ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{p.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPreset("custom"); setCycleId(null) }} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
            <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPreset("custom"); setCycleId(null) }} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notas del equipo</p>
          <p className="text-[11px] text-muted-foreground mb-1.5">Lo que el dashboard no sabe: qué dijo el cliente, calidad de leads, inbox, decisiones tomadas. Opcional.</p>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Ej. En llamada, el cliente confirmó que ya hay membresías pagadas por los anuncios; muchas preguntas desde los suburbios…" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          {isPending && <span className="text-xs text-muted-foreground mr-auto inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Juntando datos y escribiendo el borrador…</span>}
          <button onClick={onClose} disabled={isPending} className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
          <button onClick={generate} disabled={isPending || !start || !end} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
            <Sparkles className="w-4 h-4" />Generar borrador
          </button>
        </div>
      </div>
    </div>
  )
}
