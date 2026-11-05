"use client"

import { analyzeLibraryAd, getSavedAdAnalysis, type LibraryAdAnalysis, type LibraryAdInput } from "@/lib/actions/ad-analysis"

// Análisis de concepto en segundo plano. Vive a nivel de módulo (no del
// modal), así que cerrar el modal no pierde el proceso: la promesa sigue,
// reabrir el mismo anuncio se engancha al trabajo en curso (no lanza otro)
// y, si terminó con el modal cerrado, <AnalysisJobsToaster/> avisa.

export type JobStatus = "running" | "done" | "error"
export interface AnalysisJob { id: string; ad: LibraryAdInput; mode: "library" | "asset"; status: JobStatus; result: LibraryAdAnalysis | null; error: string | null; notify: boolean }

const jobs = new Map<string, AnalysisJob>()
// Modales abiertos por anuncio (aparte de jobs: el modal se registra antes de que exista el trabajo).
const watchers = new Map<string, number>()
const watched = (id: string) => (watchers.get(id) ?? 0) > 0
const listeners = new Set<() => void>()
let version = 0
const emit = () => { version++; listeners.forEach((l) => l()) }

export function subscribeJobs(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }
export const jobsVersion = () => version
export const getJob = (id: string) => jobs.get(id) ?? null
export const backgroundJobs = () => [...jobs.values()].filter((j) => j.notify)

export function startAnalysis(ad: LibraryAdInput, force: boolean, mode: "library" | "asset" = "library"): AnalysisJob {
  const id = ad.adArchiveId
  const prev = jobs.get(id)
  if (prev?.status === "running") return prev
  const job: AnalysisJob = { id, ad, mode, status: "running", result: null, error: null, notify: false }
  jobs.set(id, job)
  emit()
  const p = force ? analyzeLibraryAd(ad) : getSavedAdAnalysis(id).then((saved) => saved ?? analyzeLibraryAd(ad))
  p.then((r) => { job.status = "done"; job.result = r })
    .catch((e) => { job.status = "error"; job.error = e instanceof Error ? e.message : String(e) })
    .finally(() => { if (jobs.get(id) === job && !watched(id)) job.notify = true; emit() })
  return job
}

export function watchJob(id: string) {
  watchers.set(id, (watchers.get(id) ?? 0) + 1)
  const j = jobs.get(id)
  if (j) j.notify = false
  emit()
}
export function unwatchJob(id: string) {
  watchers.set(id, Math.max(0, (watchers.get(id) ?? 0) - 1))
  emit()
}
export function dismissJob(id: string) {
  const j = jobs.get(id)
  if (j && j.status !== "running") jobs.delete(id)
  else if (j) j.notify = false
  emit()
}
export const runningInBackground = () => [...jobs.values()].filter((j) => j.status === "running" && !watched(j.id))
