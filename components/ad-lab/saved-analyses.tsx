"use client"

import { useMemo, useState } from "react"
import { Search, Trash2, ScanSearch, Film, ImageIcon, CalendarClock } from "lucide-react"
import { deleteSavedAnalysis, type SavedAnalysisRow, type LibraryAdInput } from "@/lib/actions/ad-analysis"
import { ConceptAnalysisModal } from "@/components/ad-lab/concept-analysis-modal"
import { ANGLE_GUIDE } from "@/lib/constants/creatives"
import { cn } from "@/lib/utils"

// Ad Lab → Análisis: todos los análisis de concepto guardados, por marca.
// Abrir uno es instantáneo (no vuelve a analizar).

export function SavedAnalyses({ initial, error }: { initial: SavedAnalysisRow[]; error: string | null }) {
  const [rows, setRows] = useState(initial)
  const [q, setQ] = useState("")
  const [brand, setBrand] = useState("")
  const [angle, setAngle] = useState("")
  const [open, setOpen] = useState<SavedAnalysisRow | null>(null)

  const brands = useMemo(() => [...new Set(rows.map((r) => r.pageName ?? "Sin marca"))].sort(), [rows])
  const angles = useMemo(() => [...new Set(rows.map((r) => r.analysis.concepto?.angle_type).filter(Boolean))].sort() as string[], [rows])
  const list = rows.filter((r) => {
    const a = r.analysis
    const hay = `${r.pageName} ${a.concepto?.nombre} ${a.resumen} ${a.gancho?.texto}`.toLowerCase()
    return (!q || hay.includes(q.toLowerCase())) && (!brand || (r.pageName ?? "Sin marca") === brand) && (!angle || a.concepto?.angle_type === angle)
  })

  async function remove(id: string) {
    if (!confirm("¿Borrar este análisis?")) return
    await deleteSavedAnalysis(id)
    setRows((xs) => xs.filter((x) => x.adArchiveId !== id))
  }

  const select = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
  const adOf = (r: SavedAnalysisRow): LibraryAdInput => r.analysis.ad ?? {
    adArchiveId: r.adArchiveId, pageId: null, pageName: r.pageName ?? "", body: null, title: null, caption: null, cta: null, linkUrl: null,
    videoUrl: null, imageUrl: null, isActive: false, startDate: null,
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2"><ScanSearch className="w-6 h-6 text-primary" />Análisis</h1>
          <p className="text-sm text-muted-foreground">Conceptos desarmados de anuncios de la librería. Se guardan solos al analizar desde Discovery o Boards.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar concepto, gancho…" className={cn(select, "pl-8 w-56")} />
          </div>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className={select}><option value="">Todas las marcas</option>{brands.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={angle} onChange={(e) => setAngle(e.target.value)} className={select}><option value="">Todos los ángulos</option>{angles.map((a) => <option key={a}>{a}</option>)}</select>
        </div>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && list.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {rows.length ? "Nada con esos filtros." : "Aún no hay análisis. Abre un anuncio en Discovery o en un Board y usa “Analizar concepto”."}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((r) => {
          const a = r.analysis
          const g = ANGLE_GUIDE.find((x) => x.name === a.concepto?.angle_type)
          return (
            <article key={r.adArchiveId} className="group rounded-xl border border-border bg-card hover:border-primary/40 transition-colors">
              <button onClick={() => setOpen(r)} className="w-full text-left p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {r.mediaType === "image" ? <ImageIcon className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                  <span className="truncate flex-1">{r.pageName ?? "Sin marca"}</span>
                  {a.diasCorriendo ? <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{a.diasCorriendo} d</span> : null}
                </div>
                <h3 className="font-semibold leading-snug line-clamp-2">{a.concepto?.nombre}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">{a.resumen}</p>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {a.concepto?.angle_type && <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{g?.emoji} {a.concepto.angle_type}</span>}
                  {a.concepto?.funnel_stage && <span className="px-1.5 py-0.5 rounded-full bg-muted">{a.concepto.funnel_stage}</span>}
                  {a.gancho?.tipo && <span className="px-1.5 py-0.5 rounded-full bg-muted">gancho: {a.gancho.tipo}</span>}
                </div>
              </button>
              <div className="px-4 pb-3 flex items-center text-[11px] text-muted-foreground">
                <span className="flex-1 truncate">{new Date(r.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}{r.by ? ` · ${r.by}` : ""}</span>
                <button onClick={() => remove(r.adArchiveId)} title="Borrar análisis" className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </article>
          )
        })}
      </div>

      {open && <ConceptAnalysisModal key={open.adArchiveId} open ad={adOf(open)} initial={open.analysis} onClose={() => setOpen(null)} />}
    </div>
  )
}
