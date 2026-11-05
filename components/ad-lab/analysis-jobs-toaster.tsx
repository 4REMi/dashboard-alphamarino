"use client"

import { useState, useSyncExternalStore } from "react"
import { Check, Loader2, X, AlertTriangle } from "lucide-react"
import { subscribeJobs, jobsVersion, backgroundJobs, runningInBackground, dismissJob } from "@/lib/ad-lab/analysis-jobs"
import { ConceptAnalysisModal } from "@/components/ad-lab/concept-analysis-modal"
import type { LibraryAdInput } from "@/lib/actions/ad-analysis"

// Avisos de análisis de concepto que siguen corriendo o terminaron con el
// modal cerrado (ver lib/ad-lab/analysis-jobs.ts). Montado en el layout.
export function AnalysisJobsToaster() {
  useSyncExternalStore(subscribeJobs, jobsVersion, () => 0)
  const [open, setOpen] = useState<{ ad: LibraryAdInput; mode: "library" | "asset" } | null>(null)
  const running = runningInBackground()
  const finished = backgroundJobs()
  if (!running.length && !finished.length && !open) return null
  const card = "pointer-events-auto rounded-xl border bg-background shadow-lg px-3 py-2.5 text-xs flex items-center gap-2 w-72"

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {running.map((j) => (
          <div key={j.id} className={card}>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0" />
            <span className="flex-1 min-w-0 truncate">Analizando concepto · {j.ad.pageName}</span>
            <button type="button" onClick={() => setOpen({ ad: j.ad, mode: j.mode })} className="font-medium text-violet-700 hover:underline dark:text-violet-300">Abrir</button>
          </div>
        ))}
        {finished.map((j) => (
          <div key={j.id} className={card}>
            {j.status === "done" ? <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
            <span className="flex-1 min-w-0 truncate">{j.status === "done" ? "Análisis listo" : "Falló el análisis"} · {j.ad.pageName}</span>
            <button type="button" onClick={() => setOpen({ ad: j.ad, mode: j.mode })} className="font-medium text-violet-700 hover:underline dark:text-violet-300">{j.status === "done" ? "Ver" : "Reintentar"}</button>
            <button type="button" onClick={() => dismissJob(j.id)} title="Descartar" className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      {open && <ConceptAnalysisModal key={open.ad.adArchiveId} open ad={open.ad} mode={open.mode} onClose={() => setOpen(null)} />}
    </>
  )
}
