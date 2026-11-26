"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ScanSearch } from "lucide-react"
import { getAuditAnalysisStatus, queueAuditAnalyses } from "@/lib/actions/ad-audits"
import type { AuditJobStatus } from "@/lib/ad-audit/analysis-jobs"

// Barra de «Analizar partes»: encola en el SERVIDOR los creativos elegidos
// (selección individual con las casillas de la tabla) y muestra el avance.
// El análisis sigue aunque se cierre la página (lib/ad-audit/analysis-jobs.ts).
export function AnalysisQueueBar({ campaignId, selected, selectable, onSelectAll, onClear, onStatus }: {
  campaignId: string
  selected: string[]
  selectable: number
  onSelectAll: () => void
  onClear: () => void
  onStatus: (s: AuditJobStatus) => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<AuditJobStatus | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastDone = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await getAuditAnalysisStatus(campaignId)
      setStatus(s)
      onStatus(s)
      // Cada vez que termina uno, recargar la tabla para ver sus partes.
      if (lastDone.current !== null && s.done + s.error > lastDone.current) router.refresh()
      lastDone.current = s.done + s.error
    } catch { /* sin conexión: se reintenta en el siguiente ciclo */ }
  }, [campaignId, onStatus, router])

  const active = (status?.queued ?? 0) + (status?.running ?? 0) > 0
  useEffect(() => {
    const first = setTimeout(refresh, 0)
    if (!active) return () => clearTimeout(first)
    const t = setInterval(refresh, 8000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [active, refresh])

  const send = async () => {
    setSending(true); setError(null)
    try {
      const r = await queueAuditAnalyses(campaignId, selected)
      if (r.queued === 0) setError("Esos creativos ya están analizados o en cola.")
      onClear()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo encolar")
    }
    setSending(false)
  }

  const minutes = Math.max(1, Math.round((selected.length * 1.2) / 2))
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {selectable > 0 && (
          <>
            <button onClick={onSelectAll} className="h-10 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">Seleccionar pendientes ({selectable})</button>
            {selected.length > 0 && <button onClick={onClear} className="h-10 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">Limpiar</button>}
          </>
        )}
        <button onClick={send} disabled={sending || selected.length === 0}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <ScanSearch className="h-4 w-4" />
          {sending ? "Encolando…" : selected.length ? `Analizar ${selected.length} seleccionado${selected.length === 1 ? "" : "s"} · ~${minutes} min` : "Marca los creativos a analizar"}
        </button>
      </div>
      {active && status && (
        <span className="text-xs text-muted-foreground">
          En cola {status.queued} · analizando {status.running} · listos {status.done}{status.error ? ` · ${status.error} con error` : ""} — sigue en el servidor aunque salgas de la página.
        </span>
      )}
      {!active && status && status.error > 0 && status.lastError && <span className="text-xs text-destructive">{status.error} no se pudieron analizar: {status.lastError}</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
