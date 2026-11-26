"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { hasSavedAdAnalysis } from "@/lib/actions/ad-analysis"
import { getJob, jobsVersion, subscribeJobs } from "@/lib/ad-lab/analysis-jobs"

// Estado del análisis de concepto de un anuncio, para el botón del detalle:
//   "analyzed"  → ya hay análisis guardado (abrirlo no vuelve a cobrar)
//   "running"   → se está analizando (aunque el modal esté cerrado)
//   "none"      → nunca se ha analizado (o aún no se sabe)
// Combina la consulta a ad_analyses con los trabajos en curso de
// lib/ad-lab/analysis-jobs.ts, así cambia en vivo al terminar.
export type ConceptAnalysisStatus = "none" | "running" | "analyzed"

export function useConceptAnalysisStatus(adArchiveId: string | null): ConceptAnalysisStatus {
  const [saved, setSaved] = useState<{ id: string; value: boolean } | null>(null)
  useSyncExternalStore(subscribeJobs, jobsVersion, jobsVersion)
  const job = adArchiveId ? getJob(adArchiveId) : null

  useEffect(() => {
    if (!adArchiveId) return
    let alive = true
    hasSavedAdAnalysis(adArchiveId)
      .then((value) => { if (alive) setSaved({ id: adArchiveId, value }) })
      .catch(() => {})
    return () => { alive = false }
    // Volver a consultar cuando un trabajo de este anuncio termina (p. ej. se
    // borró y se re-analizó, o falló).
  }, [adArchiveId, job?.status])

  if (!adArchiveId) return "none"
  if (job?.status === "running") return "running"
  if (job?.status === "done") return "analyzed"
  return saved?.id === adArchiveId && saved.value ? "analyzed" : "none"
}
